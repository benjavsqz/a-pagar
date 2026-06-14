'use client'
import { useEffect, useState } from 'react'
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

// Paleta de avatares — colores legibles con texto blanco, estables por nombre.
const AVATAR_COLORS = [
  '#0bb673', '#ff6a45', '#7c6cf0', '#0ea5e9', '#e0a106',
  '#e5484d', '#14b8a6', '#d6409f', '#8b5cf6', '#0a6f47',
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
    const channel = supabase.channel(`presence:${sessionId}`, {
      config: { presence: { key: meKey } },
    })

    const sync = () => {
      const state = channel.presenceState<{ name: string; role: 'host' | 'participant' }>()
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

    channel
      .on('presence', { event: 'sync' }, sync)
      .subscribe(status => {
        if (status === 'SUBSCRIBED') channel.track({ name: myName, role: myRole })
      })

    return () => { supabase.removeChannel(channel) }
  }, [sessionId, meKey, myName, myRole])

  return people
}
