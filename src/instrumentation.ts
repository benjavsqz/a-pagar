/**
 * Server-side instrumentation (Next 16 convention).
 *
 * Sentry es 100% opcional y env-gated: si NO existe la variable `SENTRY_DSN`,
 * `register()` no inicializa nada y `onRequestError` queda como no-op. La app
 * compila y corre sin ninguna configuración de Sentry.
 *
 * Para activar el monitoreo de errores en servidor, define `SENTRY_DSN` en el
 * entorno (NO se hardcodea ningún DSN aquí).
 */
import type { Instrumentation } from 'next'

export async function register() {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return // sin DSN → no-op, no se carga ni se importa Sentry

  const Sentry = await import('@sentry/nextjs')
  Sentry.init({
    dsn,
    // Muestreo de trazas bajo para no inflar cuota; nada que requiera DSN extra.
    tracesSampleRate: 0.1,
  })
}

/**
 * Reporta errores de servidor (Server Components, Route Handlers, Server
 * Actions) a Sentry. Si no hay DSN, no hace nada.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  ...args
) => {
  if (!process.env.SENTRY_DSN) return
  const Sentry = await import('@sentry/nextjs')
  await Sentry.captureRequestError(...args)
}
