'use client'
import type { PresenceUser } from '@/hooks/use-presence'
import { colorForName } from '@/hooks/use-presence'
import type { Participant } from '@/types'

const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase()
const firstName = (name: string) => name.split(' ')[0]

/**
 * Burbujas de presencia estilo Google Docs: avatares circulares con la inicial
 * de cada persona conectada a la boleta ahora mismo.
 */
export function PresenceBubbles({ people, max = 5 }: { people: PresenceUser[]; max?: number }) {
  if (people.length === 0) return null
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  const label = people.length === 1 ? 'Estás aquí' : `${people.length} conectados`

  return (
    <div className="flex items-center gap-2" aria-label={`${people.length} personas viendo la boleta`}>
      <div className="flex -space-x-2">
        {shown.map((p, i) => (
          <span
            key={`${p.role}:${p.name}`}
            title={p.self ? `${p.name} (tú)` : p.name}
            className="w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold text-white ring-2 ring-white shadow-sm select-none"
            style={{ background: p.color, zIndex: shown.length - i }}
          >
            {initial(p.name)}
          </span>
        ))}
        {extra > 0 && (
          <span className="w-7 h-7 rounded-full grid place-items-center text-[10px] font-bold text-[var(--text-2)] bg-[var(--surface-2)] ring-2 ring-white">
            +{extra}
          </span>
        )}
      </div>
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-2)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#0bb673] animate-pulse" />
        {label}
      </span>
    </div>
  )
}

/**
 * Leyenda de participantes: descifra las iniciales que aparecen en cada ítem.
 * Un chip por persona = inicial de color (igual que en el ítem) + nombre, con
 * "(tú)" y un punto verde "en vivo" para quien está conectado ahora.
 */
export function ParticipantsLegend({
  participants, meId, presentNames = [],
}: {
  participants: Participant[]
  meId?: string
  presentNames?: string[]
}) {
  if (participants.length === 0) return null
  const present = new Set(presentNames.map(n => n.toLowerCase()))

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Participantes de la boleta">
      {participants.map(p => {
        const isMe = p.id === meId
        const live = present.has(p.name.toLowerCase())
        return (
          <span
            key={p.id}
            className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-[var(--surface)] border border-[var(--border)] shadow-[0_1px_2px_rgba(120,80,50,0.05)]"
          >
            <span
              className="w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold text-white select-none"
              style={{ background: colorForName(p.name) }}
            >
              {initial(p.name)}
            </span>
            <span className="text-xs font-semibold text-[var(--text-1)] leading-none">
              {firstName(p.name)}{isMe ? ' · tú' : ''}
            </span>
            {live && <span className="w-1.5 h-1.5 rounded-full bg-[#0bb673] animate-pulse" title="conectado" />}
          </span>
        )
      })}
    </div>
  )
}
