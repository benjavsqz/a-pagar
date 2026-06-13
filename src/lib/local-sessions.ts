export type LocalSessionRole = 'host' | 'participant'

export interface LocalSessionEntry {
  id: string
  role: LocalSessionRole
  restaurantName: string | null
  hostName: string | null
  splitMode: 'items' | 'equal'
  createdAt: string
  // host-specific: token secreto para confirmar pagos / cerrar la boleta
  hostToken?: string
  // participant-specific
  participantId?: string
  participantName?: string
}

const KEY = 'apagar_sessions_v2'

export function saveLocalSession(entry: LocalSessionEntry): void {
  if (typeof window === 'undefined') return
  const existing = getLocalSessions().filter(e => e.id !== entry.id)
  localStorage.setItem(KEY, JSON.stringify([entry, ...existing].slice(0, 60)))
}

export function getLocalSessions(): LocalSessionEntry[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function getLocalSession(id: string): LocalSessionEntry | null {
  return getLocalSessions().find(s => s.id === id) ?? null
}

export function removeLocalSession(id: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(getLocalSessions().filter(s => s.id !== id)))
}
