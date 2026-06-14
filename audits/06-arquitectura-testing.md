# Auditoría de Arquitectura, Calidad y Testing — A-Pagar

> Auditor: Claude (claude-sonnet-4-6) con skills `architect-review`, `software-architecture`, `production-code-audit`, `e2e-testing-patterns`
> Fecha: 2026-06-13
> Base: commit `c92936a` + cambios sin commitear

---

## Resumen ejecutivo

A-Pagar es una PWA funcional y bien intencionada, pero su arquitectura refleja un crecimiento iterativo sin separación deliberada de capas. Las páginas actúan como componentes-Dios: mezclan data-fetching, estado de UI, lógica de negocio y presentación en archivos de 500-840 líneas. La lógica de cálculo de divisiones está parcialmente centralizada en `utils.ts` pero es **reimplementada de forma divergente** en `cuenta/page.tsx` y en `host/[id]/page.tsx`, lo que constituye el riesgo técnico más alto del sistema.

No existen tests de ningún tipo. Aunque Playwright está instalado como devDependency, no hay ningún archivo de configuración ni suite. El typecheck pasa y ESLint está configurado correctamente, pero no corren en ningún pipeline CI.

**Grado de salud arquitectónica: C+**
Funcional para MVP, pero la ausencia de tests + divergencia de lógica de dominio crea una deuda que se vuelve peligrosa al agregar features o al crecer el equipo.

---

## Mapa de arquitectura actual (capas, flujo de datos, acoplamientos)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BROWSER                                                                │
│                                                                         │
│  page.tsx ──────── useSession (hook) ───── createClient() ── Supabase  │
│  (God Component)                           (instanciado     (Postgres   │
│  • estado UI       • realtime channel       en cada call)    Realtime   │
│  • data-fetching   • CRUD claims/payments                    Storage)   │
│  • cálculo dominio • confirmPayment/close                               │
│  • presentación    • optimistic updates                                 │
│                                                                         │
│  crear/page.tsx ── createClient() ── Supabase (insert directo)          │
│  (sin hook)                                                             │
│                                                                         │
│  cuenta/page.tsx ── createClient() ── 5 queries paralelas               │
│  (sin hook, lógica   (cálculo target reimplementado)                   │
│   de target inline)                                                     │
│                                                                         │
│  SHARED DOMAIN LOGIC                                                    │
│  src/lib/utils.ts                                                       │
│  • computeItemWithClaims()   ◄── usado desde useSession, host, s/[id]  │
│  • computeParticipantSummary() ◄── usado en host/[id] y s/[id]         │
│                                                                         │
│  DUPLICATED IN cuenta/page.tsx                                          │
│  • targetToCollect (lógica inline ~líneas 115-120)                     │
│  • claimedTotals con lógica guest/host (líneas 63-79)                  │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  SERVER (Next.js API Routes)                                            │
│                                                                         │
│  /api/ocr/route.ts  ── GoogleGenerativeAI ── Gemini (3 modelos cascade) │
│  /api/push/subscribe ── createClient() (server, anon key)              │
│  /api/push/send ──────── createAdminClient() / createClient()          │
│                          webpush.sendNotification()                    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  DATABASE (Supabase / Postgres)                                         │
│                                                                         │
│  sessions → items → claims ─┐                                          │
│           ↓                 │ (session_id backfill vía trigger)        │
│     participants            │                                           │
│           ↓                 │                                           │
│       payments ─────────────┘                                          │
│       session_secrets (host_token, sin SELECT público)                  │
│       push_subscriptions                                                │
└─────────────────────────────────────────────────────────────────────────┘
```

### Flujo de datos crítico (por ítems)

1. **Crear** (`crear/page.tsx`): instancia `createClient()` directamente, escribe a Supabase, registra `host_token`, crea participante-host. Sin abstracción.
2. **Host view** (`host/[id]/page.tsx`): consume `useSession` que carga 5 tablas + abre 3 canales realtime. Calcula `targetToCollect`, `confirmedAmount`, `progressPct` inline en el componente (~líneas 163-194).
3. **Participant view** (`s/[id]/page.tsx`): consume `useSession`. Instancia `createClient()` inline para el join, upload de comprobante y mark-as-paid. Lógica de `sharePerPerson` y `myTotal` inline.
4. **Mis boletas** (`cuenta/page.tsx`): SIN `useSession`. Hace sus propias 5 queries en paralelo con `Promise.all`. Re-implementa el cálculo de `target` y `claimedTotals` con lógica propia (~80 líneas de lógica de dominio inline).

### Acoplamientos problemáticos

- Cada archivo que necesita datos instancia `createClient()` directamente. Hay 7 puntos distintos de instanciación del cliente Supabase en componentes cliente.
- `computeParticipantSummary` vive en `utils.ts` pero su equivalente para el dashboard (`cuenta/`) es una reimplementación ad-hoc que usa rutas de cálculo diferentes.
- El `useSession` hook mezcla: (a) loading state, (b) realtime, (c) mutaciones optimistas, (d) lógica de negocio de autorización (token de host). Cuatro responsabilidades distintas.

---

## Hallazgos priorizados

### [SEV-CRÍTICO-1] Divergencia de lógica de cálculo: `targetToCollect` en tres lugares

**Archivo**: `src/app/host/[id]/page.tsx:163-194`, `src/app/cuenta/page.tsx:115-120`, `src/lib/utils.ts:66-87`

**Descripción**: La lógica de "cuánto debe cobrar el host" está en tres implementaciones distintas:

- `utils.ts:computeParticipantSummary` calcula el total de un participante (subtotal + propina), usada en host y s/[id].
- `host/[id]/page.tsx:187-194` calcula `targetToCollect` y `confirmedAmount` inline con distinción `isEqual` branch.
- `cuenta/page.tsx:63-79` reimplementa la lógica de "¿qué deben los invitados?" con código original: calcula `claimedTotals[item.session_id] += (item.price / cc.total) * cc.guests` (usa división flotante sin `Math.ceil`), mientras `computeItemWithClaims` usa `Math.ceil(item.price / count)`.

**Impacto**: Un cambio en la regla de negocio (ej: cambiar redondeo, agregar fees, multi-moneda) debe hacerse en 3 lugares. Una discrepancia de 1 peso ya existe: la versión de `cuenta/` puede mostrar un `target` diferente al que ve el host en tiempo real.

**Recomendación**: Extraer un módulo `src/lib/billing.ts` (o `src/lib/session-calculator.ts`) con todas las funciones de cálculo puras: `computeItemShare`, `computeParticipantTotal`, `computeTargetToCollect`, `computeProgress`. Ninguna página debería tener aritmética de negocio inline.

---

### [SEV-CRÍTICO-2] Componente-Dios: `crear/page.tsx` (843 líneas)

**Archivo**: `src/app/crear/page.tsx:1-843`

**Descripción**: Un solo archivo contiene: selector de modo, flujo items (3 pasos), flujo equal (2 pasos), lógica de OCR callback, lógica de re-análisis, dos handlers de creación de sesión en Supabase, el subcomponente `HostDataForm`, el subcomponente `StepIndicator`, constantes de bancos y tipos de cuenta. La función `handleCreateItems` (líneas 204-280) mezcla validación, construcción de payload, llamadas a Supabase, gestión de errores y navegación.

**Impacto**: Imposible testear la lógica de creación sin renderizar el componente completo. Cualquier refactor rompe múltiples responsabilidades. Dificulta code review y la colaboración.

**Recomendación**: Descomponer en: (a) `src/lib/session-service.ts` con `createItemsSession()` y `createEqualSession()`, (b) submódulos de step (`ItemsStep`, `EqualAmountStep`, `HostDataStep`), (c) hook `useCreateSession` para el estado del flujo.

---

### [SEV-ALTO-1] Sin separación de data-layer: `createClient()` directo en componentes

**Archivos**: `src/app/crear/page.tsx:211`, `src/app/s/[id]/page.tsx:84,287,327`, `src/app/cuenta/page.tsx:43`

**Descripción**: Las páginas instancian el cliente Supabase directamente y llaman a `.from().insert().select()` inline en handlers de eventos. No existe un repositorio o capa de datos. El componente conoce el nombre de la tabla, la estructura del upsert, el campo `onConflict`, etc.

**Impacto**: Al cambiar el esquema (ej: renombrar `comprobante_url` a `receipt_path`) hay que buscar en toda la codebase. Imposible mockear Supabase en tests sin interceptar la red completa. Viola la separación de capas.

**Recomendación**: Crear `src/lib/repositories/` con funciones puras: `joinSession()`, `uploadReceipt()`, `markAsPaid()`, `registerHostToken()`. Los componentes llaman funciones, no el SDK directamente.

---

### [SEV-ALTO-2] `useSession` tiene cuatro responsabilidades mezcladas

**Archivo**: `src/hooks/use-session.ts:1-180`

**Descripción**: El hook combina: (1) fetching inicial de 5 tablas con N+1 implícito (primero pide los item IDs, luego claims), (2) subscripción a 3 canales realtime distintos, (3) mutaciones optimistas con rollback, (4) lógica de negocio de autorización (validación de `host_token` y fallback legacy PGRST202).

La query de claims tiene un N+1 potencial: primero `select('id') from items where session_id=...`, luego claims con `.in('item_id', itemIds)`. Si no hay items devuelve `Promise.resolve({data:[]})` — correcto, pero el primer query es un round-trip extra innecesario; claims podría joinearse via session_id (la columna existe desde migración 005).

**Impacto**: Difícil de testear, difícil de leer, refactors de realtime afectan mutaciones y viceversa.

**Recomendación**: Dividir en `useSessionData` (fetch + realtime) + `useSessionMutations` (addClaim, removeClaim, confirmPayment, closeSession) + mover la lógica de legacy-token al repositorio.

---

### [SEV-ALTO-3] Lógica de negocio crítica sin tests

**Archivos**: `src/lib/utils.ts`, `src/app/cuenta/page.tsx:63-79`, `src/app/host/[id]/page.tsx:163-194`

**Descripción**: Las funciones `computeItemWithClaims` y `computeParticipantSummary` manejan dinero real (pesos chilenos, sin decimales). Los casos borde no están cubiertos: ¿qué pasa si `count = 0` en `computeItemWithClaims`? (hay un `|| 1` de fallback en línea 58, pero si claims.length es 0 el ítem queda sin reclamar y su `price_per_person` es el total — correcto, pero no documentado). El redondeo con `Math.ceil` no está verificado contra casos de 3+ personas.

**Impacto**: Un bug de redondeo puede hacer que la suma de todos los participantes sea mayor o menor que el total de la boleta en CLP. No hay forma de detectarlo sin correr el sistema manualmente.

---

### [SEV-ALTO-4] Realtime de claims sin filtro por session_id

**Archivo**: `src/hooks/use-session.ts:58`

```typescript
.on('postgres_changes', { event: '*', schema: 'public', table: 'claims' }, () => load())
```

**Descripción**: El canal de `claims` no tiene filtro `session_id`. Cualquier cambio en la tabla `claims` de cualquier sesión activa en Supabase Realtime dispara un `load()` completo en todos los clientes conectados. La columna `session_id` existe en `claims` desde la migración 005 (con trigger para llenarla) pero el código dice explícitamente `// el código aún no la usa`.

**Impacto**: Con N sesiones activas simultáneas, cada claim insertado en cualquier sesión genera O(N) re-cargas completas (5 queries cada una). Problema de escalabilidad serio.

**Recomendación**: Cambiar el filtro a `filter: \`session_id=eq.${sessionId}\`` — ya se puede hacer porque el trigger llena la columna en insert.

---

### [SEV-MEDIO-1] Duplicación de `DraftItem` type

**Archivos**: `src/app/crear/page.tsx:61-64`, `src/components/session/ocr-uploader.tsx:7`

**Descripción**: `DraftItem` se define dos veces con la misma forma. La versión en `ocr-uploader.tsx` solo tiene `name: string; price: string` (sin `quantity`), creando un tipo diferente que se llama igual.

---

### [SEV-MEDIO-2] Fallbacks "si migración no aplicada" en código de producción

**Archivos**: `src/app/crear/page.tsx:47-51,249-259`, `src/hooks/use-session.ts:123-130,160-168`

**Descripción**: El código incluye ramas de compatibilidad para migraciones no aplicadas (005, 007) con `console.warn` explicativos. Esto es correcto durante el rollout, pero es deuda viva: si las migraciones están en producción, el código muerto se mantiene indefinidamente y aumenta la complejidad cognitiva.

**Impacto**: Cada lector del código debe razonar sobre cuál rama se ejecuta en producción. Riesgo de mantener el legacy path después de que ya no es necesario.

---

### [SEV-MEDIO-3] Rate limiter OCR en memoria por instancia serverless

**Archivo**: `src/app/api/ocr/route.ts:159-179`

**Descripción**: `requestLog` es un `Map` en memoria. En un entorno serverless (Vercel), cada invocación frío crea una nueva instancia con el mapa vacío. El rate limit de 10 requests/10min es efectivo solo dentro de la misma instancia caliente. En producción con concurrencia alta, un atacante puede superar el límite fácilmente simplemente generando requests desde múltiples IPs o esperando cold starts.

**Recomendación**: Usar Vercel KV, Upstash, o el rate limit nativo de Vercel para rate limiting distribuido.

---

### [SEV-MEDIO-4] `window.confirm()` para cerrar sesión

**Archivo**: `src/app/host/[id]/page.tsx:114`

```typescript
if (!window.confirm('¿Cerrar esta boleta? Nadie más podrá unirse.')) return
```

**Descripción**: `window.confirm()` bloquea el thread principal, no es estilizable, y no funciona en muchos contextos de WebView o PWA. Es un anti-pattern en React apps modernas.

**Recomendación**: Reemplazar con un modal/dialog propio (ya existe el sistema de toast, puede extenderse a confirm dialog).

---

### [SEV-BAJO-1] Números mágicos sin constante nombrada

**Archivos múltiples**

- `propina_pct: 0 | 10` — el `10` aparece hardcodeado en 4 lugares distintos (`crear/page.tsx:124`, tipo `Session`, selector de propina, etc.)
- `max: 30` para número de personas (`crear/page.tsx:695`)
- `localStorage.slice(0, 60)` en `local-sessions.ts:24`
- `Math.min(20, item.quantity ?? 1)` en OCR route:236

---

### [SEV-BAJO-2] `generateSessionLink` depende de `window.location.origin`

**Archivo**: `src/lib/utils.ts:90`

```typescript
const base = typeof window !== 'undefined' ? window.location.origin : ''
```

**Descripción**: En SSR o en tests, devuelve `''`, generando links rotos como `/s/uuid`. La URL base debería venir de una variable de entorno (`NEXT_PUBLIC_APP_URL`).

---

### [SEV-BAJO-3] Inline styles de animación con strings literales

**Archivos**: `src/app/page.tsx:32`, múltiples

```tsx
style={{ animation: 'fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both' }}
```

**Descripción**: Las curvas de bezier y duraciones de animación están duplicadas como literales en al menos 8 componentes diferentes. Un cambio de timing requiere grep+replace manual.

---

### [SEV-BAJO-4] `console.error` inconsistente en handlers de mutación

**Archivos**: `src/hooks/use-session.ts:88,108`, `src/app/s/[id]/page.tsx:316`

**Descripción**: Los errores de `addClaim` y `removeClaim` se loguean con `console.error` pero no muestran feedback al usuario (no hay `toast`). El participante hace click, la operación falla silenciosamente y el optimistic update se revierte sin explicación.

---

## Lógica de dominio: estado y riesgos (cálculo de cuentas)

### Funciones centralizadas (bien)

En `src/lib/utils.ts`:

- `computeItemWithClaims(item, claims)` → `price_per_person = Math.ceil(item.price / claimsCount)`. Correcto para CLP (sin decimales). El `|| 1` evita división por cero.
- `computeParticipantSummary(participant, items, claims, payments, propinaPct)` → calcula subtotal, propina y total de un participante. Usada correctamente en `host/[id]` y `s/[id]`.

### Lógica dispersa (riesgo)

**En `host/[id]/page.tsx` (inline, no reutilizable):**
```typescript
// línea 163-165
const sharePerPerson = isEqual && session.split_total && session.split_n
  ? Math.ceil(session.split_total / session.split_n)
  : 0
```
```typescript
// línea 187-190
const claimedTotal = summaries.reduce((sum, s) => sum + s.total, 0)
const targetToCollect = isEqual
  ? sharePerPerson * Math.max(0, (session.split_n ?? 1) - 1)
  : claimedTotal
```

**En `cuenta/page.tsx` (reimplementación divergente):**
```typescript
// línea 75-78 — usa floats, no Math.ceil
claimedTotals[item.session_id] =
  (claimedTotals[item.session_id] ?? 0) + (item.price / cc.total) * cc.guests
// ...
// línea 118-120 — aplica propina después
target = Math.ceil(claimed * (1 + session.propina_pct / 100))
```

**Diferencia real**: Si un ítem de $9.900 es reclamado por 2 personas (1 host, 1 guest):
- `computeItemWithClaims`: `Math.ceil(9900 / 2) = 4950` (al guest)
- `cuenta/` version: `9900 / 2 * 1 = 4950.0` → luego `Math.ceil(4950 * 1.1) = 5445`

Ambas dan el mismo resultado en este caso, pero en la versión de `cuenta/` el `Math.ceil` se aplica al total de la sesión, no por ítem, lo que puede generar discrepancias de ±1 peso con propinas en escenarios con muchos ítems compartidos entre N personas.

### Casos borde no testeados

| Caso | Comportamiento esperado | Verificado |
|------|------------------------|------------|
| Ítem compartido entre 3 personas | `Math.ceil(price/3)` × 3 puede ser price+1 o price+2 | No |
| Host sin is_host (legacy) | El host no aparece en guests, target=claimedTotal | No |
| split_n=1 (solo el host) | targetToCollect=0, sin participantes que cobrar | No |
| propina_pct=0 con ítems compartidos | propina=0, total=subtotal | No |
| Ítem sin claims en modo items | price_per_person=full price, no se cobra a nadie | No |
| Todos los claims de un ítem son del host | target no incluye ese ítem | No |

---

## Estrategia de testing propuesta (pirámide + tabla priorizada)

### Pirámide recomendada

```
         /\
        /E2E\     2-3 flujos críticos (Playwright)
       /------\
      /  Integ \   API routes (OCR, push) con fetch mock
     /----------\
    /    Unit    \  Lógica de dominio pura (Vitest)
   /--------------\
```

**Herramientas**:
- **Vitest** para unit/integration (compatible con Vite/Turbopack, más rápido que Jest en este stack)
- **Playwright** (ya instalado) para E2E — configurar `playwright.config.ts`
- **@testing-library/react** para componentes que lo justifiquen
- No se recomienda `jest` (requiere más configuración con Next.js 16 App Router)

**Configuración mínima** (no implementar, solo especificar):
- `vitest.config.ts` con `environment: 'node'` para utils/repos, `environment: 'jsdom'` para componentes
- `playwright.config.ts` con `baseURL: 'http://localhost:3000'`, 1 shard por flujo
- Scripts: `"test": "vitest"`, `"test:e2e": "playwright test"`

### Tabla de primeros 15 casos de test (priorizados)

| # | Tipo | Nombre | Qué verifica | Archivo target |
|---|------|--------|-------------|---------------|
| 1 | **Unit** | `computeItemWithClaims — sin claims` | price_per_person = item.price cuando nadie lo reclamó | `src/lib/utils.ts` |
| 2 | **Unit** | `computeItemWithClaims — 1 claim` | price_per_person = item.price (denominador=1) | `src/lib/utils.ts` |
| 3 | **Unit** | `computeItemWithClaims — 3 claims` | `Math.ceil(9900/3) = 3300` | `src/lib/utils.ts` |
| 4 | **Unit** | `computeParticipantSummary — sin propina` | propina=0, total=subtotal | `src/lib/utils.ts` |
| 5 | **Unit** | `computeParticipantSummary — propina 10%` | propina = `Math.ceil(subtotal * 0.1)` | `src/lib/utils.ts` |
| 6 | **Unit** | `computeParticipantSummary — host excluido` | participante con `is_host=true` tiene total calculado pero no aparece en guests | `src/lib/utils.ts` |
| 7 | **Unit** | `targetToCollect — equal split` | `Math.ceil(total/n) * (n-1)` cuando split_n=4, split_total=40000 → 30000 | lógica extraída de `host/[id]` |
| 8 | **Unit** | `targetToCollect — items mode, host claim` | el ítem reclamado por is_host no suma al target de cobro | lógica extraída de `cuenta/` |
| 9 | **Unit** | `formatCLP` | `formatCLP(9900)` → `'$9.900'`, `formatCLP(0)` → `'$0'` | `src/lib/utils.ts` |
| 10 | **Unit** | `getLocalSession — round-trip` | guardar y recuperar `LocalSessionEntry` con todos los campos | `src/lib/local-sessions.ts` |
| 11 | **Unit** | `isValidRut — casos válidos e inválidos` | RUT `12.345.678-9` válido; `12.345.678-0` inválido | `src/lib/utils.ts` |
| 12 | **E2E** | `Flujo crear boleta por ítems` | (1) Ir a /crear → elegir "Por ítems" → skip scan → agregar 2 ítems → ingresar datos host → click "Generar link" → redirige a /host/[uuid] con los ítems visibles | `tests/crear-items.spec.ts` |
| 13 | **E2E** | `Flujo participante — marcar y pagar` | (1) Abrir link /s/[uuid] → poner nombre → marcar 1 ítem → ver total → click "Ya transferí" → pantalla "Listo" | `tests/participante-pagar.spec.ts` |
| 14 | **E2E** | `Host confirma pago` | Después del test 13: en /host/[uuid] aparece el participante con estado "Transferido — confirmar" → click "Confirmar pago" → estado cambia a "Pagado ✓" y progreso sube | `tests/host-confirmar.spec.ts` |
| 15 | **E2E** | `Flujo partes iguales` | (1) Crear sesión equal con total=$30.000, n=3 → link generado → participante abre → ve "$10.000" → puede registrar pago | `tests/crear-equal.spec.ts` |

**Orden de implementación recomendado**: Tests 1-3 primero (la lógica más crítica, 1 hora de trabajo), luego 4-8 (cubren los casos borde de dinero), luego 12-15 para confianza en flujos completos.

---

## Deuda técnica priorizada

| Prioridad | Item | Esfuerzo | Impacto |
|-----------|------|----------|---------|
| P0 | Centralizar cálculo de billing en `src/lib/billing.ts` y eliminar reimplementaciones | 4h | Elimina el principal riesgo de bugs de dinero |
| P0 | Escribir los tests unit 1-11 de la tabla anterior | 3h | Red de seguridad antes de cualquier feature |
| P1 | Filtrar realtime de claims por `session_id` | 30min | Elimina O(N) re-cargas en escalabilidad |
| P1 | Extraer repository layer (5 funciones) | 4h | Habilita testing sin red |
| P1 | Descomponer `crear/page.tsx` (843 líneas) | 6h | Mantenibilidad y testabilidad |
| P2 | Rate limiter OCR con KV distribuido | 2h | Seguridad real en producción |
| P2 | Reemplazar `window.confirm` con dialog propio | 1h | UX + compatibilidad PWA |
| P2 | Limpiar legacy migration branches cuando se confirme rollout | 2h | Reducir complejidad cognitiva |
| P3 | Extraer constantes de dominio (PROPINA_OPTIONS, MAX_PERSONAS, etc.) | 1h | DRY y un solo lugar para cambiar |
| P3 | E2E suite básica (tests 12-15) | 6h | Confianza en deploys |

---

## Tooling / CI recomendado

### Estado actual
- ESLint configurado con `eslint-config-next` (v9 flat config). Sin `--max-warnings 0` en el script, así que los warnings no bloquean build.
- TypeScript strict: OK. Sin script de typecheck explícito en `package.json`.
- Playwright instalado pero sin config ni tests.
- Sin CI (GitHub Actions o similar).

### Recomendaciones (sin implementar)

```yaml
# .github/workflows/ci.yml (estructura propuesta)
on: [push, pull_request]
jobs:
  quality:
    steps:
      - typecheck: tsc --noEmit
      - lint: eslint --max-warnings 0
      - unit-tests: vitest run
  e2e:
    needs: quality
    steps:
      - build: next build
      - e2e: playwright test
```

**Adiciones al `package.json` scripts**:
```json
"typecheck": "tsc --noEmit",
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test",
"lint:strict": "eslint --max-warnings 0"
```

**Pre-commit con Husky** (opcional pero recomendado):
```bash
# Solo typecheck + lint en archivos staged — no correr tests en cada commit
npx husky add .husky/pre-commit "npx tsc --noEmit && npx eslint --max-warnings 0"
```

**Playwright config mínima** (playwright.config.ts):
- `baseURL`: `http://localhost:3000`
- `use.testIdAttribute`: `data-testid`
- Un sólo worker en CI para evitar condiciones de carrera con Supabase (o usar un proyecto de test dedicado)
- Agregar `data-testid` a los elementos críticos: botón "Generar link", campo nombre, botones de ítems.

---

## Quick wins

Estas son mejoras de <1 hora cada una, de alto valor:

1. **Filtrar realtime de claims** (`use-session.ts:58`): agregar `filter: \`session_id=eq.${sessionId}\`` — 1 línea, impacto inmediato en escalabilidad.

2. **Agregar typecheck al script de build**: en `package.json` cambiar `"build": "tsc --noEmit && next build"` para que el deploy falle si TypeScript rompe.

3. **Mover `sharePerPerson` a utils.ts**: `const computeEqualShare = (total: number, n: number) => Math.ceil(total / n)` — elimina 3 duplicaciones inline.

4. **Agregar `--max-warnings 0` al lint**: `"lint": "eslint --max-warnings 0"` — hace que el pipeline falle ante warnings, no solo errores.

5. **Extraer constantes de dominio**: `const PROPINA_OPTIONS = [0, 10] as const` y `const MAX_PERSONAS = 30` en un `src/lib/constants.ts`.

6. **Agregar `data-testid` a elementos de UI críticos** en los 3 pasos del flujo de creación — prerequisito para E2E sin `page.getByText` frágil.

---

## Preguntas abiertas

1. **¿Las migraciones 005 y 007 están aplicadas en producción?** Si sí, los branches de compatibilidad legacy en `crear/page.tsx` y `use-session.ts` pueden eliminarse, simplificando significativamente el código.

2. **¿Existe un proyecto Supabase separado para testing?** Si no, los E2E tests deben crear y limpiar datos reales, lo cual requiere una estrategia de seed/teardown. Recomendado: variable de entorno `NEXT_PUBLIC_SUPABASE_URL_TEST` apuntando a un proyecto de staging.

3. **¿Se planea agregar autenticación?** El modelo de confianza actual (localStorage + host_token) funciona para el MVP, pero si hay planes de auth, la arquitectura de repositorios propuesta facilita la migración: solo cambian las funciones del repo, no los componentes.

4. **¿Multi-moneda o multi-país?** El CLP sin decimales está hardcodeado en múltiples capas (`maximumFractionDigits: 0`, `Math.ceil`, `price: integer` en DB). Agregar USD requeriría cambios en todas esas capas simultáneamente — refuerza la necesidad de centralizar la lógica de billing.

5. **¿Cuál es el SLA de disponibilidad de Gemini?** El cascade de modelos (`gemini-2.5-flash-lite → gemini-2.5-flash → gemini-2.0-flash`) es una buena mitigación, pero si todos están sobrecargados el OCR simplemente falla. ¿Hay un fallback offline (manual entry) suficientemente prominente? Actualmente existe pero depende de que el usuario lo descubra.

6. **¿El bucket `comprobantes` fue migrado a privado en producción?** La migración 005 lo cambia a privado, pero la migración 001 lo crea como público. Si la migración 005 no se aplicó, los comprobantes son públicos y accesibles sin autenticación.
