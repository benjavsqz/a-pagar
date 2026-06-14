# Tracker de pendientes — Auditoría multi-agente (Jun 2026)

> Estado de los hallazgos de los 7 informes (`audits/01..07`). Se va tachando a medida que se cierran.
> ✅ = hecho · 🔲 = pendiente · 🟡 = decisión de producto · ♻️ = refactor grande

## Ya cerrado (commits post-auditoría)
- ✅ [01/02] Bypass token legacy (RPC + fallback cliente) — mig 008
- ✅ [01] Escalada `is_host` — policy guest-only + `register_host_participant` — mig 008
- ✅ [01] Storage comprobantes: bucket privado + policies INSERT/SELECT — mig 008 (parcial)
- ✅ [01/02/06] Realtime claims/payments/participants filtrado por `session_id`
- ✅ [02/06] Cálculo único `targetToCollect` → `billing.ts` + tests
- ✅ [07] SEO/Perf/i18n ALTA: canonical, JSON-LD, lang es-CL, web-push external, sitemap, CLS, fuentes
- ✅ [04] Botón Dividir con label, pantalla boleta cerrada, contraste AA, aviso token device

## Pendiente — Seguridad (01) y DB (02)
- ✅ [01-ALTO] `payments.amount` mutable → guard congela amount (mig 009)
- ✅ [01-ALTO] `/api/push/send`: nombre/monto se leen de la DB, no del body
- ✅ [01-ALTO] `/api/push/subscribe`: valida UUID, role, formato y pertenencia
- ✅ [01-MEDIO] `isValidRut()` invocado en /crear (ambos flujos)
- ✅ [01-BAJO] Headers de seguridad (CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy)
- ✅ [01-BAJO] `host_payment_link` con allowlist de dominios (`normalizePaymentLink`)
- ✅ [02-SEV3] `confirm_payment` verifica que el participant pertenezca a la session (mig 009)
- 🔲 [01-MEDIO] Signed URLs de comprobantes con anon client → mover a API route con token
- 🔲 [01-BAJO] `claims_delete_any` abierto → sin auth no se puede atar al caller; requiere decisión
- 🔲 [02-SEV2] `claims.session_id` NULLABLE → NOT NULL + FK (mig; riesgo si hay nulos)
- 🔲 [02-SEV2] `push_subscriptions` session_id/participant_id NULLABLE
- 🔲 [02-SEV3] split_total/split_n sin constraints de coherencia
- 🟡 [01] OCR rate limit en memoria (serverless) → Upstash Redis (¿vale para MVP?)
- 🟡 [01-MEDIO] Política de privacidad incompleta (Ley 21.719)
- 🟡 [01] Secretos en `.env.local` → pre-commit hook / Vercel env (operacional)

## Pendiente — Frontend (03)
- ✅ [Alto] `removeClaim` restaura los claims exactos en error (sin load() que pisa estado)
- ✅ [Alto] `error.tsx` + `loading.tsx` global (antes: pantalla blanca ante error)
- 🔲 [Alto] race optimismo + recarga realtime → posible doble-claim
- 🔲 [Medio] `confirmPayment`/`closeSession` optimismo + `load()` redundante
- 🔲 [Medio] Memoización (host page, ItemsClaimList groups/myClaimedItemIds)
- 🔲 [Bajo] `generateSessionLink` usa `window.location.origin` (falla SSR)
- 🔲 [Bajo] Toaster montado dos veces; usePush sin cleanup; keys por índice; cast types

## Pendiente — UX/a11y (04)
- 🔲 [SEV-1] `window.confirm()` para cerrar boleta → modal accesible
- 🔲 [SEV-2] Campos obligatorio/opcional sin indicar en form de host
- 🔲 [SEV-2] `inputMode="numeric"` real en Nro de cuenta (quick win)
- 🔲 [SEV-2] Botón "Ya transferí (sin comprobante)" con demasiado peso
- 🔲 [SEV-2] Propina sin estado "ninguna seleccionada"
- 🔲 [SEV-3] Stepper +/- de 28px (< 44px touch target)
- 🔲 [SEV-3] Chips no-interactivos se ven iguales a los interactivos
- 🔲 [SEV-3] Estado vacío host sin CTA de compartir

## Pendiente — Arquitectura/Testing (06)
- ♻️ [CRÍTICO-2] `crear/page.tsx` (843 líneas) — componente-Dios → extraer pasos
- ♻️ [ALTO-1] Sin data-layer: `createClient()` directo en componentes
- ♻️ [ALTO-2] `useSession` con 4 responsabilidades
- 🔲 [ALTO-3] Ampliar tests (más allá de billing)
- 🔲 [MEDIO] DraftItem duplicado; fallbacks "si migración no aplicada" en prod

## Pendiente — SEO/Perf (07) — menores
- 🔲 [MEDIA] OG image dinámica por sesión (hoy genérica)
- 🔲 [BAJA] preload del LCP; robots para crawlers IA; varios menores
