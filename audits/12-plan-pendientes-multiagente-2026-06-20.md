# Plan de pendientes — ejecución multiagente — 2026-06-20

> Investigación + planificación para cerrar la brecha "demo sólida → producto en producción". Se despliegan agentes en paralelo (worktrees aislados) sobre workstreams con dominios de archivo **disjuntos** (sin conflicto de merge).

## Estado de partida (verificado)
- Auditorías 01-11 remediadas; flujo e2e 3/3 verde contra Supabase real.
- Dinero conserva exacto (012); OCR endurecido + rate-limit (013); paleta tokenizada; PWA con safe areas.
- Migración **010** ya anonimiza PII del host 30 días tras cerrar.
- `@vercel/analytics` presente (solo pageviews). Sin Sentry. Sin CI. Sin auth.

## Brecha → workstreams (dominios disjuntos)

| Stream | Objetivo | Archivos (exclusivos) |
|---|---|---|
| **A · CI/CD** | GitHub Actions: lint + tsc + unit tests en cada push/PR | `.github/`, `README.md` |
| **B · Observabilidad** | Sentry (env-gated) + eventos de funnel | `package.json`, `next.config.ts`, `instrumentation.ts`, `sentry.*.config.ts`, `src/lib/analytics.ts`, `crear`/`s`/`host` pages |
| **C · Legal/Privacidad (Chile)** | `/privacidad` real + retención de comprobantes + "borrar mis datos" | `src/app/privacidad/page.tsx`, `src/app/cuenta/page.tsx`, `migrations/014` |
| **D · Resiliencia** | Reconexión realtime + carrera de claim concurrente | `src/hooks/use-session.ts`, `use-presence.ts`, `migrations/015` |

Migraciones nuevas se aplican a mano en Supabase (como las previas), marcadas para staging.

## Secuenciación (criterio)
- **Fase 1 (ahora, paralelo):** A, B, C, D — independientes, sin conflicto de archivos.
- **Fase 2 (secuencial, después):** **Auth ligera (magic link) + persistencia** — es transversal (cambia modelo de datos, tipos, muchos componentes) y entra en conflicto con todo; se hace sola, sobre la base ya integrada. **QA visual en dispositivos reales.**

## Integración
Cada agente trabaja en su worktree/branch, instala deps, verifica (build/lint/tests) y commitea. Luego: revisar resúmenes → merge secuencial a una rama de integración → suite completa → PR.
