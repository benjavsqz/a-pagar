/**
 * Wrapper tipado y delgado sobre `track` de @vercel/analytics.
 *
 * Objetivos:
 * - Eventos de embudo (funnel) del producto, sin PII: nunca nombres, ni montos
 *   que identifiquen a una persona. Si se necesita magnitud, usar un bucket
 *   grueso (ver `amountBucket`).
 * - Seguro de llamar desde el cliente: si `track` no está disponible o lanza,
 *   nunca rompe el flujo del usuario.
 *
 * Vercel Analytics ya está montado en el layout vía <Analytics /> desde
 * '@vercel/analytics/next', por lo que `track` reporta al mismo proyecto.
 */
import { track } from '@vercel/analytics'

/** Nombres de eventos del embudo. Unión cerrada para evitar typos. */
export type AnalyticsEvent =
  | 'session_created'
  | 'participant_joined'
  | 'payment_submitted'
  | 'payment_confirmed'
  | 'session_closed'

/** Propiedades permitidas: primitivas simples, sin PII. */
type AnalyticsProps = Record<string, string | number | boolean | null>

/**
 * Emite un evento de producto. No-op silencioso si algo falla (p. ej. en SSR o
 * si el bloqueador del navegador descarta el script de analytics).
 */
export function trackEvent(name: AnalyticsEvent, props?: AnalyticsProps): void {
  try {
    track(name, props)
  } catch {
    // Telemetría nunca debe romper la UX.
  }
}

/**
 * Convierte un monto en CLP a un bucket grueso, anónimo (sin revelar el monto
 * exacto de nadie). Útil si en el futuro se quiere segmentar por tamaño de
 * cuenta sin filtrar datos identificables.
 */
export function amountBucket(clp: number): string {
  if (!Number.isFinite(clp) || clp <= 0) return 'unknown'
  if (clp < 10_000) return '<10k'
  if (clp < 30_000) return '10-30k'
  if (clp < 60_000) return '30-60k'
  if (clp < 100_000) return '60-100k'
  return '100k+'
}
