# Qué falta auditar para "buen producto" — Mapa de cobertura + 2026-06-19

> No es más código revisado lo que falta, sino unos pocos ejes de **producto, correctitud y confianza** que las auditorías 01–09 no tocan de frente. Este doc: (1) mapa de cobertura, (2) hallazgo concreto ya verificado (conservación del dinero), (3) lista priorizada de lo pendiente.

---

## 1. Mapa de cobertura

| Eje | Cubierto por | Estado |
|---|---|---|
| Seguridad / RLS / endpoints | 01-seguridad | ✅ |
| Base de datos / migraciones | 02-database | ✅ |
| Frontend / componentes | 03-frontend | ✅ |
| UX / accesibilidad (código) | 04-ux-a11y | ✅ |
| Producto / growth | 05-producto-growth | ✅ (estrategia) |
| Arquitectura / testing | 06-arquitectura-testing | ✅ |
| SEO / perf / i18n | 07-seo-perf-i18n | ✅ (teórico) |
| UI / diseño / PWA / web | 09 (este ciclo) | ✅ |
| **Correctitud del dinero (conservación)** | — | ❌ **§2** |
| **Fiabilidad IA / OCR** | — | ❌ |
| **Resiliencia realtime / red / carreras** | parcial 06 | ⚠️ |
| **Datos personales / legal Chile** | parcial (privacidad) | ⚠️ |
| **Abuso / costos / rate-limiting** | parcial 01 | ⚠️ |
| **Analítica de producto / funnel / observabilidad** | — | ❌ |
| **QA en dispositivos reales / SR reales** | — | ❌ |
| **Métricas de campo (CWV/INP reales)** | teórico 07 | ⚠️ |

---

> **✅ RESUELTO (2026-06-19):** modelo elegido = **el host absorbe el resto**.
> - Cliente: `claimShare()` en [utils.ts](src/lib/utils.ts) — los invitados pagan `ceil`, el host absorbe el remanente; en ítems solo-invitados el resto se reparte de a $1. Σ partes == precio. Tests de conservación en `utils.test.ts` y `billing.test.ts` (23/23).
> - Servidor: migración **[012_conserve_payment_amount.sql](supabase/migrations/012_conserve_payment_amount.sql)** replica la lógica en el trigger `set_payment_amount` (que la 011 dejaba en `ceil`). ⚠️ **Aplicar en Supabase y probar** — no se pudo correr Postgres en dev.

## 2. HALLAZGO — Conservación del dinero (redondeo crea plata fantasma) 🔴

**Núcleo del producto. No testeado.**

[utils.ts:93](src/lib/utils.ts#L93): `price_per_person = Math.ceil(item.price / count)`.
Para un ítem compartido ÷N que no divide exacto, `count × ceil(price/count) > price`. El sobrante **no lo absorbe nadie** en modo por ítems → el host sobre-cobra.

Ejemplos:
- $10.000 ÷3 → 3 × $3.334 = **$10.002** (sobra $2).
- 3 ítems de $1.000 ÷3 + propina 10% → 3 × $1.103 = **$3.309** vs boleta real **$3.300** (sobra $9).
- A más ítems/personas, más drift.

Asimetría con "partes iguales": ahí `target = ceil(total/n) × (n−1)` ([billing.ts:49](src/lib/billing.ts#L49)) → el **host se come el resto** (modelo correcto y deseable). En modo por ítems el resto simplemente se crea de la nada.

Efecto secundario: en el panel host, `targetToCollect` (Σ ceil por invitado) **no calza con `billTotal`** (ceil del total) — la barra de progreso mide contra un objetivo inflado.

**Decisión de producto pendiente (elegir una):**
1. **Host absorbe el resto** (coherente con partes iguales): el último/anfitrión paga `price − Σ(otros)`. Conserva exacto.
2. **Repartir el resto de a $1**: los primeros `resto` reclamantes pagan +$1. Conserva exacto, justo.
3. **Aceptar ceil pero mostrarlo**: etiqueta "montos redondeados al peso" para que nadie sienta que sobra plata. Mínimo viable.

**Test que falta** (propiedad de conservación):
```ts
it('Σ de lo que pagan todos == total de la boleta (sin plata fantasma)', () => {
  // para cada ítem: suma de price_per_person de sus claimantes === item.price
})
```

---

## 3. Pendientes priorizados

### 🔴 Alta (núcleo / confianza / riesgo legal)

**B. Fiabilidad de la IA / OCR (Gemini).** ✅ **Auditado en este ciclo.** La implementación (`src/app/api/ocr/route.ts`, `ocr-uploader.tsx`) es **sólida y pensada**: cascada de modelos, reintentos con backoff, validación de mime/tamaño, detección de descuadre con aviso al usuario, sanitización del error del proveedor, fallback manual, compresión en cliente. Hallazgos reales:

- 🟠 **Vector de costo/abuso — el endpoint es un proxy de Gemini gratis.** El rate-limit era **en memoria por instancia serverless**. **✅ RESUELTO (2026-06-19):** rate-limit durable en Supabase — migración **[013_ocr_rate_limit.sql](supabase/migrations/013_ocr_rate_limit.sql)** (tabla + RPC `hit_ocr_rate_limit`, conteo global entre instancias) y el route ahora lo usa con fallback al limitador en memoria. ⚠️ Aplicar la migración en Supabase. (Pendiente opcional: además atar OCR a un token de sesión.)
- 🟡 **Ítems baratos se descartan en silencio.** [route.ts:238](src/app/api/ocr/route.ts#L238) `if (unitPrice < 200) continue` elimina agregados/bebidas en oferta sin avisar → genera descuadre que el usuario no entiende. → Umbral configurable o avisar "descarté N ítems < $200".
- 🟡 **Fuga de redondeo en multi-unidad** alimenta el §2: [route.ts:237](src/app/api/ocr/route.ts#L237) `Math.round(price/qty)` re-multiplicado por qty pierde pesos si el total de línea no divide exacto.
- 🟡 **Sin tope de cantidad de ítems** server-side (qty sí está capada a 20, pero el array de ítems no): una imagen adversaria podría inflar el payload. `maxOutputTokens 8192` lo limita de hecho, pero conviene un cap explícito.
- 🟡 **`console.error` registra el output crudo del modelo** ([route.ts:218](src/app/api/ocr/route.ts#L218)) — las boletas pueden contener nombre/RUT del local; revisar qué se loguea (cruza con §D).
- 🟡 **Sin `maxDuration` ni timeout explícito** en la ruta: una llamada colgada de Gemini retiene la lambda. → `export const maxDuration` + AbortController.
- ℹ️ **Inyección de prompt:** bajo riesgo — los nombres de ítem se renderizan como texto (React escapa, sin XSS) y los precios se validan numéricos. Aceptable.

**D. Datos personales / legal Chile (Ley 19.628 → 21.719).** Manejas **RUT + número de cuenta + correo + comprobantes** (imágenes con datos financieros) sin cuentas. Pendiente: política de **retención y borrado** (¿cuánto viven sesiones y comprobantes?), base de licitud/consentimiento, que la `/privacidad` refleje lo real, derecho a borrado. Riesgo reputacional/legal, no solo técnico.

### 🟠 Media-alta

**E. Abuso / costos / rate-limiting.** Sin auth: creación ilimitada de sesiones, subida de imágenes (abuso de storage), llamadas a OCR (costo) y a `/api/push/send`. Definir límites por IP/sesión, tamaño/tipo de archivo, expiración. Parcial en 01; falta el ángulo de **costo**.

**C. Resiliencia realtime / red / carreras.** Reconexión si Supabase Realtime se cae, doble-submit de pago, **carrera al reclamar la última unidad** de un ítem multi-unidad, divergencia del optimistic update, comportamiento con red intermitente. Hay red de seguridad (poll + refetch) pero falta el caso límite concurrente.

**F. Analítica de producto / funnel / observabilidad.** Vercel Analytics está, pero ¿hay **eventos del embudo** (creó → compartió → se unió → marcó → pagó → confirmó)? Sin eso no se puede mejorar activación. Falta **error monitoring** (Sentry/equivalente) para errores en producción que hoy mueren en `console.error`.

### 🟡 Media

**A2. Activación / modelo de confianza.** ¿El host entiende que el **hostToken vive solo en su dispositivo** (perderlo = no poder confirmar)? Onboarding de primer uso, microcopy de confianza ("sin cuentas, tus datos no se guardan más de X").

**I. QA en dispositivos reales.** El código a11y/responsive está; falta prueba real en iOS Safari, Android Chrome gama baja, y lectores de pantalla (VoiceOver/TalkBack) — sobre todo tras los fixes de safe-area (§09).

**J. Métricas de campo reales.** Lighthouse + CWV de campo, con foco en **INP en móviles baratos** (blobs `blur-[120px]` + grano `mix-blend-mode`, §09-P8), y análisis de tamaño de bundle.

**H. Ciclo de vida de datos.** Limpieza de sesiones/comprobantes viejos, "Mis boletas" solo por dispositivo (decisión conocida), re-engagement.

### Sugerencia de orden
`§2 dinero` → `B OCR` → `D legal` → `E abuso/costos` → `C carreras` → `F analítica`. Los tres primeros son los que separan "demo" de "producto en el que la gente confía su plata".
