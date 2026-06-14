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
- ✅ [01-MEDIO] Signed URLs de comprobantes ahora server-side (`/api/comprobante` valida host_token)
- ✅ [01-MEDIO] Retención: PII del host se anonimiza 30 días tras cerrar (mig 010 + cron) + política actualizada
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
- ✅ [Medio] Memoización en ItemsClaimList (groups/myClaimedItemIds)
- ✅ [Bajo] `generateSessionLink` cae a NEXT_PUBLIC_SITE_URL en SSR
- ✅ [Bajo] ItemRow con key estable (`item.id`) en /crear; Toaster ya deduplicado (tanda 2)
- 🔲 [Alto] race optimismo + recarga realtime → posible doble-claim (mitigado por filtro realtime; requiere RPC para cerrar del todo)
- 🔲 [Medio] `confirmPayment`/`closeSession` `load()` redundante (eficiencia, no bug)
- ℹ️ [Bajo] usePush sin cleanup: intencional (la suscripción debe persistir); casts de tipos: se cierran con el data-layer (tanda 6)

## UX/a11y (04) — ✅ tanda 2
- ✅ [SEV-1] `window.confirm()` → `ConfirmDialog` accesible (alertdialog, Escape, foco)
- ✅ [SEV-2] Form host: hint "* obligatorios", sección "Para que te transfieran", Correo (opcional)
- ✅ [SEV-2] `inputMode="numeric"` ya presente en Nro de cuenta (verificado)
- ✅ [SEV-2] "Ya transferí, sin comprobante" pasa a enlace de texto (menor jerarquía)
- ✅ [SEV-2] Propina: subtítulo dinámico según estado (el toggle ya marca selección)
- ✅ [SEV-3] Stepper +/- a 40px
- ✅ [SEV-3] Chips de otros claimers son `<span>`, solo el propio es botón
- ✅ [SEV-3] Estado vacío host con CTA Compartir/Copiar
- ✅ [03-Bajo] Toaster montado una sola vez (en layout)

## Arquitectura/Testing (06) — parcial tanda 6
- ✅ [ALTO-3] Tests ampliados: utils (RUT, payment-link allowlist, summaries) — 21 tests
- 🟗 [CRÍTICO-2] `crear/page.tsx`: 843 → 721 líneas (extraídos HostDataForm + StepIndicator).
  La descomposición total de los dos flujos en step-components queda pendiente: es
  prop-threading masivo y sin tests de integración el riesgo de regresión supera el
  beneficio para el MVP → hacerlo como tanda dedicada con verificación en app corriendo.
- 🔲 [ALTO-1] Data-layer (repository sobre createClient): mejora de mantenibilidad,
  difiere — toca muchos call sites; mejor con la app verificable.
- 🔲 [ALTO-2] `useSession` 4 responsabilidades: cohesivo hoy; partir arriesga el realtime.
- ℹ️ [MEDIO] fallbacks "si migración no aplicada": se pueden quitar una vez aplicadas
  005–010 en producción (ver pasos al usuario).

## SEO/Perf (07) — ✅ tanda 4
- ✅ [MEDIA] OG image dinámica por sesión (`s/[id]/opengraph-image.tsx`)
- ✅ [03-Bajo] `<img>` de ocr-uploader: directiva eslint reposicionada (lint 0 warnings)
- ℹ️ robots crawlers IA: `*` ya bloquea /s /host /api; landing pública a propósito → aceptable
- 🔲 [BAJA] preload del LCP (marginal, se omite por riesgo/beneficio)
