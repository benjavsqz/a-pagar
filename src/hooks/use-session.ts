'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { getLocalSession } from '@/lib/local-sessions'
import type { Session, Item, Participant, Claim, Payment, SessionWithData } from '@/types'

export function useSession(sessionId: string) {
  const [data, setData] = useState<SessionWithData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Canal de Broadcast: postgres_changes no entrega eventos en este proyecto,
  // así que sincronizamos con un mensaje "sync" que emite quien escribe.
  const channelRef = useRef<RealtimeChannel | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()

    const itemsForClaims = await supabase
      .from('items')
      .select('id')
      .eq('session_id', sessionId)

    const itemIds = itemsForClaims.data?.map(i => i.id) ?? []

    const [sessionRes, itemsRes, participantsRes, claimsRes, paymentsRes] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).single(),
      supabase.from('items').select('*').eq('session_id', sessionId).order('position'),
      supabase.from('participants').select('*').eq('session_id', sessionId).order('created_at'),
      itemIds.length > 0
        ? supabase.from('claims').select('*').in('item_id', itemIds)
        : Promise.resolve({ data: [] as Claim[], error: null }),
      supabase.from('payments').select('*').eq('session_id', sessionId),
    ])

    if (sessionRes.error) { setError('Sesión no encontrada'); setLoading(false); return }

    setData({
      session: sessionRes.data as Session,
      items: (itemsRes.data ?? []) as Item[],
      participants: (participantsRes.data ?? []) as Participant[],
      claims: (claimsRes.data ?? []) as Claim[],
      payments: (paymentsRes.data ?? []) as Payment[],
    })
    setLoading(false)
  }, [sessionId])

  useEffect(() => {
    // Falso positivo del linter: load() es async — sus setState ocurren después
    // de los await (callbacks de red), nunca sincrónicamente dentro del efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    const supabase = createClient()

    // Broadcast (no postgres_changes): cada cliente que cambia algo emite "sync"
    // y los demás recargan. self:false → quien emite no se recarga a sí mismo
    // (ya hizo su update optimista).
    const channel = supabase.channel(`rt:${sessionId}`, { config: { broadcast: { self: false } } })
    channel.on('broadcast', { event: 'sync' }, () => load()).subscribe()
    channelRef.current = channel

    // Red de seguridad: el broadcast es "fire-and-forget" y se pierde si el
    // websocket se suspende (pestaña en segundo plano / pantalla apagada en
    // móvil) o la red falla. Garantizamos consistencia eventual refrescando al
    // volver a la pestaña y con un poll suave mientras está visible.
    const refresh = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    const poll = setInterval(refresh, 4000)

    return () => {
      channelRef.current = null
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
      clearInterval(poll)
    }
  }, [sessionId, load])

  // Avisa a los demás clientes que hubo un cambio en la boleta.
  const notifyChange = useCallback(() => {
    channelRef.current?.send({ type: 'broadcast', event: 'sync', payload: {} })
  }, [])

  // Optimistic add: update local state immediately, then persist
  const addClaim = useCallback(async (itemId: string, participantId: string) => {
    const optimistic: Claim = {
      id: `opt-${itemId}-${participantId}`,
      item_id: itemId,
      participant_id: participantId,
      created_at: new Date().toISOString(),
    }

    setData(prev => prev ? { ...prev, claims: [...prev.claims, optimistic] } : prev)

    const supabase = createClient()
    const { error } = await supabase
      .from('claims')
      .insert({ item_id: itemId, participant_id: participantId })

    if (error) {
      // Rollback optimistic update
      setData(prev => prev
        ? { ...prev, claims: prev.claims.filter(c => c.id !== optimistic.id) }
        : prev
      )
      console.error('Error adding claim:', error.message)
    } else {
      notifyChange()
    }
  }, [notifyChange])

  // Optimistic remove: update local state immediately, then persist
  const removeClaim = useCallback(async (itemId: string, participantId: string) => {
    // Guardamos los claims que vamos a quitar para poder restaurarlos exactos si
    // el delete falla, sin un load() que pisaría otro estado optimista en vuelo.
    let removed: Claim[] = []
    setData(prev => {
      if (!prev) return prev
      removed = prev.claims.filter(c => c.item_id === itemId && c.participant_id === participantId)
      return { ...prev, claims: prev.claims.filter(c => !(c.item_id === itemId && c.participant_id === participantId)) }
    })

    const supabase = createClient()
    const { error } = await supabase
      .from('claims')
      .delete()
      .eq('item_id', itemId)
      .eq('participant_id', participantId)

    if (error) {
      setData(prev => prev ? { ...prev, claims: [...prev.claims, ...removed] } : prev)
      console.error('Error removing claim:', error.message)
    } else {
      notifyChange()
    }
  }, [notifyChange])

  const confirmPayment = useCallback(async (participantId: string): Promise<string | null> => {
    const supabase = createClient()
    const hostToken = getLocalSession(sessionId)?.hostToken ?? null

    // Vía segura y única: RPC que valida el token de anfitrión (migraciones 005/008).
    // Sin token válido no se confirma — el modo legacy directo se eliminó por
    // permitir confirmar pagos ajenos (audits/01-seguridad.md, hallazgo crítico).
    const { error: rpcError } = await supabase.rpc('confirm_payment', {
      p_session_id: sessionId,
      p_participant_id: participantId,
      p_token: hostToken,
    })
    if (rpcError) return rpcError.message

    // Optimistic local update so UI reflects immediately
    setData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        payments: prev.payments.map(p =>
          p.participant_id === participantId ? { ...p, confirmed_by_host: true } : p
        ),
      }
    })

    // Also force a reload to sync any other changes
    await load()
    notifyChange()
    return null
  }, [sessionId, load, notifyChange])

  const closeSession = useCallback(async (): Promise<string | null> => {
    const supabase = createClient()
    const hostToken = getLocalSession(sessionId)?.hostToken ?? null

    const { error: rpcError } = await supabase.rpc('close_session', {
      p_session_id: sessionId,
      p_token: hostToken,
    })
    if (rpcError) return rpcError.message

    setData(prev => prev
      ? { ...prev, session: { ...prev.session, status: 'closed' } }
      : prev
    )
    await load()
    notifyChange()
    return null
  }, [sessionId, load, notifyChange])

  return { data, loading, error, refetch: load, addClaim, removeClaim, confirmPayment, closeSession, notifyChange }
}
