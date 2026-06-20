import { describe, it, expect } from 'vitest'
import { computeEqualShare, computeHostCollection } from './billing'
import type { Item, Claim, Participant, Payment } from '@/types'

// ── Fixtures mínimas ──────────────────────────────────────────────────────────
const item = (id: string, price: number): Item => ({
  id, session_id: 's1', name: id, price, position: 0,
})
const claim = (itemId: string, participantId: string): Claim => ({
  id: `${itemId}-${participantId}`, session_id: 's1', item_id: itemId, participant_id: participantId,
  created_at: '2026-01-01',
})
const person = (id: string, isHost = false): Participant => ({
  id, session_id: 's1', name: id, created_at: '2026-01-01', is_host: isHost,
})
const payment = (participantId: string, amount: number, confirmed = false): Payment => ({
  id: `pay-${participantId}`, session_id: 's1', participant_id: participantId,
  amount, comprobante_url: null, confirmed_by_host: confirmed, paid_at: null,
  created_at: '2026-01-01',
})

describe('computeEqualShare', () => {
  it('redondea CLP hacia arriba', () => {
    expect(computeEqualShare(9000, 3)).toBe(3000)
    expect(computeEqualShare(1000, 3)).toBe(334) // 333.33 → 334
    expect(computeEqualShare(10000, 4)).toBe(2500)
  })
  it('n=0 no divide por cero', () => {
    expect(computeEqualShare(5000, 0)).toBe(0)
  })
})

describe('computeHostCollection — partes iguales', () => {
  it('target = cuota × (n − 1): el host no se cobra a sí mismo', () => {
    const r = computeHostCollection({
      splitMode: 'equal', splitTotal: 9000, splitN: 3, propinaPct: 0,
      items: [], claims: [], participants: [], payments: [],
    })
    expect(r.target).toBe(6000) // 3000 × 2
  })
  it('confirmed suma solo pagos confirmados por el host', () => {
    const r = computeHostCollection({
      splitMode: 'equal', splitTotal: 9000, splitN: 3, propinaPct: 0,
      items: [], claims: [], participants: [person('a'), person('b')],
      payments: [payment('a', 3000, true), payment('b', 3000, false)],
    })
    expect(r.confirmed).toBe(3000)
  })
})

describe('computeHostCollection — por ítems', () => {
  it('un invitado, un ítem, sin propina → paga el precio completo', () => {
    const r = computeHostCollection({
      splitMode: 'items', propinaPct: 0,
      items: [item('i1', 5000)], claims: [claim('i1', 'g1')],
      participants: [person('g1')], payments: [],
    })
    expect(r.target).toBe(5000)
    expect(r.guestCount).toBe(1)
  })

  it('plato compartido host+invitado → el invitado paga la MITAD; el host no se cobra', () => {
    // Reproduce el bug que arregló la migración 007: antes el invitado pagaba 100%.
    const r = computeHostCollection({
      splitMode: 'items', propinaPct: 0,
      items: [item('i1', 12000)],
      claims: [claim('i1', 'host'), claim('i1', 'g1')],
      participants: [person('host', true), person('g1')],
      payments: [],
    })
    expect(r.target).toBe(6000)   // solo la mitad del invitado; el host queda fuera
    expect(r.guestCount).toBe(1)  // el host no cuenta como pagador
  })

  it('ítem reclamado SOLO por el host → target 0 (su consumo no se cobra)', () => {
    const r = computeHostCollection({
      splitMode: 'items', propinaPct: 0,
      items: [item('i1', 8000)], claims: [claim('i1', 'host')],
      participants: [person('host', true)], payments: [],
    })
    expect(r.target).toBe(0)
  })

  it('división impar ÷3 con propina: target = suma de lo que paga cada invitado (conserva el ítem)', () => {
    // $1000 ÷ 3 conserva: 334 + 333 + 333 = 1000 (sin plata fantasma en el ítem).
    // Con 10% por persona: 34 + 34 + 34 → totales 368 + 367 + 367 = 1102.
    const r = computeHostCollection({
      splitMode: 'items', propinaPct: 10,
      items: [item('i1', 1000)],
      claims: [claim('i1', 'a'), claim('i1', 'b'), claim('i1', 'c')],
      participants: [person('a'), person('b'), person('c')],
      payments: [],
    })
    expect(r.target).toBe(1102)
  })

  it('CONSERVA: ítem impar solo entre invitados → Σ partes == precio (sin propina)', () => {
    // Antes daba 1002 (ceil×3) = $2 de plata fantasma. Ahora reparte el resto.
    const r = computeHostCollection({
      splitMode: 'items', propinaPct: 0,
      items: [item('i1', 1000)],
      claims: [claim('i1', 'a'), claim('i1', 'b'), claim('i1', 'c')],
      participants: [person('a'), person('b'), person('c')],
      payments: [],
    })
    expect(r.target).toBe(1000)
  })

  it('host comparte ítem impar: invitados pagan ceil, el host absorbe el resto', () => {
    // $1000 entre host + a + b: a y b pagan ceil(1000/3)=334 c/u; el host (no se
    // cobra) absorbe 1000 − 668 = 332. El host nunca sobre-cobra.
    const r = computeHostCollection({
      splitMode: 'items', propinaPct: 0,
      items: [item('i1', 1000)],
      claims: [claim('i1', 'host'), claim('i1', 'a'), claim('i1', 'b')],
      participants: [person('host', true), person('a'), person('b')],
      payments: [],
    })
    expect(r.target).toBe(668)
  })

  it('ítems multi-unidad: cada invitado toma una unidad', () => {
    const r = computeHostCollection({
      splitMode: 'items', propinaPct: 0,
      items: [item('u1', 2000), item('u2', 2000)],
      claims: [claim('u1', 'a'), claim('u2', 'b')],
      participants: [person('a'), person('b')],
      payments: [],
    })
    expect(r.target).toBe(4000)
  })

  it('confirmed acumula el total de cada invitado con pago confirmado', () => {
    const r = computeHostCollection({
      splitMode: 'items', propinaPct: 0,
      items: [item('i1', 5000), item('i2', 3000)],
      claims: [claim('i1', 'a'), claim('i2', 'b')],
      participants: [person('a'), person('b')],
      payments: [payment('a', 5000, true), payment('b', 3000, false)],
    })
    expect(r.target).toBe(8000)
    expect(r.confirmed).toBe(5000) // solo 'a' está confirmado
  })
})
