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

// Dominios de servicios de pago/transferencia chilenos permitidos en host_payment_link.
// Evita que una boleta apunte a un sitio de phishing tras un botón "Pagar ahora"
// (audits/01-seguridad.md, host_payment_link sin allowlist). Se permiten subdominios.
const PAYMENT_LINK_DOMAINS = [
  'mercadopago.cl', 'mercadopago.com', 'mpago.la',
  'mach.cl', 'somosmach.com',
  'fintoc.com', 'flow.cl', 'webpay.cl', 'transbank.cl',
  'tenpo.cl', 'khipu.com', 'getnet.cl', 'fpay.cl', 'chek.cl',
  'paypal.com', 'paypal.me',
]

/**
 * Normaliza y valida un link de pago. Devuelve la URL https final si el dominio
 * está en la allowlist; null si no es válido o el dominio no está permitido.
 */
export function normalizePaymentLink(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withProto)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase()
  const ok = PAYMENT_LINK_DOMAINS.some(d => host === d || host.endsWith(`.${d}`))
  return ok ? url.toString() : null
}

/**
 * Cuánto paga UN reclamante de un ítem, repartiendo el precio SIN perder ni crear
 * pesos: la Σ de las partes de todos los reclamantes == item.price (conservación).
 * Modelo "el host absorbe el resto":
 *   - Si el host reclama el ítem, los invitados pagan ceil(price/N) y el host paga
 *     el remanente exacto (price − Σ invitados). Su consumo no se cobra igual.
 *   - Si no hay host entre los reclamantes, el resto (price mod N) se reparte de a
 *     $1 entre los primeros (orden estable por created_at) para que cuadre exacto.
 */
export function claimShare(
  item: Item,
  itemClaims: Claim[],
  participants: Participant[],
  participantId: string,
): number {
  const n = itemClaims.length
  if (n <= 1) return item.price

  const ceilShare = Math.ceil(item.price / n)
  const hostClaim = itemClaims.find(
    c => participants.find(p => p.id === c.participant_id)?.is_host === true
  )

  if (hostClaim) {
    // Invitados pagan ceil; el host absorbe lo que falte para cuadrar exacto.
    return participantId === hostClaim.participant_id
      ? item.price - ceilShare * (n - 1)
      : ceilShare
  }

  // Solo invitados: reparte el resto de a $1 entre los primeros (orden estable).
  const base = Math.floor(item.price / n)
  const rem = item.price - base * n
  const idx = [...itemClaims]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .findIndex(c => c.participant_id === participantId)
  return base + (idx > -1 && idx < rem ? 1 : 0)
}

export function computeItemWithClaims(
  item: Item,
  claims: Claim[],
  participants: Participant[],
  participantId: string,
): ItemWithClaims {
  const itemClaims = claims.filter(c => c.item_id === item.id)
  return {
    ...item,
    claims: itemClaims,
    price_per_person: claimShare(item, itemClaims, participants, participantId),
  }
}

export function computeParticipantSummary(
  participant: Participant,
  items: Item[],
  claims: Claim[],
  payments: Payment[],
  propinaPct: number,
  participants: Participant[],
): ParticipantSummary {
  const myClaimIds = new Set(
    claims.filter(c => c.participant_id === participant.id).map(c => c.item_id)
  )

  const myItems = items
    .filter(item => myClaimIds.has(item.id))
    .map(item => computeItemWithClaims(item, claims, participants, participant.id))

  const subtotal = myItems.reduce((sum, item) => sum + item.price_per_person, 0)
  const propina = Math.ceil(subtotal * propinaPct / 100)
  const total = subtotal + propina
  const payment = payments.find(p => p.participant_id === participant.id) ?? null

  return { participant, items: myItems, subtotal, propina, total, payment }
}

export function generateSessionLink(sessionId: string): string {
  // En el cliente usamos el origin real; en SSR caemos a la URL pública
  // configurada para no generar un link relativo roto.
  const base = typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://a-pagar.vercel.app')
  return `${base}/s/${sessionId}`
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text)
}
