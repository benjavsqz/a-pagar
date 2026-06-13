'use client'
import { useState } from 'react'
import { CheckCircle2, Circle, Minus, Plus, Split } from 'lucide-react'
import { formatCLP } from '@/lib/utils'
import type { Item, Claim, Participant } from '@/types'

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

  const myClaimedItemIds = new Set(
    claims.filter(c => c.participant_id === meId).map(c => c.item_id)
  )
  const firstName = (id: string) =>
    (participants.find(p => p.id === id)?.name ?? '').split(' ')[0]

  const groups: Group[] = Object.values(
    items.reduce((map, item) => {
      if (!map[item.name]) map[item.name] = { name: item.name, units: [] }
      map[item.name].units.push(item)
      return map
    }, {} as Record<string, Group>)
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
              className={`w-full text-left p-3.5 rounded-2xl border transition-all ${
                isMine ? 'bg-[#0bb673]/10 border-[#0bb673]/40' : 'bg-white border-[#f6f1ea]'
              }`}
            >
              <div className="flex items-center gap-3">
                {isMine
                  ? <CheckCircle2 className="w-5 h-5 text-[#077f4e] shrink-0 check-pop" />
                  : <Circle className="w-5 h-5 text-[#6b5f55] shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isMine ? 'text-[#1a1614]' : 'text-[#4a423b]'}`}>{name}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <span className="text-xs font-semibold bg-[#ece2d5] text-[#6b5f55] px-2 py-0.5 rounded-full">×{units.length}</span>
                    <p className={`text-sm font-bold mt-0.5 ${isMine ? 'text-[#077f4e]' : 'text-[#6b5f55]'}`}>{formatCLP(unitPrice)} c/u</p>
                  </div>
                  <div className="flex items-center bg-[#f6f1ea] border border-[#ece2d5] rounded-lg">
                    <button
                      onClick={handleRemoveOne}
                      disabled={myCount === 0}
                      aria-label="Quitar uno"
                      className="w-7 h-7 flex items-center justify-center text-[#6b5f55] hover:text-[#1a1614] disabled:opacity-20 transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className={`w-5 text-center text-xs font-bold tabular-nums select-none ${myCount > 0 ? 'text-[#077f4e]' : 'text-[#6b5f55]'}`}>{myCount}</span>
                    <button
                      onClick={handleAdd}
                      disabled={freeCount === 0 || !open}
                      aria-label="Agregar uno"
                      className="w-7 h-7 flex items-center justify-center text-[#6b5f55] hover:text-[#077f4e] disabled:opacity-20 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5 ml-8">
                {units.map((unit, idx) => {
                  const unitClaims = claims.filter(c => c.item_id === unit.id)
                  const isMyUnit = myClaimedItemIds.has(unit.id)
                  const isShared = unitClaims.length > 1
                  const others = unitClaims.map(c => c.participant_id).filter(pid => pid !== meId).map(firstName)
                  const chipLabel = isMyUnit
                    ? 'Tú' + (isShared ? ` +${others.join('+')}` : '')
                    : unitClaims.length > 0
                    ? unitClaims.map(c => firstName(c.participant_id)).join('+')
                    : `Libre ${idx + 1}`
                  return (
                    <span
                      key={unit.id}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        isMyUnit ? 'bg-[#0bb673] text-white'
                        : unitClaims.length > 0 ? 'bg-[#ece2d5] text-[#4a423b]'
                        : 'border border-dashed border-[#e0d4c4] text-[#6b5f55]'
                      }`}
                    >
                      {chipLabel}
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
            className={`w-full rounded-2xl border transition-all ${
              isMine ? 'bg-[#0bb673]/10 border-[#0bb673]/40' : 'bg-white border-[#f6f1ea]'
            }`}
          >
            <div className="flex items-center gap-2 p-3.5">
              <button
                onClick={toggleMine}
                disabled={!open}
                className="flex items-center gap-3 flex-1 min-w-0 text-left active:scale-95 transition-transform disabled:active:scale-100"
              >
                {isMine
                  ? <CheckCircle2 className="w-5 h-5 text-[#077f4e] shrink-0 check-pop" />
                  : <Circle className="w-5 h-5 text-[#6b5f55] shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isMine ? 'text-[#1a1614]' : 'text-[#4a423b]'}`}>{item.name}</p>
                  {shared && (
                    <p className="text-xs text-[#6b5f55] mt-0.5">
                      Entre {claimers.length} · ÷{itemClaims.length}
                    </p>
                  )}
                </div>
              </button>
              <div className="text-right shrink-0">
                <p className={`text-sm font-bold ${isMine ? 'text-[#077f4e]' : 'text-[#6b5f55]'}`}>{formatCLP(pricePer)}</p>
                {shared && <p className="text-xs text-[#6b5f55]">de {formatCLP(item.price)}</p>}
              </div>
              {/* Botón Dividir — al costado */}
              <button
                onClick={() => toggleSplit(item.id)}
                aria-label="Dividir este ítem entre varias personas"
                aria-pressed={splitView}
                className={`shrink-0 h-9 px-2.5 rounded-xl flex items-center gap-1 border text-xs font-medium transition-all active:scale-90 ${
                  splitView
                    ? 'bg-[#0bb673]/15 border-[#0bb673]/40 text-[#077f4e]'
                    : 'bg-[#f6f1ea] border-[#ece2d5] text-[#6b5f55] hover:text-[#1a1614]'
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
                    return (
                      <button
                        key={p.id}
                        onClick={() => mine ? removeClaim(item.id, meId) : undefined}
                        disabled={!mine}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                          mine ? 'bg-[#0bb673] text-white' : 'bg-[#ece2d5] text-[#4a423b] cursor-default'
                        }`}
                      >
                        {mine ? 'Tú' : firstName(p.id)} · {formatCLP(Math.ceil(item.price / itemClaims.length))}
                      </button>
                    )
                  })}
                  {open && !isMine && (
                    <button
                      onClick={() => addClaim(item.id, meId)}
                      className="text-xs px-2.5 py-1 rounded-full font-medium border border-dashed border-[#0bb673]/50 text-[#077f4e] hover:bg-[#0bb673]/5 transition-colors active:scale-95"
                    >
                      + Tomar mi parte
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-[#8a7d71] mt-1.5 ml-8">
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
