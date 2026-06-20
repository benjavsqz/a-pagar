'use client'
import { useMemo, useState } from 'react'
import { CheckCircle2, Circle, Minus, Plus, Split } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import { colorForName } from '@/hooks/use-presence'
import type { Item, Claim, Participant } from '@/types'

// Mini-avatares con la inicial de cada persona que marcó el ítem (en vivo).
function ClaimerAvatars({ people, divide }: { people: Participant[]; divide?: number }) {
  if (people.length === 0) return null
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <span className="sr-only">Marcado por {people.map(p => p.name).join(', ')}</span>
      <div className="flex -space-x-1.5" aria-hidden="true">
        {people.map(p => (
          <span
            key={p.id}
            title={p.name}
            className="w-5 h-5 rounded-full grid place-items-center text-[9px] font-bold text-white ring-[1.5px] ring-white select-none"
            style={{ background: colorForName(p.name) }}
          >
            {(p.name.trim()[0] ?? '?').toUpperCase()}
          </span>
        ))}
      </div>
      {divide && divide > 1 ? (
        <span className="text-[11px] font-semibold text-[var(--text-2)]">÷{divide}</span>
      ) : null}
    </div>
  )
}

interface ItemsClaimListProps {
  items: Item[]
  claims: Claim[]
  participants: Participant[]
  /** Participante que está marcando (invitado o el propio host). */
  meId: string
  /** Si la boleta está abierta (permite tomar/invitar). */
  open?: boolean
  addClaim: (itemId: string, participantId: string) => void | Promise<void>
  removeClaim: (itemId: string, participantId: string) => void | Promise<void>
}

interface Group { name: string; units: Item[] }

export function ItemsClaimList({
  items, claims, participants, meId, open = true, addClaim, removeClaim,
}: ItemsClaimListProps) {
  // Qué ítems simples están en vista "dividir" (estado local de quien marca).
  // Un ítem compartido por ≥2 personas se muestra dividido siempre.
  const [splitOpen, setSplitOpen] = useState<Set<string>>(new Set())
  const toggleSplit = (id: string) =>
    setSplitOpen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const myClaimedItemIds = useMemo(
    () => new Set(claims.filter(c => c.participant_id === meId).map(c => c.item_id)),
    [claims, meId]
  )
  const firstName = (id: string) =>
    (participants.find(p => p.id === id)?.name ?? '').split(' ')[0]

  const groups: Group[] = useMemo(
    () => Object.values(
      items.reduce((map, item) => {
        if (!map[item.name]) map[item.name] = { name: item.name, units: [] }
        map[item.name].units.push(item)
        return map
      }, {} as Record<string, Group>)
    ),
    [items]
  )

  return (
    <div className="space-y-2 stagger">
      {groups.map(({ name, units }) => {
        const isMulti = units.length > 1

        // ── Ítem multi-unidad (cantidad > 1): stepper + chips por unidad ──────
        if (isMulti) {
          const unitPrice = units[0].price
          const isMine = units.some(u => myClaimedItemIds.has(u.id))
          const myCount = units.filter(u => myClaimedItemIds.has(u.id)).length
          const freeCount = units.filter(u => !claims.some(c => c.item_id === u.id)).length

          const handleAdd = () => {
            const freeUnit = units.find(u => !claims.some(c => c.item_id === u.id))
            if (freeUnit) addClaim(freeUnit.id, meId)
          }
          const handleRemoveOne = () => {
            const myUnit = units.find(u => myClaimedItemIds.has(u.id))
            if (myUnit) removeClaim(myUnit.id, meId)
          }

          return (
            <div
              key={name}
              className={`w-full text-left p-3.5 rounded-2xl border transition-[transform,background-color,border-color,color] ${
                isMine ? 'bg-[#0bb673]/10 border-[#0bb673]/40' : 'bg-[var(--surface)] border-[var(--fill)]'
              }`}
            >
              <div className="flex items-center gap-3">
                {isMine
                  ? <CheckCircle2 className="w-5 h-5 text-[var(--brand-ink)] shrink-0 check-pop" />
                  : <Circle className="w-5 h-5 text-[var(--text-2)] shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isMine ? 'text-[var(--text)]' : 'text-[var(--text-1)]'}`}>{name}</p>
                  <p className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] font-semibold bg-[var(--line)] text-[var(--text-2)] px-1.5 py-0.5 rounded-full shrink-0">×{units.length}</span>
                    <span className={`text-xs font-bold truncate ${isMine ? 'text-[var(--brand-ink)]' : 'text-[var(--text-2)]'}`}>{formatCLP(unitPrice)} c/u</span>
                  </p>
                </div>
                <div className="flex items-center bg-[var(--fill)] border border-[var(--line)] rounded-lg shrink-0">
                    <button
                      onClick={handleRemoveOne}
                      disabled={myCount === 0}
                      aria-label="Quitar uno"
                      className="w-10 h-10 flex items-center justify-center text-[var(--text-2)] hover:text-[var(--text)] disabled:opacity-20 transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className={`w-5 text-center text-xs font-bold tabular-nums select-none ${myCount > 0 ? 'text-[var(--brand-ink)]' : 'text-[var(--text-2)]'}`}>{myCount}</span>
                    <button
                      onClick={handleAdd}
                      disabled={freeCount === 0 || !open}
                      aria-label="Agregar uno"
                      className="w-10 h-10 flex items-center justify-center text-[var(--text-2)] hover:text-[var(--brand-ink)] disabled:opacity-20 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5 ml-8">
                {units.map((unit, idx) => {
                  const unitClaims = claims.filter(c => c.item_id === unit.id)
                  const unitClaimers = unitClaims
                    .map(c => participants.find(p => p.id === c.participant_id))
                    .filter((p): p is Participant => !!p)
                  const isMyUnit = myClaimedItemIds.has(unit.id)

                  // Slot libre — chip punteado
                  if (unitClaimers.length === 0) {
                    return (
                      <span
                        key={unit.id}
                        className="text-xs px-2.5 py-1 rounded-full font-medium border border-dashed border-[var(--line-2)] text-[var(--text-2)]"
                      >
                        Libre {idx + 1}
                      </span>
                    )
                  }

                  // Slot tomado — mismo formato que la leyenda: burbuja inicial + nombre
                  return (
                    <span
                      key={unit.id}
                      className={`inline-flex items-center gap-1.5 pl-1 pr-2.5 py-0.5 rounded-full border ${
                        isMyUnit ? 'bg-[#0bb673]/12 border-[#0bb673]/35' : 'bg-[var(--surface)] border-[var(--border)]'
                      }`}
                    >
                      <span className="flex -space-x-1.5">
                        {unitClaimers.map(p => (
                          <span
                            key={p.id}
                            className="w-4 h-4 rounded-full grid place-items-center text-[8px] font-bold text-white ring-[1.5px] ring-white select-none"
                            style={{ background: colorForName(p.name) }}
                          >
                            {(p.name.trim()[0] ?? '?').toUpperCase()}
                          </span>
                        ))}
                      </span>
                      <span className={`text-xs font-semibold leading-none ${isMyUnit ? 'text-[var(--brand-ink)]' : 'text-[var(--text-1)]'}`}>
                        {unitClaimers.map(p => (p.id === meId ? 'Tú' : p.name.split(' ')[0])).join(' + ')}
                      </span>
                    </span>
                  )
                })}
              </div>
            </div>
          )
        }

        // ── Ítem simple (1 unidad): toca para tomar + "Dividir" en ÷N ─────────
        const item = units[0]
        const itemClaims = claims.filter(c => c.item_id === item.id)
        const claimers = participants.filter(p => itemClaims.some(c => c.participant_id === p.id))
        const isMine = myClaimedItemIds.has(item.id)
        const shared = itemClaims.length > 1
        const pricePer = itemClaims.length > 0 ? Math.ceil(item.price / itemClaims.length) : item.price
        // Vista dividida: si la abriste o si ya lo comparten 2+ personas.
        const splitView = splitOpen.has(item.id) || shared

        const toggleMine = () => {
          if (isMine) removeClaim(item.id, meId)
          else addClaim(item.id, meId)
        }

        return (
          <div
            key={item.id}
            className={`w-full rounded-2xl border transition-[transform,background-color,border-color,color] ${
              isMine ? 'bg-[#0bb673]/10 border-[#0bb673]/40' : 'bg-[var(--surface)] border-[var(--fill)]'
            }`}
          >
            <div className="flex items-center gap-2 p-3.5">
              <button
                onClick={toggleMine}
                disabled={!open}
                role="checkbox"
                aria-checked={isMine}
                aria-label={`${item.name}, ${formatCLP(pricePer)}${isMine ? ' — marcado por ti' : ''}`}
                className="flex items-center gap-3 flex-1 min-w-0 text-left active:scale-95 transition-transform disabled:active:scale-100"
              >
                {isMine
                  ? <CheckCircle2 className="w-5 h-5 text-[var(--brand-ink)] shrink-0 check-pop" />
                  : <Circle className="w-5 h-5 text-[var(--text-2)] shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isMine ? 'text-[var(--text)]' : 'text-[var(--text-1)]'}`}>{item.name}</p>
                  {/* Quién lo está marcando — visible para todos. Se oculta solo si
                      eres tú solo (el check verde ya lo indica). */}
                  {!(itemClaims.length === 1 && isMine) && (
                    <ClaimerAvatars people={claimers} divide={shared ? itemClaims.length : undefined} />
                  )}
                </div>
              </button>
              <div className="text-right shrink-0">
                <p className={`text-sm font-bold ${isMine ? 'text-[var(--brand-ink)]' : 'text-[var(--text-2)]'}`}>{formatCLP(pricePer)}</p>
                {shared && <p className="text-xs text-[var(--text-2)]">de {formatCLP(item.price)}</p>}
              </div>
              {/* Botón Dividir — al costado */}
              <button
                onClick={() => toggleSplit(item.id)}
                aria-label="Dividir este ítem entre varias personas"
                aria-pressed={splitView}
                className={`shrink-0 h-9 px-2.5 rounded-xl flex items-center gap-1 border text-xs font-medium transition-[transform,background-color,border-color,color] active:scale-90 ${
                  splitView
                    ? 'bg-[#0bb673]/15 border-[#0bb673]/40 text-[var(--brand-ink)]'
                    : 'bg-[var(--fill)] border-[var(--line)] text-[var(--text-2)] hover:text-[var(--text)]'
                }`}
              >
                <Split className="w-3.5 h-3.5" /> Dividir
              </button>
            </div>

            {/* Slots de división ÷N */}
            {splitView && (
              <div className="px-3.5 pb-3 -mt-1">
                <div className="flex flex-wrap items-center gap-1.5 ml-8">
                  {claimers.map(p => {
                    const mine = p.id === meId
                    const share = formatCLP(Math.ceil(item.price / itemClaims.length))
                    // El chip propio es accionable (toca para soltar tu parte); los de
                    // los demás son etiquetas de estado → <span>, no botón deshabilitado
                    // que se ve igual (audits/04-ux-a11y.md, SEV-3).
                    return mine ? (
                      <button
                        key={p.id}
                        onClick={() => removeClaim(item.id, meId)}
                        aria-label="Soltar mi parte de este ítem"
                        className="text-xs px-2.5 py-1 rounded-full font-medium bg-[#0bb673] text-white transition-colors active:scale-95"
                      >
                        Tú · {share}
                      </button>
                    ) : (
                      <span
                        key={p.id}
                        className="text-xs px-2.5 py-1 rounded-full font-medium bg-[var(--line)] text-[var(--text-1)]"
                      >
                        {firstName(p.id)} · {share}
                      </span>
                    )
                  })}
                  {open && !isMine && (
                    <button
                      onClick={() => addClaim(item.id, meId)}
                      className="text-xs px-2.5 py-1 rounded-full font-medium border border-dashed border-[#0bb673]/50 text-[var(--brand-ink)] hover:bg-[#0bb673]/5 transition-colors active:scale-95"
                    >
                      + Tomar mi parte
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-[var(--text-3)] mt-1.5 ml-8">
                  Se reparte entre quienes lo tomen — ÷{Math.max(1, itemClaims.length)}
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
