# Auditoría Frontend (Next.js/React/TS) — A-Pagar

> Generada el 2026-06-13. Metodología: lectura directa del código fuente + validación contra la doc local de Next.js 16.2.7 en `node_modules/next/dist/docs/`.

---

## Resumen ejecutivo

La app tiene una base sólida: excelente uso del patrón `params as Promise` + `use()` que exige Next 16 (confirmado en doc local), buen sistema de optimismo + rollback en claims, y metadata dinámica en SSR via layouts. Sin embargo, **casi todo el código cae bajo 'use client'** — las tres rutas dinámicas son monolitos de 500-600 líneas con interactividad compleja, que podrían aprovechar SSR/RSC para el shell inicial. Los problemas más urgentes son: una condición race entre el optimismo y el realtime que puede provocar dobles claims o estados fantasma, computaciones derivadas sin `useMemo` en paths calientes, y ausencia total de `loading.tsx` / `error.tsx` de Next 16.

**Salud general**: Bueno en DX y lógica de negocio; requiere atención en arquitectura RSC, rendimiento y manejo de errores no capturados.

---

## Hallazgos priorizados

### [SEV: Alto] Race condition: optimismo + recarga realtime pueden crear doble-claim

**Archivo**: `src/hooks/use-session.ts:67-109` / `src/hooks/use-session.ts:47-64`

**Descripción**: `addClaim` aplica un update optimista al estado local y luego persiste en Supabase. Pero el canal realtime (`on('postgres_changes', …, () => load())`) puede dispararse *antes* de que el optimista se limpie/confirme, en especial en conexiones lentas. Cuando `load()` devuelve los datos reales del servidor, los claims optimistas (con id `opt-${itemId}-${participantId}`) ya no existen en la respuesta de Supabase → React los elimina. Si el evento realtime llega *entre* el optimista y la respuesta de insert, la UI parpadea: el check verde aparece, desaparece, vuelve a aparecer. Caso peor: si el insert falla y el evento realtime llega antes del rollback, el usuario ve el ítem sin marcar aunque él creía haberlo tomado.

**Impacto**: Parpadeo visible al marcar ítems con latencia alta; riesgo de confusión de estado en grupos grandes.

**Recomendación**: Usar un mecanismo de "inflight lock" (ej. `Set<string>` de itemIds en vuelo) para ignorar recargas realtime mientras haya una operación optimista pendiente sobre ese ítem. Alternativamente, reemplazar el `load()` completo en el callback realtime por merges parciales (insertar/eliminar el claim específico en el estado local) en lugar de refetch total.

---

### [SEV: Alto] `removeClaim` pierde el ítem en el estado antes de confirmar el rollback

**Archivo**: `src/hooks/use-session.ts:93-110`

**Descripción**: `removeClaim` elimina inmediatamente el claim del estado local (línea 95-97) y, si el `delete` de Supabase falla, llama a `load()` para "rollback" (línea 107). Pero `load()` es asíncrono: tarda ~200-500ms en completar. Durante ese tiempo el usuario ve el ítem sin la marca de "yo lo pedí" — luego reaparece. Adicionalmente, el evento realtime puede disparar otro `load()` concurrente, resultando en dos fetches simultáneos y la carrera entre sus resultados (el segundo `setData` gana, independiente del orden real).

**Impacto**: UI inconsistente durante errores de red; doble-fetch innecesario si hay realtime activo.

**Recomendación**: Guardar el estado anterior antes del optimismo y restaurarlo directamente (`setData(prev => previous)`) sin necesidad de refetch. Cancelar la suscripción realtime mientras hay operaciones en vuelo o añadir un lock como se menciona arriba.

---

### [SEV: Alto] `confirmPayment` y `closeSession` hacen optimismo + `load()` redundante

**Archivo**: `src/hooks/use-session.ts:112-177`

**Descripción**: Ambas funciones aplican un update optimista al estado local y *después* llaman `await load()` (líneas 147, 175). Esto niega el beneficio del optimismo: el usuario ve el estado correcto brevemente, pero luego el componente re-renderiza con los datos del servidor (que son idénticos, salvo race). Genera un re-render innecesario y una petición de red extra tras cada confirmación.

**Impacto**: Re-renders innecesarios; carga de red duplicada.

**Recomendación**: Eliminar el `await load()` tras el update optimista. El canal realtime ya actualizará el estado con los datos del servidor. Si se necesita sincronización inmediata, sólo recargar en caso de error.

---

### [SEV: Alto] Sin `loading.tsx` ni `error.tsx` en ninguna ruta

**Archivo**: `src/app/` (todas las rutas dinámicas)

**Descripción**: Verificado contra la doc local (`node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md` §"Nested error boundaries"): Next 16 espera archivos `error.tsx` para capturar errores de renderizado y `loading.tsx` para mostrar UI de carga via Suspense durante el SSR/streaming. La app usa componentes locales `LoadingScreen` / `ErrorScreen` en `s/[id]/page.tsx` y `host/[id]/page.tsx`, pero estos sólo cubren el estado después de la hidratación del cliente. Cualquier error no capturado en el árbol de renders (ej. error en `useEffect` mal manejado, o error en un Server Component si eventualmente se refactoriza) crasheará la ruta entera sin UI de recuperación.

**Impacto**: Sin fallback de error de nivel de ruta; el usuario ve pantalla blanca ante errores inesperados.

**Recomendación**: Crear `src/app/s/[id]/error.tsx`, `src/app/host/[id]/error.tsx` y al menos un `src/app/error.tsx` global. También `loading.tsx` en cada ruta dinámica para el skeleton inicial.

---

### [SEV: Medio] Todas las páginas dinámicas son `'use client'` monolíticas — se pierde SSR del shell

**Archivo**: `src/app/s/[id]/page.tsx:1`, `src/app/host/[id]/page.tsx:1`, `src/app/crear/page.tsx:1`, `src/app/cuenta/page.tsx:1`

**Descripción**: Verificado contra la doc local (`node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` §"Reducing JS bundle size"): el documento explica que marcar páginas enteras como Client Components incluye *todo* su grafo de módulos en el bundle del cliente. Las rutas `/s/[id]` y `/host/[id]` podrían tener un Server Component shell que obtenga la sesión inicial (via `createClient()` del servidor) y lo pase a un Client Component hijo para la interactividad en tiempo real. Actualmente todo se hidrata desde cero en el cliente: la pantalla de carga de `LoadingScreen` (un spinner) es lo que el usuario ve hasta que los datos llegan del cliente, en lugar de HTML prerenderizado.

**Impacto**: First Contentful Paint más lento; más JS en el bundle; los bots/preview de WhatsApp podrían no ver el contenido inicial (aunque los layouts sí tienen `generateMetadata` correcto).

**Recomendación**: Extraer un Server Component padre que haga el fetch inicial de la sesión y lo pase como prop serializable al Client Component (`SessionClientPage`). El Client Component sólo necesita encargarse del realtime y la interactividad.

---

### [SEV: Medio] Estado derivado computado en cada render sin memoización en `host/[id]/page.tsx`

**Archivo**: `src/app/host/[id]/page.tsx:133-200`

**Descripción**: Las siguientes computaciones se recalculan en *cada* render del componente, incluyendo los re-renders por realtime:

- `summaries` (línea 133): `guests.map(p => computeParticipantSummary(...))` — itera sobre todos los participantes × todos los ítems × todos los claims.
- `hostSummary` (línea 138-140): otro `computeParticipantSummary`.
- `confirmedAmount`, `confirmedCount`, `claimedTotal`, `targetToCollect`, `progressPct`, `pendingCount`, `unpaidCount` (líneas 175-200): reducciones sobre arrays.

Cuando hay 10+ participantes con 20+ ítems y el realtime dispara un reload cada vez que alguien marca un ítem, esto puede suponer 10+ iteraciones costosas por render.

**Impacto**: Jank perceptible en grupos grandes con realtime activo; re-renders del panel host innecesariamente lentos.

**Recomendación**: Envolver con `useMemo`:
```typescript
const summaries = useMemo(
  () => guests.map(p => computeParticipantSummary(p, items, claims, payments, session.propina_pct)),
  [guests, items, claims, payments, session.propina_pct]
)
```
Lo mismo para `hostSummary` y las reducciones de `confirmedAmount`/`targetToCollect`/etc.

---

### [SEV: Medio] `groups` y `myClaimedItemIds` recalculados en cada render de `ItemsClaimList`

**Archivo**: `src/components/session/items-claim-list.tsx:35-47`

**Descripción**: `myClaimedItemIds` (línea 35-37) crea un `new Set(...)` y `groups` (líneas 41-47) hace un `.reduce()` + `Object.values()` sobre todos los ítems en cada render. Este componente re-renderiza cada vez que el padre recibe un update de realtime (claims, payments, participants).

**Impacto**: Con 20-30 ítems y actualizaciones frecuentes, trabajo de computación innecesario en cada render.

**Recomendación**:
```typescript
const myClaimedItemIds = useMemo(
  () => new Set(claims.filter(c => c.participant_id === meId).map(c => c.item_id)),
  [claims, meId]
)

const groups = useMemo(
  () => Object.values(items.reduce((map, item) => { … }, {} as Record<string, Group>)),
  [items]
)
```

---

### [SEV: Medio] Keys por índice en `ItemRow` dentro de `crear/page.tsx`

**Archivo**: `src/app/crear/page.tsx:501`

**Descripción**: `{items.map((item, idx) => (<ItemRow key={idx} …/>))}` usa el índice como key. Cuando el usuario elimina un ítem del medio (función `removeItem` en línea 152-153), React reutilizará el componente en esa posición con los datos del siguiente ítem. Esto puede causar que el estado interno del input (foco, valor pendiente) se "transfiera" al ítem equivocado.

**Impacto**: Bugs visuales al eliminar ítems que no son el último; posibles valores en campos incorrectos.

**Recomendación**: Asignar una key estable a cada `DraftItem` (ej. un `id: crypto.randomUUID()` al crear el objeto), o al menos usar una combinación de `name+price+index` que sea más estable.

---

### [SEV: Medio] Render-phase side-effect (`setState` durante render) en `s/[id]/page.tsx`

**Archivo**: `src/app/s/[id]/page.tsx:44-56`

**Descripción**:
```typescript
const [restoredFor, setRestoredFor] = useState<string | null>(null)
if (data && restoredFor !== id) {
  setRestoredFor(id)
  const local = getLocalSession(id)
  // ...
  setMe(existing)
  setStep(payment ? 'done' : 'items')
}
```
Este bloque llama a `setMe` y `setStep` *directamente durante el render* (no en un efecto). Aunque React 18+ tiene un mecanismo para manejar setState en render ("adjusting state when props change"), este patrón requiere que el componente renderice dos veces (React detecta el setState y re-renderiza). El comentario en el código reconoce esto. Sin embargo, con React 19.2, acceder a `getLocalSession` (que usa `localStorage`) durante el render puede fallar en SSR (aunque el componente es `'use client'`, la hidratación inicial puede ser problemática).

**Impacto**: Doble render en la carga inicial; riesgo de inconsistencias de hidratación; patrón difícil de mantener.

**Recomendación**: Mover la lógica de restauración a un `useEffect` con `[id, data]` como dependencias y guardia `if (restoredFor === id) return`. Es más explícito y evita el doble render.

---

### [SEV: Medio] `useSession` crea un nuevo cliente Supabase en cada operación async

**Archivo**: `src/hooks/use-session.ts:77, 99, 118, 128, 155`

**Descripción**: `addClaim`, `removeClaim`, `confirmPayment` y `closeSession` llaman a `createClient()` internamente (líneas 77, 99, 118, 128, 155). `createClient()` llama a `createBrowserClient(...)` que crea una nueva instancia de cliente Supabase. Aunque el SDK puede tener deduplicación interna, lo correcto es crear el cliente una vez por hook y reutilizarlo.

**Impacto**: Overhead de instanciación; potenciales subscripciones huérfanas si el cliente de `load()` y el de `addClaim` son instancias distintas.

**Recomendación**: Crear el cliente una vez al inicio del hook:
```typescript
const supabase = useMemo(() => createClient(), [])
```
Reutilizarlo en todas las callbacks.

---

### [SEV: Medio] `cuenta/page.tsx` carga datos de Supabase íntegramente en un `useEffect` — sin Suspense ni Server Component

**Archivo**: `src/app/cuenta/page.tsx:35-138`

**Descripción**: La página `/cuenta` es puramente de visualización (no necesita realtime): carga boletas locales → consulta Supabase → muestra cards. Esta es exactamente la arquitectura que Next 16 recomienda mover a Server Components (doc local §"Fetching data" > "Server Components"). La página podría ser un Server Component async que lea las sesiones locales del lado del cliente a través de un mecanismo diferente (o usando cookies/params), o al menos usar `Suspense` + `use()` para streaming.

**Impacto**: El usuario ve spinner completo durante toda la carga; sin hydration stream; más JS en el bundle del cliente.

**Recomendación (corto plazo)**: Añadir `<Suspense fallback={<LoadingSkeleton />}>` alrededor de la sección de cards. El `useEffect` + `useState` actual no puede beneficiarse de Suspense directamente, pero se podría refactorizar usando `use(promise)` con React 19.

---

### [SEV: Bajo] `createClient` llamado en `load()` dentro de `useEffect` — nuevo cliente por re-subscription

**Archivo**: `src/hooks/use-session.ts:52`

**Descripción**: En el `useEffect`, línea 52 crea un nuevo `supabase` para el canal realtime (`const supabase = createClient()`), pero `load()` (llamado en línea 51) también crea su propio cliente (línea 17: `const supabase = createClient()`). Dos instancias distintas. El canal se suscribe en la instancia de la línea 52, y el cleanup `supabase.removeChannel(channel)` también la usa — esto es correcto. Pero si la instancia cambia entre renders, la referencia al canal puede perderse.

**Impacto**: Bajo en la práctica (el cliente es estático), pero hace el código más frágil.

**Recomendación**: Ver punto anterior — centralizar en una sola instancia de cliente por hook.

---

### [SEV: Bajo] Tipos sin branding sobre filas de Supabase — casts `as Session`, `as Item[]`, etc.

**Archivo**: `src/hooks/use-session.ts:38-43`, `src/app/cuenta/page.tsx:51-52`

**Descripción**: Los datos de Supabase se castean directamente:
```typescript
session: sessionRes.data as Session,
items: (itemsRes.data ?? []) as Item[],
```
Supabase JS devuelve `unknown` (o un tipo genérico ancho) sin generación de tipos. Si el schema de la DB cambia (ej. se añade una columna nullable), TypeScript no lo detectará porque el cast silencia el error.

**Impacto**: Los errores de contrato entre DB y frontend sólo se descubren en runtime.

**Recomendación**: Generar tipos de Supabase con `supabase gen types typescript` y usar los tipos generados como base en `src/types/index.ts`. Los tipos actuales de `index.ts` son buenos como capa de negocio, pero debería haber una capa intermedia de validación (ej. Zod) o al mínimo los tipos generados de Supabase.

---

### [SEV: Bajo] Cast inseguro `as string | undefined` y `as Participant`

**Archivo**: `src/app/crear/page.tsx:259`, `src/app/s/[id]/page.tsx:93`

**Descripción**:
- `crear/page.tsx:259`: `hostParticipantId = hostP?.id as string | undefined` — el cast es innecesario: `hostP?.id` ya es `string | undefined` si `hostP` es `Participant | null`.
- `s/[id]/page.tsx:93`: `const participant = p as Participant` — aunque la forma es correcta, el cast oculta que Supabase podría devolver columnas adicionales o faltantes.

**Impacto**: Bajo en sí, pero indica que no hay validación de tipos en los boundaries DB→app.

**Recomendación**: Eliminar los casts redundantes; usar tipos generados de Supabase o Zod parse.

---

### [SEV: Bajo] `generateSessionLink` usa `window.location.origin` — falla en SSR

**Archivo**: `src/lib/utils.ts:89-92`

**Descripción**:
```typescript
export function generateSessionLink(sessionId: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}/s/${sessionId}`
}
```
Esta función se usa en `host/[id]/page.tsx:64` que es un Client Component, así que no falla en producción. Pero si en el futuro se llama desde un Server Component (ej. para el `generateMetadata`), devuelve una URL rota (`/s/${id}`). También usa el origen dinámico en lugar de `process.env.NEXT_PUBLIC_SITE_URL`, lo que puede devolver `http://localhost:3000` en desarrollo pero la URL de producción en prod — lo cual es el comportamiento correcto, pero no es obvio.

**Impacto**: Bajo; pero frágil si se reutiliza en contexto servidor.

**Recomendación**: Usar `process.env.NEXT_PUBLIC_SITE_URL` como fallback en lugar de `''`:
```typescript
const base = typeof window !== 'undefined'
  ? window.location.origin
  : (process.env.NEXT_PUBLIC_SITE_URL ?? '')
```

---

### [SEV: Bajo] `Toaster` montado dos veces — en `layout.tsx` y en cada página

**Archivo**: `src/app/layout.tsx:57`, `src/app/crear/page.tsx:6` (y otros)

**Descripción**: `<Toaster />` se importa en el `RootLayout` (línea 57 de `layout.tsx`) y además se renderiza en `crear/page.tsx`, `s/[id]/page.tsx`, y `host/[id]/page.tsx`. Dependiendo de la implementación del toast (no revisada en detalle), puede resultar en duplicación de toasts o en dos instancias del contenedor de notificaciones en el DOM.

**Impacto**: Bajo si el Toaster usa un singleton; potencial duplicación de notificaciones si no lo hace.

**Recomendación**: Revisar la implementación del Toaster; si usa un singleton en el DOM, remover las instancias redundantes en las páginas y confiar sólo en el del layout.

---

### [SEV: Bajo] `usePush` no tiene cleanup de la suscripción de service worker

**Archivo**: `src/hooks/use-push.ts:11-52`

**Descripción**: El `useEffect` en `usePush` llama a `register()` pero no retorna una función de cleanup. Si el componente se desmonta y vuelve a montar (ej. hot reload en desarrollo, o navegación SPA), se llaman múltiples `register()` concurrentes. Aunque el service worker es idempotente (`getSubscription()` primero), el `fetch('/api/push/subscribe', ...)` se ejecuta múltiples veces innecesariamente.

**Impacto**: Bajo; en producción las páginas no se desmountan/remontan frecuentemente.

**Recomendación**: Añadir una bandera `registered` o usar una ref para evitar el registro múltiple:
```typescript
const registeredRef = useRef(false)
// ...dentro del effect:
if (registeredRef.current) return
registeredRef.current = true
```

---

### [SEV: Bajo] `window.confirm()` para cerrar sesión — bloqueante y no accesible

**Archivo**: `src/app/host/[id]/page.tsx:114`

**Descripción**: `if (!window.confirm('¿Cerrar esta boleta? Nadie más podrá unirse.')) return` usa el diálogo nativo del browser, que bloquea el hilo principal, no puede estilizarse y en algunos contextos móviles puede ser bloqueado por el browser.

**Impacto**: UX pobre en móvil; no controlable con tests.

**Recomendación**: Reemplazar por un diálogo modal in-app o al menos un toast de confirmación con botones.

---

### [SEV: Bajo] Imagen con `<img>` nativo ignorando `next/image` — comentario supresor de ESLint

**Archivo**: `src/app/crear/page.tsx:482`, `src/components/session/ocr-uploader.tsx:154`

**Descripción**: Ambos archivos usan `<img>` nativo con `// eslint-disable-next-line @next/next/no-img-element`. Las imágenes son previews locales (blob URLs) que no tienen dimensiones fijas, lo que justifica no usar `next/image`. Sin embargo, sin `width`/`height` explícitos hay layout shift (CLS) durante la carga.

**Impacto**: CLS potencial en la pantalla de revisión de ítems.

**Recomendación**: Añadir `style={{ aspectRatio: 'auto' }}` o contenedor con altura máxima fija (ya existe `max-h-64`/`max-h-52`) para anclar el layout. El uso de `img` nativo es aceptable aquí dado el contexto de blob URL.

---

## Patrones Next 16 — qué usa bien / qué desaprovecha

### Usa bien (verificado contra doc local)

- **`params` como `Promise<{ id: string }>`** + `use(params)` en Client Components (`s/[id]/page.tsx:22-23`, `host/[id]/page.tsx:18-19`). Correcto según la doc local (`05-server-and-client-components.md` muestra exactamente este patrón con `use(params)`).
- **`generateMetadata` asíncrono en layout** (`s/[id]/layout.tsx`): usa `await params` y `await createClient()` del servidor. Correcto — la doc local (`14-metadata-and-og-images.md`) valida este patrón.
- **`cookies()` awaiteado** en `supabase/server.ts:20`: `await cookies()` es el patrón correcto en Next 16 donde las funciones dinámicas son asíncronas.
- **`export const metadata`** y **`export const viewport`** separados en `layout.tsx:22,45`. La doc local confirma que `viewport` debe exportarse separado de `metadata` desde Next 15+.
- **`Toaster` en RootLayout**: componente de notificaciones global a nivel de layout — correcto.

### Desaprovecha / oportunidades

- **Sin `loading.tsx`**: La doc local (`10-error-handling.md` + `file-conventions/loading`) prevé archivos de loading por ruta. La app usa spinners manuales en el cliente pero no hay streaming SSR.
- **Sin `error.tsx`**: La doc local (`10-error-handling.md` §"Nested error boundaries") muestra cómo crear boundaries por ruta. No existe ninguno en la app.
- **Ninguna ruta dinámica aprovecha RSC**: Todas son `'use client'`. La doc muestra el patrón de "Server parent + Client child" (`05-server-and-client-components.md` §"Reducing JS bundle size"). Las rutas `/s/[id]` y `/host/[id]` podrían tener un Server Component que haga el fetch inicial y un Client Component hijo para el realtime.
- **Sin `not-found.tsx`**: Si un UUID es válido pero no existe la sesión, la app muestra `ErrorScreen` inline. La doc prevé `notFound()` + `not-found.tsx` para el caso 404 semántico.
- **Sin uso de `after()`**: La notificación push en `s/[id]/page.tsx:301-313` se hace via `fetch(...).catch(() => {})` fire-and-forget en el cliente. Desde el server side (route handlers), `after()` (doc local: `after.md`) permitiría notificar sin bloquear la respuesta.

---

## Deuda de componentes

### `src/app/host/[id]/page.tsx` — 610 líneas

El componente más pesado. Mezcla:
1. Lógica de negocio (cálculos de progress, summaries, pending)
2. Acciones del host (copiar link, confirmar pago, cerrar sesión)
3. UI de múltiples secciones (header, progress card, share card, host items, participant list, bill summary)
4. Dos sub-componentes locales (`EqualParticipantCard`, `ParticipantCard`) que podrían ser archivos propios

**Propuesta de descomposición**:
```
src/app/host/[id]/
  page.tsx                    ← Server Component shell (fetch inicial)
  host-client.tsx             ← Client Component con realtime
  components/
    session-header.tsx        ← Header + status badge
    progress-card.tsx         ← Barra de progreso + cobrado/total
    share-card.tsx            ← Link + WhatsApp
    host-items-section.tsx    ← "Lo que consumí yo" (usa ItemsClaimList)
    participant-card.tsx       ← Card de participante (items mode)
    equal-participant-card.tsx ← Card de participante (equal mode)
    bill-summary.tsx           ← Resumen subtotal/propina/total
  hooks/
    use-host-calculations.ts  ← summaries, confirmedAmount, targetToCollect, etc.
```

### `src/app/s/[id]/page.tsx` — 532 líneas

Multi-paso (who → items → transfer → done) con 4 vistas distintas en el mismo archivo.

**Propuesta de descomposición**:
```
src/app/s/[id]/
  page.tsx                   ← Server Component shell
  participant-client.tsx     ← Orquestador de pasos (Client)
  steps/
    step-who.tsx             ← Formulario de nombre + join
    step-items.tsx           ← ItemsClaimList + sticky total
    step-transfer.tsx        ← Datos bancarios + upload comprobante
    step-done.tsx            ← Pantalla de confirmación
```

### `src/app/crear/page.tsx` — 843 líneas

El más largo. El flujo items (scan → items → host) y el flujo equal (amount → host) comparten el estado del host pero tienen flujos de UI completamente distintos.

**Propuesta de descomposición**:
```
src/app/crear/
  page.tsx                   ← Selector de modo (RSC — sin estado)
  items-flow/
    items-flow.tsx           ← Orquestador 'use client' del flujo ítems
    step-scan.tsx            ← OcrUploader + botón manual
    step-items.tsx           ← Lista de ítems + propina + totales
  equal-flow/
    equal-flow.tsx           ← Orquestador 'use client' del flujo igual
    step-amount.tsx          ← Inputs de total + personas
  shared/
    host-data-form.tsx       ← Ya existe como función local → extraer
    step-indicator.tsx       ← Ya existe como función local → extraer
```

### `src/app/cuenta/page.tsx` — 405 líneas

Relativamente manejable, pero el `useEffect` de carga podría ser una abstracción propia:

**Propuesta**:
- Extraer `useLoadSessions()` hook que devuelva `{ cards, loading }`.
- Extraer `HostSessionCard` y `ParticipantSessionCard` a archivos propios en `src/components/session/`.

---

## Quick wins

1. **Añadir `useMemo` a `summaries` en `host/[id]/page.tsx:133`** — 5 min, elimina re-cómputo en cada realtime event.
2. **Añadir `useMemo` a `myClaimedItemIds` y `groups` en `items-claim-list.tsx:35-47`** — 5 min.
3. **Cambiar `key={idx}` a `key={item.name + idx}` en `crear/page.tsx:501`** — 1 min, mitiga bug de reordenación hasta tener UUIDs.
4. **Crear `src/app/error.tsx` global mínimo** (`'use client'` + mensaje + botón reload) — 10 min, evita pantalla blanca ante errores inesperados.
5. **Centralizar `createClient()` en `useSession`** — `useMemo(() => createClient(), [])` — 5 min, evita múltiples instancias.
6. **Añadir lock de inflight a `addClaim`/`removeClaim`** para suprimir recarga realtime mientras hay operación pendiente — 20 min, elimina el parpadeo más visible.
7. **Eliminar `await load()` después del optimismo en `confirmPayment`/`closeSession`** — 10 min, elimina re-render innecesario.
8. **Mover la restauración del localStorage de render-phase a `useEffect`** en `s/[id]/page.tsx:44-56` — 15 min.

---

## Preguntas abiertas

1. **¿Hay tipos generados de Supabase?** No se encontró ningún archivo `database.types.ts` o similar. ¿Se usa `supabase gen types`? Sin ello, los casts `as Session` son el único contrato entre DB y frontend.

2. **¿La suscripción realtime a `claims` sin filtro `session_id` es intencional?** (`use-session.ts:58`: `table: 'claims'` sin `filter`). El comentario indica que es por compatibilidad con migraciones. En producción esto suscribe *todos* los cambios de claims de todas las sesiones y recarga aunque no sea la sesión activa.

3. **¿Se planea hacer el panel host accesible sin localStorage?** Actualmente si el host limpia su `localStorage`, pierde el `hostToken` y no puede confirmar pagos (sólo puede en modo legacy). ¿Se considera añadir un mecanismo de recuperación (email, magic link)?

4. **¿La `Toaster` en `layout.tsx` comparte estado con las `Toaster` en cada página?** Dependiendo de la implementación del store de toasts, puede haber dos contenedores independientes en el DOM simultáneamente.

5. **¿El canal realtime de Supabase está configurado para filtrar por `session_id` en `participants` y `payments` pero no en `claims`?** (`use-session.ts:58-61`). Esto puede generar overhead en tablas con muchas sesiones concurrentes.

6. **¿Se planea añadir `not-found.tsx`?** Un UUID inválido o una sesión eliminada devuelve `ErrorScreen` genérico — sería mejor semánticamente y para SEO retornar un 404 real.
