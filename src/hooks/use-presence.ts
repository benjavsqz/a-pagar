'use client'
import { useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

export interface PresenceUser {
  name: string
  role: 'host' | 'participant'
  color: string
  /** true si es el propio usuario (para marcar "tú") */
  self?: boolean
}

interface Me {
  name: string
  role: 'host' | 'participant'
}

// Paleta de avatares — todos pasan contraste AA (≥4.5:1) con texto blanco,
// estables por nombre. (Antes la mayoría fallaba AA; audits/08.)
const AVATAR_COLORS = [
  '#0a6f47', '#c2410c', '#6d28d9', '#0369a1', '#b45309',
  '#be123c', '#0f766e', '#be185d', '#4338ca', '#15803d',
]
export function colorForName(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

/**
 * Presencia en vivo estilo Google Docs: quién está viendo la boleta ahora.
 * Usa Realtime Presence (no postgres_changes), que sí funciona en este proyecto.
 * `me` puede ser null hasta que se conozca la identidad (recién ahí se trackea).
 */
export function usePresence(sessionId: string, me: Me | null): PresenceUser[] {
  const [people, setPeople] = useState<PresenceUser[]>([])
  // Dependemos de primitivos (no del objeto `me`, que se recrea cada render y
  // haría re-suscribir el canal en bucle, impidiendo que la presencia se asiente).
  const myName = me?.name ?? null
  const myRole = me?.role ?? null
  const meKey = myName && myRole ? `${myRole}:${myName}` : null

  useEffect(() => {
    if (!meKey || !myName || !myRole) return
    const supabase = createClient()

    // Mismo problema de resiliencia que use-session: el websocket cae en móviles
    // y el callback original solo manejaba SUBSCRIBED, dejando la presencia
    // "congelada" tras una caída. Reconectamos con backoff acotado y re-trackeamos
    // al reconectar para volver a aparecer en la lista de los demás.
    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let attempt = 0
    const MAX_BACKOFF = 30000
    let channel: RealtimeChannel | null = null

    const sync = (ch: RealtimeChannel) => {
      const state = ch.presenceState<{ name: string; role: 'host' | 'participant' }>()
      const seen = new Set<string>()
      const list: PresenceUser[] = []
      for (const metas of Object.values(state)) {
        const m = metas[0]
        if (!m) continue
        const id = `${m.role}:${m.name}`
        if (seen.has(id)) continue
        seen.add(id)
        list.push({ name: m.name, role: m.role, color: colorForName(m.name), self: id === meKey })
      }
      // Anfitrión primero, luego por nombre
      list.sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'host' ? -1 : 1))
      setPeople(list)
    }

    const subscribe = () => {
      if (disposed) return
      if (channel) supabase.removeChannel(channel)
      const ch = supabase.channel(`presence:${sessionId}`, {
        config: { presence: { key: meKey } },
      })
      channel = ch
      ch
        .on('presence', { event: 'sync' }, () => sync(ch))
        .subscribe(status => {
          if (disposed) return
          if (status === 'SUBSCRIBED') {
            attempt = 0
            ch.track({ name: myName, role: myRole })
            return
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            if (retryTimer) return
            const base = Math.min(1000 * 2 ** attempt, MAX_BACKOFF)
            const delay = base / 2 + Math.random() * (base / 2)
            attempt++
            retryTimer = setTimeout(() => { retryTimer = null; subscribe() }, delay)
          }
        })
    }
    subscribe()

    return () => {
      disposed = true
      if (retryTimer) clearTimeout(retryTimer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [sessionId, meKey, myName, myRole])

  return people
}
