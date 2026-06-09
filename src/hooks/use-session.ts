'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Session, Item, Participant, Claim, Payment, SessionWithData } from '@/types'

export function useSession(sessionId: string) {
  const [data, setData] = useState<SessionWithData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    load()
    const supabase = createClient()

    const channel = supabase
      .channel(`session:${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'claims' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => load())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sessionId, load])

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
    }
  }, [])

  // Optimistic remove: update local state immediately, then persist
  const removeClaim = useCallback(async (itemId: string, participantId: string) => {
    setData(prev => prev
      ? { ...prev, claims: prev.claims.filter(c => !(c.item_id === itemId && c.participant_id === participantId)) }
      : prev
    )

    const supabase = createClient()
    const { error } = await supabase
      .from('claims')
      .delete()
      .eq('item_id', itemId)
      .eq('participant_id', participantId)

    if (error) {
      load()  // Rollback by reloading
      console.error('Error removing claim:', error.message)
    }
  }, [load])

  const confirmPayment = useCallback(async (participantId: string) => {
    const supabase = createClient()
    await supabase.from('payments')
      .update({ confirmed_by_host: true })
      .eq('session_id', sessionId)
      .eq('participant_id', participantId)
  }, [sessionId])

  return { data, loading, error, refetch: load, addClaim, removeClaim, confirmPayment }
}
