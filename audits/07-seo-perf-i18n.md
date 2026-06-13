# Auditoría SEO / Performance / i18n — A-Pagar

> Fecha: 2026-06-13 | Auditor: Claude Code (claude-sonnet-4-6) | Skills aplicadas: `web-performance-optimization`, `seo-technical`, `schema-markup`, `i18n-localization`
> Stack auditado: Next.js 16.2.7 (App Router, Turbopack), React 19.2, Tailwind 4, Supabase, Gemini OCR, @vercel/analytics, web-push. Deploy en Vercel.

---

## Resumen ejecutivo

La app tiene una base SEO sólida para sus páginas públicas (landing + privacidad): metadata bien estructurada, OG dinámico, robots.txt con exclusiones correctas, y el atributo `lang="es"` en el html. El mayor acierto de performance es que **`@google/generative-ai` está 100% server-side** en la API route `/api/ocr/route.ts` y no contamina el bundle cliente bajo ninguna circunstancia. Sin embargo, hay cuatro problemas de impacto alto en CWV móvil 3G: (1) todas las páginas de interacción son Client Components, impidiendo streaming y server-rendering del contenido inicial; (2) las fuentes de Google Fonts se cargan sin `preconnect` explícito; (3) el hero de la landing no tiene LCP hero imagen optimizada con `next/image` (es JSX puro, sin un elemento img dominante); (4) el OCR es la operación más costosa en tiempo de respuesta real (~5-15s) y no tiene feedback de progresión real para el usuario. En i18n, el hardcoding es completo y correcto para el mercado chileno actual, pero el RUT, el separador de miles (punto) y la lista de bancos chilenos harían un port LatAm significativamente costoso.

---

## Performance

### [SEV-ALTA] Todas las rutas de interacción son Client Components completos

**Archivo:** `src/app/s/[id]/page.tsx:1`, `src/app/host/[id]/page.tsx:1`, `src/app/crear/page.tsx:1`, `src/app/cuenta/page.tsx:1`

**Descripción:** Cada página de interacción empieza con `'use client'`, lo que convierte la ruta entera en un Client Component. Next.js App Router con React 19 permite Server Components para el shell/wrapper y Client Components sólo para las partes interactivas. Actualmente todo el JS de supabase-js client, lucide-react, lógica de estado, etc., va en el bundle cliente de cada ruta.

**Impacto en CWV:** TTI (Time to Interactive) elevado en 3G. El navegador debe descargar, parsear y ejecutar todo el bundle antes de que el usuario pueda interactuar. INP (Interaction to Next Paint) afectado por la cantidad de JS en el hilo principal.

**Recomendación:** Extraer la capa de datos/shell de `/s/[id]` y `/host/[id]` como Server Components que hagan el fetch inicial de Supabase server-side, y dejar sólo los componentes interactivos (ItemsClaimList, formularios de nombre) como `'use client'`. Esto reduce el JS inicial y permite streaming del HTML.

---

### [SEV-ALTA] Imágenes sin `next/image` — potencial CLS y LCP no optimizado

**Archivo:** `src/app/crear/page.tsx:482`, `src/components/session/ocr-uploader.tsx:154`

**Descripción:** Hay dos `<img>` nativos con comentario `{/* eslint-disable-next-line @next/next/no-img-element */}`. El primero es el preview de la boleta escaneada (local blob URL), el segundo es la imagen OCR que se muestra durante el proceso. Aunque estos son dinámicos (blob URLs), no tienen dimensiones declaradas.

**Impacto en CWV:** CLS (Cumulative Layout Shift) cuando la imagen carga y empuja contenido. En la landing el hero no tiene ninguna imagen real — es JSX/SVG — lo cual es positivo para LCP (el LCP será un nodo de texto grande `<h1>`), pero hay que confirmar que el `<h1>` sí es el elemento LCP.

**Recomendación:** Asignar `width` y `height` explícitos a los `<img>` dinámicos para reservar espacio (evitar CLS). Para el preview: `style={{ aspectRatio: '3/4' }}` o un contenedor con height fijo. No es necesario `next/image` para blobs, pero sí las dimensiones.

---

### [SEV-ALTA] Fuentes de Google Fonts sin preconnect explícito + double-roundtrip

**Archivo:** `src/app/layout.tsx:2`

**Descripción:** `Plus_Jakarta_Sans` y `Geist_Mono` se cargan via `next/font/google` con `display: 'swap'`. Next.js genera preload links automáticamente, pero la conexión a `fonts.gstatic.com` (donde vive el WOFF2) requiere un preconnect explícito que Next.js no siempre inyecta en tiempo de build con Turbopack.

**Impacto en CWV:** LCP puede aumentar hasta 200-400ms en conexiones 3G si las fuentes bloquean el render del `<h1>`. Con `display: 'swap'` hay FOUT (Flash Of Unstyled Text), lo que puede contribuir a CLS si el tamaño del font system y Plus Jakarta Sans difieren notablemente.

**Recomendación:** Verificar que los headers de respuesta de Vercel incluyan `Link: <fonts.gstatic.com>; rel=preconnect`. Si no, agregar manualmente en el layout:
```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
```
También evaluar `display: 'optional'` para Geist Mono (solo se usa en montos), lo que eliminaría el FOUT para ese subconjunto.

---

### [SEV-ALTA] `web-push` en dependencias normales: riesgo de bundling cliente

**Archivo:** `package.json:18`

**Descripción:** `web-push: ^3.6.7` está en `dependencies` (no en `devDependencies`). Es una librería Node.js pura (usa `crypto`, `http`), pero Next.js puede intentar incluirla en el bundle cliente si algún import se filtra. Actualmente sólo se usa en `src/app/api/push/` (route handlers), lo cual es correcto, pero no hay configuración de `serverExternalPackages` en `next.config.ts` para garantizarlo.

**Impacto en CWV:** Si se bundlea en el cliente, añadiría ~50-80KB de código Node incompatible, causando errores de runtime y aumentando el parse time.

**Recomendación:** Agregar a `next.config.ts`:
```typescript
const nextConfig: NextConfig = {
  serverExternalPackages: ['web-push'],
  // ...
};
```
Esto garantiza que Webpack/Turbopack nunca lo incluya en el bundle cliente.

---

### [SEV-MEDIA] Sin code splitting en páginas de flujo de creación (`/crear`)

**Archivo:** `src/app/crear/page.tsx:1`

**Descripción:** La página `/crear` contiene tres flujos (modo selector, flujo por ítems, flujo de partes iguales) en un solo archivo de ~843 líneas. Todo el código se carga aunque el usuario sólo use uno de los flujos. Los componentes `OcrUploader`, `ItemRow`, `SelectField`, `StepIndicator` se cargan en el bundle inicial aunque el usuario elija "Partes iguales".

**Impacto en CWV:** Bundle de primera carga más grande de lo necesario. En 3G, cada KB adicional cuesta ~8-12ms de descarga + tiempo de parse.

**Recomendación:** Usar `next/dynamic` con lazy loading para `OcrUploader` y `ItemRow` (sólo necesarios en flujo "Por ítems"). Separar los dos flujos en sub-componentes cargados dinámicamente:
```typescript
const OcrUploader = dynamic(() => import('@/components/session/ocr-uploader'), { ssr: false })
```

---

### [SEV-MEDIA] OCR latency: el usuario espera 5-15s sin feedback real de progresión

**Archivo:** `src/components/session/ocr-uploader.tsx:51-88`

**Descripción:** El flujo OCR es: compressImage → POST /api/ocr → Gemini API. El tiempo total puede ser 5-20s dependiendo de la carga de Gemini. El feedback es un spinner con mensaje "Leyendo boleta con IA..." que cambia a "Gemini ocupado, reintentando..." a los 8s. El route handler en `/api/ocr/route.ts` tiene retry logic con `MODEL_CASCADE` (`gemini-2.5-flash-lite` → `gemini-2.5-flash` → `gemini-2.0-flash`).

**Impacto CWV:** No afecta métricas de carga, pero sí la UX percibida. En 3G, la imagen comprimida (~200-400KB) primero sube, luego espera la IA. El tiempo total puede superar el límite de timeout de Vercel Serverless (por defecto 10s en el plan gratuito).

**Recomendación:** (1) Verificar el límite de timeout en Vercel (`maxDuration` en la route). (2) Considerar streaming de respuesta con SSE/ReadableStream para dar feedback granular. (3) La compresión a 1600px maxDimension y quality 0.82 es razonable; mantenerla.

---

### [SEV-MEDIA] Service Worker cacheando rutas que requieren JS (`/crear`, `/cuenta`)

**Archivo:** `public/sw.js:8`

**Descripción:** El SW cachea `['/', '/crear', '/cuenta', '/privacidad', '/manifest.webmanifest']` en el install. `/crear` y `/cuenta` son Client Components puros que no renderean HTML útil sin JS. Si el SW sirve la shell cacheada sin JS disponible (offline), el usuario verá una pantalla en blanco o el spinner eterno.

**Impacto:** Experiencia offline degradada. El SW usa network-first para navegaciones, lo que mitiga el problema en condiciones normales, pero en offline real (restaurante sin señal), el fallback del cache es una página sin contenido visible.

**Recomendación:** Considerar añadir un skeleton HTML estático para el cache offline de `/crear` y `/cuenta`, o excluirlos del pre-cache y sólo cachear `/` y `/privacidad` que sí tienen contenido renderizable sin datos dinámicos.

---

### [SEV-MEDIA] `@vercel/analytics` se carga en todas las páginas incluyendo las privadas

**Archivo:** `src/app/layout.tsx:58`

**Descripción:** `<Analytics />` de `@vercel/analytics/next` está en el RootLayout y carga en todas las rutas, incluyendo `/s/[id]` y `/host/[id]`. Para el flujo crítico del participante (primera interacción: ingresar nombre en restaurante con 3G), esto añade una petición y ejecución de JS adicional.

**Impacto:** ~5-15KB de JS adicional en el bundle de rutas privadas que probablemente no necesitan analítica detallada por ruta (son links de un solo uso).

**Recomendación:** Evaluar si realmente se necesita analytics en `/s/[id]` y `/host/[id]`. Si no, se puede condicionar con `if (process.env.NODE_ENV === 'production')` o usar el modo `mode="auto"` que difiere la carga.

---

### [SEV-BAJA] Sin `Image` optimization para el OG image generator

**Archivo:** `src/app/opengraph-image.tsx:1`

**Descripción:** El OG image usa `ImageResponse` de `next/og` con solo fuentes del sistema (sin `satori` fonts cargadas). Esto es correcto y eficiente. Sin embargo, el tamaño 1200×630 es estándar pero no se está aprovechando para Twitter cards más pequeñas (600×314 para `summary`).

**Impacto:** Mínimo. La imagen se genera una vez y Vercel la cachea.

**Recomendación:** Ninguna acción urgente. Considerar agregar un subset de fuente para que el texto del OG image use Plus Jakarta Sans en lugar del fallback del sistema.

---

### [SEV-BAJA] Sin `preload` para el LCP probable

**Archivo:** `src/app/layout.tsx`, `src/app/page.tsx:33`

**Descripción:** El LCP de la landing probablemente es el `<h1>` con el texto "Divide la cuenta sin drama". Como es texto puro (no imagen), no necesita preload de imagen. La fuente Plus Jakarta Sans sí necesita estar disponible. Next.js con `next/font/google` añade `<link rel="preload">` automáticamente para el subset `latin`, lo cual es correcto.

**Recomendación:** Confirmar con PageSpeed Insights / CrUX que el LCP es efectivamente el `<h1>`. Si fuera otro elemento (ej: el receipt mockup card), ajustar en consecuencia.

---

### [SEV-BAJA] Sin configuración explícita de cache headers para assets estáticos

**Archivo:** `next.config.ts`

**Descripción:** No hay configuración de `headers()` en `next.config.ts`. Vercel añade automáticamente `Cache-Control: public, max-age=31536000, immutable` para assets de `_next/static/`, pero no para `/public/sw.js`, `/public/manifest.webmanifest`, etc.

**Recomendación:** Agregar headers explícitos para el SW (debe tener `no-cache` para que las actualizaciones funcionen) y para el manifest. El SW sin `no-cache` puede hacer que una actualización tarde hasta 24h en propagarse.

---

## SEO técnico

### Checklist por ruta

| Ruta | Indexable | `robots` | `title` | `description` | OG image | canonical | Estado |
|------|-----------|---------|---------|---------------|----------|-----------|--------|
| `/` | Sí | ✅ (default allow) | ✅ "A-Pagar — Divide la cuenta sin caos" | ✅ 157 chars | ✅ /opengraph-image.tsx | ❌ Ausente | BUENO (sin canonical) |
| `/crear` | Sí (en sitemap) | ✅ allow | ❌ Sin metadata propia | ❌ Hereda layout | ⚠️ Hereda OG genérico | ❌ Ausente | GAP |
| `/cuenta` | No especificado | ✅ allow | ❌ Sin metadata propia | ❌ Sin descripción | ❌ Sin OG propio | ❌ Ausente | GAP |
| `/privacidad` | Sí | ✅ allow | ✅ "Privacidad — A-Pagar" | ✅ | ❌ Sin OG propio | ❌ Ausente | BUENO |
| `/s/[id]` | No | ✅ `robots: noindex, nofollow` en layout | ✅ Dinámico (generateMetadata) | ✅ | ✅ Hereda OG genérico | N/A | CORRECTO |
| `/host/[id]` | No | ✅ `robots: noindex, nofollow` en layout | ✅ "Tu boleta — A-Pagar" | ❌ Sin descripción | ❌ Sin OG | N/A | CORRECTO (no es indexable) |

---

### [SEV-ALTA] Sin tag `canonical` en ninguna ruta

**Archivos:** `src/app/layout.tsx`, todas las páginas públicas

**Descripción:** No hay `alternates.canonical` en ningún objeto `Metadata`. Next.js App Router NO genera canonical automáticamente basándose en `metadataBase`. Es responsabilidad del desarrollador añadirlo.

**Impacto SEO:** Si la app es accesible en múltiples dominios (a-pagar.vercel.app + dominio propio), Google puede indexar versiones duplicadas y dividir el link equity. Aunque hoy el sitio es pequeño, es una deuda técnica que crece.

**Recomendación:** Añadir en el RootLayout:
```typescript
export const metadata: Metadata = {
  metadataBase: new URL('https://a-pagar.vercel.app'),
  alternates: {
    canonical: '/',
  },
  // ...
}
```
Y en cada página pública, el canonical relativo correspondiente (`/crear`, `/privacidad`).

---

### [SEV-ALTA] `/crear` sin metadata propia — indexada pero sin título/descripción propios

**Archivo:** `src/app/crear/page.tsx:1` (no tiene `export const metadata`)

**Descripción:** `/crear` está en el sitemap con `priority: 0.8` pero no tiene su propia `metadata`. Google indexará la página con el título del layout raíz ("A-Pagar — Divide la cuenta sin caos"), que es genérico y no describe la acción de crear una sesión.

**Impacto SEO:** El snippet en SERPs no será descriptivo para la página `/crear`. Duplica el título de la home en el índice.

**Recomendación:** Añadir al archivo de la página (o en un `layout.tsx` específico para `/crear`):
```typescript
export const metadata: Metadata = {
  title: 'Nueva boleta — A-Pagar',
  description: 'Sube la foto de tu boleta, deja que la IA extraiga los ítems y comparte el link con tu grupo.',
  alternates: { canonical: '/crear' },
}
```
Nota: `crear/page.tsx` es un Client Component puro (`'use client'`). En App Router, metadata no se puede exportar desde Client Components. Hay que crear un `src/app/crear/layout.tsx` (Server Component) con la metadata.

---

### [SEV-MEDIA] `/cuenta` accesible e indexable pero sin protección ni metadata de noindex

**Archivo:** `src/app/cuenta/page.tsx:1`

**Descripción:** `/cuenta` muestra el historial de boletas del usuario (localStorage). Está en el `robots.txt` como permitida (no está en `disallow`). No está en el sitemap, lo cual es correcto, pero tampoco tiene `robots: noindex`. Si Google la rastrea, encontrará una página en blanco (Client Component que depende de localStorage, sin contenido servidor).

**Impacto SEO:** Google puede gastar crawl budget en una página sin contenido renderizable. Aunque no es crítico para un sitio pequeño, es subóptimo.

**Recomendación:** Añadir metadata con `robots: noindex` a `/cuenta`:
```typescript
// src/app/cuenta/layout.tsx (nuevo)
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}
```

---

### [SEV-MEDIA] OG image de `/s/[id]` usa el OG genérico, no imagen dinámica por sesión

**Archivo:** `src/app/s/[id]/layout.tsx:37`

**Descripción:** El OG para `/s/[id]` incluye `images: ['/opengraph-image']` (la imagen genérica de 1200×630). Cuando alguien comparte el link de la sesión por WhatsApp, la preview muestra "Divide la cuenta. Sin drama." en lugar de algo personalizado con el nombre del restaurante o del host.

**Impacto SEO/UX:** No es crítico porque `/s/[id]` está noindexed, pero sí afecta la conversión del link compartido (WhatsApp card). Una imagen dinámica con el nombre del restaurante/host mejoraría el click-through.

**Recomendación:** Crear `src/app/s/[id]/opengraph-image.tsx` como una imagen dinámica que reciba los parámetros de la sesión y genere una imagen con el nombre del host y restaurante.

---

### [SEV-BAJA] robots.txt: sin reglas para crawlers de IA

**Archivo:** `src/app/robots.ts`

**Descripción:** El robots.txt actual sólo tiene una regla global `User-agent: *`. No hay reglas para crawlers de IA como GPTBot, ClaudeBot, Google-Extended, Bytespider, PerplexityBot, CCBot.

**Impacto:** Las páginas públicas (landing, privacidad) serán rastreadas e indexadas por los crawlers de IA para entrenamiento de modelos. Para una app chilena de consumidores, la visibilidad en motores de búsqueda generativos podría ser beneficiosa (AEO - Answer Engine Optimization).

**Recomendación:** Decisión estratégica del equipo. Si se quiere aparecer en respuestas de PerplexityBot/ChatGPT browsing, dejar como está. Si se quiere evitar el uso de los datos para entrenamiento, agregar reglas explícitas por crawler. No es urgente.

---

### [SEV-BAJA] Sitemap incluye `/crear` pero es una ruta de acción, no de contenido indexable

**Archivo:** `src/app/sitemap.ts:8`

**Descripción:** `/crear` está en el sitemap con `priority: 0.8`. Aunque no es un error grave, las rutas de "acción" (crear una sesión) rara vez tienen valor SEO propio — los usuarios llegan desde la landing, no buscando directamente "crear boleta". Google puede ignorar el sitemap hint si la página no tiene contenido textual relevante.

**Impacto:** Crawl budget desperdiciado si Google rastrea repetidamente una página que básicamente muestra un formulario vacío sin contenido editorial.

**Recomendación:** Considerar bajar la prioridad de `/crear` a `0.3` o removerla del sitemap. Sólo mantener `/` y `/privacidad`.

---

### [SEV-BAJA] Twitter card sin imagen explícita en el objeto `twitter` del layout

**Archivo:** `src/app/layout.tsx:38-43`

**Descripción:** La metadata de Twitter card en el layout raíz declara `card: 'summary_large_image'` pero no incluye `images`. Next.js App Router NO hereda automáticamente la OG image para Twitter cards — requiere declaración explícita.

**Impacto:** Twitter/X mostraría la card sin imagen si no encuentra un `og:image` válido, o mostraría la imagen pero sin optimización para el formato de Twitter.

**Recomendación:**
```typescript
twitter: {
  card: 'summary_large_image',
  title: 'A-Pagar — Divide la cuenta sin caos',
  description: 'Foto de la boleta → link por WhatsApp → cada uno paga su parte.',
  images: ['/opengraph-image'],
},
```

---

### [SEV-BAJA] `metadataBase` con fallback a dominio de Vercel

**Archivo:** `src/app/layout.tsx:23`

**Descripción:** `new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://a-pagar.vercel.app')`. Si `NEXT_PUBLIC_SITE_URL` no está configurado en el entorno de producción de Vercel, todos los URLs de OG, sitemap y robots usarán `a-pagar.vercel.app`. Si el dominio de producción es otro, esto genera inconsistencias en los URLs canónicos/OG.

**Recomendación:** Confirmar que `NEXT_PUBLIC_SITE_URL` está configurado en el panel de Vercel con el dominio real de producción.

---

## Schema markup

### Estado actual

**No existe ningún JSON-LD** en la aplicación. Se verificó con grep sobre todo el directorio `src/` — no hay `schema.org`, `SoftwareApplication`, `WebApplication`, ni ningún tipo de structured data implementado.

### Evaluación de elegibilidad (Schema Eligibility & Impact Index)

**Para la landing (`/`)**:

| Categoría | Puntos | Nota |
|-----------|--------|------|
| Content–Schema Alignment | 22/25 | El contenido (app de utilidad) coincide bien con SoftwareApplication |
| Rich Result Eligibility (Google) | 15/25 | SoftwareApplication tiene soporte limitado de Google; no genera rich result de SERP directo |
| Data Completeness & Accuracy | 16/20 | Nombre, descripción, categoría disponibles; rating no existe |
| Technical Correctness | 15/15 | JSON-LD estático es trivial |
| Maintenance & Sustainability | 9/10 | Datos estáticos, fácil de mantener |
| Spam / Policy Risk | 5/5 | Sin riesgo |
| **Total** | **82/100** | **Válido pero Limitado** |

### Tipos JSON-LD recomendados

#### 1. `SoftwareApplication` / `WebApplication` — landing (`/`)

Beneficio: Aparece en SERPs con rating (si se agregan reviews), clarifica a Google que es una app web. Puntuación: 82/100 (Valid but Limited).

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "A-Pagar",
  "description": "Sube la foto de la boleta, comparte el link por WhatsApp y cada uno marca lo que pidió. Sin apps, sin cuentas.",
  "applicationCategory": "FinanceApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "CLP"
  },
  "url": "https://a-pagar.vercel.app",
  "inLanguage": "es-CL"
}
```

**Placement:** En `src/app/page.tsx` como `<script type="application/ld+json">` dentro del Server Component (la landing es el único SC).

#### 2. `FAQPage` — landing (`/`)

La landing actualmente NO tiene una sección de FAQ visible. Para implementar FAQPage correctamente se necesitaría agregar primero contenido FAQ visible en la página (requisito de Google: las preguntas y respuestas deben ser visibles para el usuario). Si se agrega una sección FAQ a la landing, este tipo tendría una puntuación de 88/100 y podría generar rich results directamente en SERPs.

**Preguntas FAQ sugeridas para la landing (si se añade la sección):**
- "¿Necesito crear una cuenta para usar A-Pagar?"
- "¿Cómo funciona el escaneo de la boleta?"
- "¿Puedo usar A-Pagar sin conexión a internet?"
- "¿Qué pasa si la IA no lee bien la boleta?"

#### 3. `Organization` — recomendado para brand entity

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "A-Pagar",
  "url": "https://a-pagar.vercel.app",
  "contactPoint": {
    "@type": "ContactPoint",
    "email": "benjavsqueza@gmail.com",
    "contactType": "customer support"
  }
}
```

#### Tipos NO recomendados

- `Product` — no es un producto físico ni SaaS con precio
- `LocalBusiness` — no es un negocio físico
- `Review/AggregateRating` — no existen reviews verificables actualmente

---

## i18n / L10n

### Estado actual: es-CL hardcodeado, sin framework

**Hallazgos globales:**

1. `lang="es"` en `<html>` (`src/app/layout.tsx:53`) — correcto, pero debería ser `lang="es-CL"` para ser preciso con el locale chileno.
2. `locale: 'es_CL'` en OpenGraph (`src/app/layout.tsx:36`) — correcto (formato OG usa underscore).
3. `Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' })` en `src/lib/utils.ts:10` — excelente uso de la Intl API estándar.
4. `new Intl.NumberFormat('es-CL', ...)` inline en `src/app/s/[id]/page.tsx:273` — duplicación del formatter; debería usar `formatCLP()` del utils.

---

### [SEV-BAJA] `lang="es"` debería ser `lang="es-CL"` en el html raíz

**Archivo:** `src/app/layout.tsx:53`

**Descripción:** El atributo `lang="es"` indica español genérico. Para una app explícitamente chilena con contenido de localización muy específica (CLP, RUT, bancos chilenos), `lang="es-CL"` es más preciso. Esto afecta lectores de pantalla (pronunciación), herramientas de SEO que detectan el idioma, y potencialmente hreflang si se añaden idiomas futuros.

**Recomendación:** Cambiar a `<html lang="es-CL">` en `src/app/layout.tsx:53`.

---

### [SEV-BAJA] Formatter de moneda duplicado inline

**Archivo:** `src/app/s/[id]/page.tsx:273`

**Descripción:** `new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(myTotal)` está escrito inline cuando ya existe `formatCLP()` en `src/lib/utils.ts`.

**Impacto i18n:** Duplicación que hace más difícil cambiar el locale/moneda en el futuro. Si se cambia CLP por otro currency, hay que recordar actualizar este inline también.

**Recomendación:** Reemplazar con `formatCLP(myTotal)`.

---

### [SEV-INFO] Calidad de la localización chilena: MUY BUENA

**Evaluación positiva de los siguientes elementos:**

- **formatCLP:** Usa `Intl.NumberFormat` con `es-CL` y `CLP` — correcto. El separador de miles (punto) y el símbolo `$` se manejan nativamente por la API.
- **formatRut:** Implementación completa del algoritmo de dígito verificador chileno con validación (`isValidRut`). Correcto y robusto.
- **Bancos chilenos:** Lista exhaustiva en `src/app/crear/page.tsx:19-23` incluye Banco Estado, BCI, Santander, BBVA, Itaú, Scotiabank, MACH, Tenpo, Mercado Pago, Coopeuch. Adecuada para el mercado objetivo.
- **Tipos de cuenta:** Incluye "Cuenta RUT (BancoEstado)" que es específico de Chile.
- **Propina:** El valor default de 10% es culturalmente correcto para Chile (propina estándar en restaurantes).
- **Vocabulario:** "Boleta" (no "recibo" ni "factura"), "transferencia" (no "pago bancario"), "RUT" (no "NIF"), "propina" correctamente separada del total.

---

### [SEV-MEDIA] Costo estimado de un port LatAm / multi-moneda

**Descripción:** Actualmente el hardcoding de locale afecta múltiples capas:

| Área | Alcance del cambio | Estimado |
|------|-------------------|----------|
| `formatCLP` → `formatCurrency(amount, currency)` | 1 archivo, ~5 líneas | Trivial |
| Lista de bancos hardcodeada | Config por país (~15 items × N países) | Bajo |
| RUT validation → NIT/CUIT/RUC | Lógica de validación diferente por país | Medio |
| "Boleta" → "Ticket/Factura/Recibo" | Todas las copias de UI | Alto (sin i18n framework) |
| Formato de fecha de "Última actualización: junio 2026" en privacidad | 1 lugar | Trivial |
| Separadores de miles: punto (CL) vs coma (MX/AR/CO/PE) | Ya manejado por Intl.NumberFormat | Cubierto |
| Propina: 10% (CL) vs 0% (AR) vs 15% (MX) | Config por país | Bajo |

**Costo total estimado de un port LatAm sin framework i18n:** 2-4 semanas de desarrollo, principalmente por las ~150-200 strings de UI hardcodeadas en JSX que necesitarían extraerse a un diccionario. La decisión de no usar un i18n framework (next-intl, i18next) fue razonable para el scope actual (monolengua), pero agrega deuda si se internacionaliza.

**Recomendación si se considera LatAm en ≤12 meses:** Instalar `next-intl` ahora y extraer strings en un archivo `es-CL.json`. El costo incremental de hacerlo hoy vs. en 12 meses es bajo; el costo de refactorizar 150+ strings hardcodeadas en 12 meses es alto.

---

### [SEV-INFO] Formato de fechas: sin uso de Intl.DateTimeFormat

**Descripción:** La fecha en `src/app/privacidad/page.tsx:30` es un string hardcodeado: `"junio 2026"`. No hay otras fechas visibles en la UI (las fechas de Supabase son para lógica interna). Si en el futuro se muestran fechas de sesión al usuario, habría que usar `Intl.DateTimeFormat('es-CL')` para el formato correcto (dd/MM/yyyy para Chile).

**Recomendación:** Cuando se muestren fechas al usuario, usar:
```typescript
new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
```

---

## Quick wins

Los siguientes cambios tienen alto impacto con bajo costo de implementación:

1. **[30 min] Añadir `lang="es-CL"`** en `src/app/layout.tsx:53`. Cambio de 1 carácter, impacto en accesibilidad y SEO.

2. **[30 min] Añadir `images: ['/opengraph-image']`** al objeto `twitter` en `src/app/layout.tsx`. Una línea, resuelve el gap de Twitter card.

3. **[30 min] Agregar `alternates: { canonical: '/' }`** en el metadata del layout y en cada página pública. Previene indexación duplicada.

4. **[1h] Crear `src/app/crear/layout.tsx`** con metadata propia para `/crear`. Resuelve el problema de título duplicado en SERPs.

5. **[1h] Crear `src/app/cuenta/layout.tsx`** con `robots: { index: false, follow: false }`. Evita que Google rastree una página vacía.

6. **[1h] Agregar `serverExternalPackages: ['web-push']`** en `next.config.ts`. Garantiza que web-push nunca se bundlee en el cliente.

7. **[2h] Añadir JSON-LD `SoftwareApplication`** en `src/app/page.tsx`. Primer schema markup de la app, impacto en knowledge graph.

8. **[30 min] Reemplazar el `Intl.NumberFormat` inline** en `src/app/s/[id]/page.tsx:273` con `formatCLP()`.

9. **[30 min] Agregar dimensiones** (`width`, `height` o `style={{ aspectRatio }}`) a los dos `<img>` nativos para prevenir CLS.

10. **[30 min] Configurar cache headers** para `sw.js` con `Cache-Control: no-cache, no-store, must-revalidate` en `next.config.ts headers()`.

---

## Preguntas abiertas

1. **¿Cuál es el dominio de producción definitivo?** `NEXT_PUBLIC_SITE_URL` necesita estar correctamente configurado en Vercel. Si el dominio no es `a-pagar.vercel.app`, todos los URLs de sitemap, robots y canonical están equivocados.

2. **¿Hay planes de añadir contenido editorial a la landing?** Si se añade una sección FAQ, blog, o casos de uso, el impacto SEO aumentaría significativamente y justificaría FAQPage schema.

3. **¿Cuál es el límite de timeout en el plan de Vercel?** Las funciones serverless en el plan gratuito tienen límite de 10s. El OCR con `gemini-2.5-flash` puede tardar más. ¿Hay configuración de `maxDuration` en la route?

4. **¿Se planea expansión LatAm en < 12 meses?** Determina si vale la pena instalar `next-intl` ahora vs. esperar.

5. **¿Hay un dominio `.cl` registrado?** Para SEO geolocalizado en Chile, un dominio `.cl` da señales geográficas más fuertes que `.vercel.app` o `.com`.

6. **¿Se está midiendo INP en campo?** Con Supabase Realtime suscrito en `/host/[id]` y `/s/[id]`, el hilo principal recibe callbacks de WebSocket que pueden crear tareas largas. Sin medición de campo no se puede confirmar si el INP está dentro del umbral de 200ms.

7. **¿Las animaciones CSS usan `will-change` o `transform`?** Las animaciones `fade-up` y `stagger` en `globals.css` usan `opacity` y `transform`, que son GPU-composited y no deberían afectar el CLS. Pero el `stagger` con `animation-delay` puede causar flashes si el CSS no carga sincrónicamente.

8. **¿La OG image se genera en el Edge o en Node?** `src/app/opengraph-image.tsx` usa `ImageResponse` que puede correr en Edge Runtime. Si hay fuentes personalizadas requeridas en el futuro, Edge Runtime tiene límites de tamaño de función.
