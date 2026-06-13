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
  // host-specific: id del participante "host" (para marcar su propio consumo)
  hostParticipantId?: string
  // participant-specific
  participantId?: string
  participantName?: string
}

const KEY = 'apagar_sessions_v2'

export function saveLocalSession(entry: LocalSessionEntry): void {
  if (typeof window === 'undefined') return
  const all = getLocalSessions()
  // Fusiona con la entrada previa: un guardado parcial (p. ej. el panel del host
  // refrescando nombre/estado) NO debe perder campos críticos como hostToken o
  // hostParticipantId. Sin esto, con la migración 008 el host quedaría sin token
  // y no podría confirmar pagos ni cerrar la boleta.
  const prev = all.find(e => e.id === entry.id)
  const merged: LocalSessionEntry = { ...prev, ...entry }
  const rest = all.filter(e => e.id !== entry.id)
  localStorage.setItem(KEY, JSON.stringify([merged, ...rest].slice(0, 60)))
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
