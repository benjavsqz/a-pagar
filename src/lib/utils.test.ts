import { describe, it, expect } from 'vitest'
import {
  formatRut, isValidRut, normalizePaymentLink,
  computeItemWithClaims, computeParticipantSummary,
} from './utils'
import type { Item, Claim, Participant, Payment } from '@/types'

// ── Fixtures ──────────────────────────────────────────────────────────────────
const item = (id: string, price: number): Item => ({
  id, session_id: 's1', name: id, price, position: 0,
})
const claim = (itemId: string, participantId: string): Claim => ({
  id: `${itemId}-${participantId}`, item_id: itemId, participant_id: participantId,
  created_at: '2026-01-01',
})
const person = (id: string): Participant => ({
  id, session_id: 's1', name: id, created_at: '2026-01-01', is_host: false,
})
const payment = (participantId: string, amount: number): Payment => ({
  id: `pay-${participantId}`, session_id: 's1', participant_id: participantId,
  amount, comprobante_url: null, confirmed_by_host: false, paid_at: null,
  created_at: '2026-01-01',
})

describe('formatRut', () => {
  it('formatea cuerpo + dígito verificador', () => {
    expect(formatRut('123456789')).toBe('12.345.678-9')
    expect(formatRut('12345678k')).toBe('12.345.678-K')
  })
  it('maneja entradas cortas o vacías', () => {
    expect(formatRut('')).toBe('')
    expect(formatRut('1')).toBe('1')
  })
})

describe('isValidRut', () => {
  it('acepta RUTs con dígito verificador correcto', () => {
    expect(isValidRut('11.111.111-1')).toBe(true)
    expect(isValidRut('5.126.663-3')).toBe(true)
    expect(isValidRut('12345678-5')).toBe(true)
  })
  it('rechaza dígito verificador incorrecto o basura', () => {
    expect(isValidRut('11.111.111-2')).toBe(false)
    expect(isValidRut('abc')).toBe(false)
    expect(isValidRut('1')).toBe(false)
  })
})

describe('normalizePaymentLink', () => {
  it('acepta dominios de pago conocidos y agrega https', () => {
    expect(normalizePaymentLink('mpago.la/abc')).toBe('https://mpago.la/abc')
    expect(normalizePaymentLink('https://www.mercadopago.cl/x')).toBe('https://www.mercadopago.cl/x')
    expect(normalizePaymentLink('mach.cl')).toBe('https://mach.cl/')
  })
  it('rechaza dominios fuera de la allowlist o entradas inválidas', () => {
    expect(normalizePaymentLink('https://phishing.cl/pay')).toBeNull()
    expect(normalizePaymentLink('')).toBeNull()
    expect(normalizePaymentLink('no es una url')).toBeNull()
    // http (no https) no se permite
    expect(normalizePaymentLink('http://mach.cl')).toBeNull()
  })
  it('no se deja engañar por subdominios falsos', () => {
    expect(normalizePaymentLink('https://mach.cl.evil.com')).toBeNull()
  })
})

describe('computeItemWithClaims', () => {
  it('divide el precio entre los reclamantes (ceil)', () => {
    const it1 = item('a', 1000)
    const claims = [claim('a', 'p1'), claim('a', 'p2'), claim('a', 'p3')]
    expect(computeItemWithClaims(it1, claims).price_per_person).toBe(334)
  })
  it('sin reclamantes, el precio completo (÷1)', () => {
    expect(computeItemWithClaims(item('a', 1000), []).price_per_person).toBe(1000)
  })
})

describe('computeParticipantSummary', () => {
  it('suma solo lo reclamado y aplica propina', () => {
    const items = [item('a', 1000), item('b', 2000)]
    const claims = [claim('a', 'p1'), claim('b', 'p1')]
    const s = computeParticipantSummary(person('p1'), items, claims, [], 10)
    expect(s.subtotal).toBe(3000)
    expect(s.propina).toBe(300)
    expect(s.total).toBe(3300)
  })
  it('reparte un ítem compartido y enlaza el pago', () => {
    const items = [item('a', 1000)]
    const claims = [claim('a', 'p1'), claim('a', 'p2')]
    const s = computeParticipantSummary(person('p1'), items, claims, [payment('p1', 500)], 0)
    expect(s.subtotal).toBe(500)
    expect(s.total).toBe(500)
    expect(s.payment?.amount).toBe(500)
  })
})
