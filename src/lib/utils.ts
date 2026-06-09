import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Item, Claim, Participant, Payment, ParticipantSummary, ItemWithClaims } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCLP(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Formats a Chilean RUT string as it's being typed.
 * Input: "12345678k" → Output: "12.345.678-K"
 */
export function formatRut(value: string): string {
  const clean = value.replace(/[^0-9kK]/g, '').toLowerCase()
  if (clean.length === 0) return ''
  if (clean.length === 1) return clean.toUpperCase()

  const body = clean.slice(0, -1)
  const dv = clean.slice(-1).toUpperCase()
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

  return `${formatted}-${dv}`
}

/**
 * Returns true if the RUT passes the Chilean check-digit algorithm.
 */
export function isValidRut(rut: string): boolean {
  const clean = rut.replace(/[^0-9kK]/g, '').toLowerCase()
  if (clean.length < 2) return false

  const body = clean.slice(0, -1)
  const dv = clean.slice(-1)

  let sum = 0
  let factor = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }

  const remainder = 11 - (sum % 11)
  const expected = remainder === 11 ? '0' : remainder === 10 ? 'k' : remainder.toString()

  return dv === expected
}

export function computeItemWithClaims(item: Item, claims: Claim[]): ItemWithClaims {
  const itemClaims = claims.filter(c => c.item_id === item.id)
  const count = itemClaims.length || 1
  return {
    ...item,
    claims: itemClaims,
    price_per_person: Math.ceil(item.price / count),
  }
}

export function computeParticipantSummary(
  participant: Participant,
  items: Item[],
  claims: Claim[],
  payments: Payment[],
  propinaPct: number
): ParticipantSummary {
  const myClaimIds = new Set(
    claims.filter(c => c.participant_id === participant.id).map(c => c.item_id)
  )

  const myItems = items
    .filter(item => myClaimIds.has(item.id))
    .map(item => computeItemWithClaims(item, claims))

  const subtotal = myItems.reduce((sum, item) => sum + item.price_per_person, 0)
  const propina = Math.ceil(subtotal * propinaPct / 100)
  const total = subtotal + propina
  const payment = payments.find(p => p.participant_id === participant.id) ?? null

  return { participant, items: myItems, subtotal, propina, total, payment }
}

export function generateSessionLink(sessionId: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}/s/${sessionId}`
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text)
}
