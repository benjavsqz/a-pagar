'use client'
import type { PresenceUser } from '@/hooks/use-presence'

const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase()

/**
 * Burbujas de presencia estilo Google Docs: avatares circulares con la inicial
 * de cada persona conectada a la boleta ahora mismo.
 */
export function PresenceBubbles({ people, max = 5 }: { people: PresenceUser[]; max?: number }) {
  if (people.length === 0) return null
  const shown = people.slice(0, max)
  const extra = people.length - shown.length

  const label =
    people.length === 1 ? 'Estás aquí'
    : `${people.length} conectados`

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
          <span className="w-7 h-7 rounded-full grid place-items-center text-[10px] font-bold text-[#6f6155] bg-[var(--surface-2)] ring-2 ring-white">
            +{extra}
          </span>
        )}
      </div>
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#6f6155]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#0bb673] animate-pulse" />
        {label}
      </span>
    </div>
  )
}
