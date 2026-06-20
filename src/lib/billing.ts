// Fuente única de verdad para el dinero del host: "cuánto espera cobrar".
//
// Antes este cálculo vivía duplicado y DIVERGENTE en tres lugares
// (src/lib/utils.ts, host/[id]/page.tsx y cuenta/page.tsx). cuenta usaba
// división flotante sin redondear, así que para ítems de precio impar
// divididos entre N el total "por cobrar" no calzaba con lo que cada invitado
// veía y pagaba (Math.ceil por persona). audits/06-arquitectura-testing.md.
//
// Regla: el target del host = la SUMA de lo que cada invitado realmente paga.
// Así, por construcción, nunca diverge de la vista del participante.
import type { Item, Claim, Participant, Payment } from '@/types'
import { computeParticipantSummary } from './utils'

export interface HostCollection {
  /** Lo que el host espera cobrar (excluye su propio consumo). */
  target: number
  /** Suma ya confirmada por el host. */
  confirmed: number
  /** Nº de participantes que pagan (sin contar al host). */
  guestCount: number
}

/** Cuota por persona en modo "partes iguales" (redondeo CLP hacia arriba). */
export function computeEqualShare(splitTotal: number, splitN: number): number {
  return splitN > 0 ? Math.ceil(splitTotal / splitN) : 0
}

/**
 * Calcula lo que el host espera cobrar y lo ya confirmado, de forma consistente
 * con `computeParticipantSummary`. El consumo del host (is_host) se excluye del
 * cobro pero sus claims SÍ cuentan para dividir ÷N los platos compartidos.
 */
export function computeHostCollection(args: {
  splitMode: 'items' | 'equal' | null | undefined
  splitTotal?: number | null
  splitN?: number | null
  propinaPct: number
  items: Item[]
  claims: Claim[]
  participants: Participant[]
  payments: Payment[]
}): HostCollection {
  const { splitMode, splitTotal, splitN, propinaPct, items, claims, participants, payments } = args
  const guests = participants.filter(p => !p.is_host)

  if (splitMode === 'equal') {
    const share = computeEqualShare(splitTotal ?? 0, splitN ?? 0)
    // El host no se cobra a sí mismo → (n − 1) cuotas.
    const target = share * Math.max(0, (splitN ?? 1) - 1)
    const confirmed = payments
      .filter(p => p.confirmed_by_host)
      .reduce((sum, p) => sum + p.amount, 0)
    return { target, confirmed, guestCount: guests.length }
  }

  // Por ítems: sumamos lo que paga cada invitado (idéntico a su propia vista).
  let target = 0
  let confirmed = 0
  for (const guest of guests) {
    const summary = computeParticipantSummary(guest, items, claims, payments, propinaPct, participants)
    target += summary.total
    if (summary.payment?.confirmed_by_host) confirmed += summary.total
  }
  return { target, confirmed, guestCount: guests.length }
}
