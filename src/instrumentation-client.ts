/**
 * Client-side instrumentation (Next 16 convention).
 *
 * Sentry es 100% opcional y env-gated: si NO existe la variable pública
 * `NEXT_PUBLIC_SENTRY_DSN`, no se inicializa nada y el archivo queda como
 * no-op. La app compila y corre sin ninguna configuración de Sentry.
 *
 * Para activar el monitoreo de errores en el navegador, define
 * `NEXT_PUBLIC_SENTRY_DSN` en el entorno (NO se hardcodea ningún DSN aquí).
 */
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  // Init minimalista: solo lo imprescindible para capturar errores. No se
  // habilita nada que requiera configuración adicional / un DSN distinto.
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  })
}

/**
 * Hook de navegación del App Router. Sentry lo usa para enlazar trazas de
 * navegación; si no hay DSN (Sentry no inicializado) es un no-op inofensivo.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
