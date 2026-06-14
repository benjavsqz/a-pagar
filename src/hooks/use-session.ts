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
  // Guard de concurrencia: varias fuentes disparan load() (poll, focus, broadcast,
  // RPCs). Sin esto, una respuesta lenta y vieja puede pisar a una nueva.
  const loadSeq = useRef(0)
  // Firma del último data aplicado, para no re-renderizar si nada cambió (el poll
  // recarga aunque no haya novedades).
  const lastSig = useRef<string>('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const seq = ++loadSeq.current

    // claims.session_id existe desde la 005 → una sola tanda de 5 queries en
    // paralelo, sin la query previa de itemIds (N+1 eliminado).
    const [sessionRes, itemsRes, participantsRes, claimsRes, paymentsRes] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).single(),
      supabase.from('items').select('*').eq('session_id', sessionId).order('position'),
      supabase.from('participants').select('*').eq('session_id', sessionId).order('created_at'),
      supabase.from('claims').select('*').eq('session_id', sessionId),
      supabase.from('payments').select('*').eq('session_id', sessionId),
    ])

    // Descartar si llegó una carga más nueva mientras esperábamos la red.
    if (seq !== loadSeq.current) return
    if (sessionRes.error) { setError('Sesión no encontrada'); setLoading(false); return }

    const next: SessionWithData = {
      session: sessionRes.data as Session,
      items: (itemsRes.data ?? []) as Item[],
      participants: (participantsRes.data ?? []) as Participant[],
      claims: (claimsRes.data ?? []) as Claim[],
      payments: (paymentsRes.data ?? []) as Payment[],
    }

    // Diff: si el snapshot es idéntico al anterior, no tocar el estado (evita
    // re-render de toda la lista cada vez que el poll trae lo mismo).
    const sig = JSON.stringify(next)
    if (sig === lastSig.current) { setLoading(false); return }
    lastSig.current = sig
    setData(next)
    setLoading(false)
  }, [sessionId])

  useEffect(() => {
    // Falso positivo del linter: load() es async — sus setState ocurren después
    // de los await (callbacks de red), nunca sincrónicamente dentro del efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    const supabase = createClient()

    // Broadcast (no postgres_changes): cada cliente que cambia algo emite "sync"
    // y los demás recargan. self:false → quien emite no se recarga a sí mismo.
    // Debounce: si llegan varios "sync" seguidos (mesa activa), coalescemos en
    // una sola recarga para no martillar la DB.
    let syncTimer: ReturnType<typeof setTimeout> | null = null
    const debouncedLoad = () => {
      if (syncTimer) return
      syncTimer = setTimeout(() => { syncTimer = null; load() }, 600)
    }
    const channel = supabase.channel(`rt:${sessionId}`, { config: { broadcast: { self: false } } })
    channel.on('broadcast', { event: 'sync' }, debouncedLoad).subscribe()
    channelRef.current = channel

    // Red de seguridad: el broadcast es "fire-and-forget" y se pierde si el
    // websocket se suspende (pestaña en segundo plano / pantalla apagada en
    // móvil) o la red falla. Refrescamos al volver a la pestaña y con un poll
    // lento (el broadcast cubre la inmediatez; esto es solo respaldo). El diff
    // en load() evita re-render si no cambió nada.
    const refresh = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    const poll = setInterval(refresh, 15000)

    return () => {
      channelRef.current = null
      if (syncTimer) clearTimeout(syncTimer)
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
      clearInterval(poll)
    }
  }, [sessionId, load])

  // Avisa a los demás clientes que hubo un cambio. Solo si el canal ya está
  // conectado (si no, el send se descarta en silencio; el poll de respaldo cubre).
  const notifyChange = useCallback(() => {
    const ch = channelRef.current
    if (ch && ch.state === 'joined') ch.send({ type: 'broadcast', event: 'sync', payload: {} })
  }, [])

  // Optimistic add: update local state immediately, then persist
  const addClaim = useCallback(async (itemId: string, participantId: string) => {
    const optimistic: Claim = {
      id: `opt-${itemId}-${participantId}`,
      session_id: sessionId,
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
  }, [notifyChange, sessionId])

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
