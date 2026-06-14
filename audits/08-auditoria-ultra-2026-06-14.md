# Auditoría ultra-completa — A-Pagar (2026-06-14)

Auditoría multi-agente (9 agentes paralelos, read-only), una arista por agente, posterior al
rediseño "Recibo cálido" + reescritura del realtime (broadcast/presence) + nuevo logo.
Severidad: **P0** crítico (seguridad/pérdida de plata/bloqueo), **P1** alto, **P2** medio, **P3** pulido.

## Scorecard por área

| Área | Nota | Estado |
|---|---|---|
| Seguridad / RLS / API | 8/10 | Sólida para app sin-auth |
| Arquitectura / código | 7/10 | Buena para MVP de 1 dev |
| UX / edge cases | 7.5/10 | Pulida; fugas de plata en bordes |
| PWA / SEO / íconos | 7/10 | Backend sólido; rebrand a medias |
| Testing / Deps / Ops | 6.5/10 | Falta CI + monitoreo |
| Privacidad / legal CL | 6/10 | Brecha entre lo declarado y lo hecho |
| Performance | 6/10 | Costo recurrente del realtime |
| Realtime / integridad | 6/10 | Frágil en garantías de servidor |
| **Accesibilidad** | **4/10** | **Contraste + foco sin cerrar** |

---

## P0 — Críticos

1. **Claims sobre sesión cerrada NO bloqueados en BD** · `supabase/migrations/001_initial.sql:104-106`
   `claims_insert_any/claims_delete_any` son `using(true)`/`with check(true)`; el endurecimiento de la
   008 (status='open') se aplicó a `participants` pero **no se replicó a claims**. Cualquiera con el
   `session_id` (visible en la URL) puede insertar/borrar claims sobre una boleta **cerrada** vía API,
   alterando lo que otros deben pagar después del cierre. La UI solo lo bloquea en cliente. → integridad.

2. **Ítems sin asignar = plata perdida silenciosa (modo por ítems)** · `lib/billing.ts:57-64`, `host/[id]/page.tsx:189-199`
   El `target` del host = suma de lo marcado por invitados, no el total de la boleta. Un plato que nadie
   toca desaparece del cobro; la barra "Cobrado X/Y" puede llegar a 100% mientras el host pone la
   diferencia de su bolsillo. **Nada en la UI lo avisa.**

3. **Host puede generar el link sin datos bancarios → invitado no puede pagar** · `crear/page.tsx:167-176`, `host-data-form.tsx:60-90`
   Solo `hostName` es obligatorio. El invitado llega a "Datos para transferir" y ve la lista vacía, sin
   método de pago ni fallback. Flujo muerto en el momento de pagar.

4. **Accesibilidad: foco de teclado invisible + contraste roto** · transversal
   - **No existe ni una regla `:focus-visible` en todo `src/`** (`globals.css`) — el flujo central
     (marcar ítems, copiar datos, dividir) no se puede operar con teclado de forma visible (WCAG 2.4.7).
   - **8 de 10 colores de avatar fallan AA con texto blanco** · `src/hooks/use-presence.ts:19-22`
     (#0bb673 ~2.3:1, #ff6a45 ~2.6:1, #e0a106 ~2.0:1…); el comentario "colores legibles con texto
     blanco" es matemáticamente falso. Iniciales de presencia/leyenda/ítems poco legibles.
   - **El toggle de ítem no expone su estado** (`items-claim-list.tsx:210-226`): sin `aria-checked`/
     `aria-pressed`; un lector de pantalla no sabe si el ítem está tomado.
   - Toasts con texto oscuro sobre rojo/verde (`ui/toast.tsx:37`) fallan AA.

5. **`favicon.ico` sigue siendo el default de Create-Next-App** · `src/app/favicon.ico`
   Nunca se regeneró tras el cambio de logo de hoy; en App Router el `.ico` físico tiene prioridad sobre
   `icon.tsx`. La pestaña/favoritos muestran el ícono negro de Next, no la marca.

---

## P1 — Altos (consolidado)

**Seguridad / integridad**
- **Monto del pago lo declara el cliente sin validación server-side** · `s/[id]/page.tsx:353-359,391-396`
  `payments.upsert({amount: myTotal})` con anon key; la 009 congeló `amount` en UPDATE pero el INSERT
  queda libre → un participante puede registrar `amount=1` y figurar como "pagó".
- **Toda la sesión (RUT + cuenta bancaria) legible con solo el UUID** · `001:87` `using(true)` + `use-session.ts:27` `select('*')`. El RUT es identificador nacional; proyectar solo columnas necesarias.
- **Límite de partes iguales y nombres duplicados solo client-side con carrera** · `s/[id]:129-135`
  Joins concurrentes superan `split_n` (sobre-cobro real, `sharePerPerson` es divisor fijo) o crean
  homónimos. Sin constraint en BD (`unique(session_id, lower(name))`, tope de cupo).
- **Presence spoofing/fusión por usar el nombre como clave** · `use-presence.ts:56-59` (sin binding a participant_id).
- **Push subscribe como `host` sin host_token** · `api/push/subscribe/route.ts:52-59`.

**Realtime / performance**
- **Poll 4s × N clientes + N+1 en `load()`** · `use-session.ts:16-46,69`. La query de `itemIds` es
  **redundante** (claims ya tiene `session_id`, lo prueba `cuenta/page.tsx:50`); recarga todo el dataset
  cada 4s sin diff. En mesa de 6 ≈ 720 queries/min por boleta. Subir poll a 15-30s + eliminar N+1 + diff.
- **Race: poll/broadcast pisan updates optimistas en vuelo** · `use-session.ts:59,69` (parpadeo del check).
- **`load()` concurrentes sin guard de secuencia** (last-write-wins por azar) · `use-session.ts:16-46`.
- **`notifyChange` falla en silencio si el canal no está SUBSCRIBED** · `use-session.ts:81-83` (al unirse,
  el host puede no enterarse hasta el poll de 4s).
- **`summaries`/`computeParticipantSummary` sin memo** · `host/[id]:140-147` (O(guests×items×claims) cada 4s).
- **Grain (`feTurbulence` + `mix-blend-mode:multiply` fixed full-screen) + blobs `blur` fixed** · `globals.css:92-102` — degrada el scroll en Android gama media/baja (el público objetivo). Profiling en dispositivo real.

**PWA**
- **El SW solo se registra dentro de `/s` o `/host` y solo con VAPID key** · `use-push.ts:12-17` — el
  registro está secuestrado por la feature de push; la **landing y `/crear` corren sin SW** → offline no
  aplica al flujo principal. Registrar el SW global e incondicional en `layout.tsx`.
- **Install banner muestra el "$" viejo** · `pwa-install-banner.tsx:82-84`.

**Privacidad / legal (Ley 21.719)**
- **pg_cron de anonimización apagado** · `010_data_retention.sql:81-82` — la política publicada **afirma**
  borrado a 30 días que no ocurre (promesa incumplida).
- **Comprobantes en Storage nunca se borran** · `010` solo nulifica columnas del host. Es la **PII más
  sensible** (imagen de transferencia: saldo, cuenta) y es de **terceros** (participantes).
- **Sin consentimiento/aviso al recolectar RUT+cuenta** · `crear` no enlaza la política ni avisa.
- **RUT recolectado sin ser necesario para transferir** (minimización).

**UX (faltantes de producto / fricción)**
- **No se puede editar el nombre ni salir de la sesión** · `s/[id]:126-164` (typo = irreparable; teléfono compartido imposible).
- **hostToken solo vive en localStorage** · pérdida del navegador = pérdida del control de la boleta (confirmar/cerrar). `cuenta` no avisa que el historial es por dispositivo.
- **Colisión de primer nombre invisible** (la UI muestra `split(' ')[0]`) → dos "María" indistinguibles en avatares.
- **Comprobante se sube antes de registrar el pago**; si falla el upsert, mensaje engañoso y comprobante huérfano.

**Arquitectura / Ops**
- **Tipo `Claim` desincronizado del esquema** (falta `session_id`, parchado con cast en `cuenta:50`) · `types/index.ts:38-43`.
- **Cero CI** (no hay `.github/workflows`): lint/typecheck/tests no corren solos.
- **Sin monitoreo de errores** (no Sentry); `console.error` se evapora con la retención de Vercel.
- **e2e crean datos en la DB de producción sin teardown** · `e2e/flujos.spec.ts` (boletas zombi permanentes).

---

## P2 / P3 — Selección (ver detalle por agente)

- **282 colores hex hardcodeados** pese a tener tokens CSS completos (`globals.css`) — tema casi inmodificable.
- **Dead code**: `PresenceBubbles` (export sin uso tras la leyenda), `.grain` (legacy), `public/*.svg` de Next.
- **Inconsistencia de crema**: `#fbf3ea` (manifest/body/OG) vs token `--bg #faf2e7` (globals) → flash de color al abrir PWA.
- **Maskable sin safe-zone** (`icon.tsx` bleed:true radius:0 declarado `purpose:maskable`) → recorte en Android.
- **`badge` de push usa ícono a color** (debería ser PNG monocromo).
- **Fraunces variable con itálica+opsz** = el font más pesado, por un `<em>` y titulares.
- **Focus trap incompleto en ConfirmDialog** (Tab escapa) · `confirm-dialog.tsx:31-42`.
- **Touch targets <44px** en steppers (`item-row.tsx:40` 32px) y borrar (28px) — público mayor.
- **Errores de formulario solo por toast efímero** (RUT/banco), sin `aria-invalid`/`error` asociado al campo.
- **`text-3`/#9a8d82 en texto funcional** pese a la advertencia del propio CSS (contraste ~3.4:1).
- **`screenshots` del manifest apunta a `/icon`** (no es un screenshot).
- **OG por sesión: truncar `host_name`/`restaurant_name`** (Satori no recorta).
- **Doble-toma de la misma unidad multi** entre syncs (montos bailan).
- **`confirmPayment`/`closeSession` hacen `load()` redundante** tras update optimista.
- **`usePush` hace 2 POST a /subscribe** (participantId undefined→real).
- **Deps**: 2 vulns moderate transitivas (postcss vía Next, inalcanzables; NO usar `audit fix`); minors al día; Next 16.2.7/React 19 estables.

---

## Temas NUEVOS que no se habían analizado antes

1. **Concurrencia / race conditions** con consecuencia económica: sobre-cobro en "partes iguales" por joins
   simultáneos y doble-toma de unidad multi (la auditoría previa no modeló concurrencia).
2. **Integridad post-cierre**: el gap de la 008 (status='open') no replicado a `claims`.
3. **Validación server-side del monto** (INSERT de payments) — el foco previo fue solo el UPDATE.
4. **Costo del realtime nuevo** (poll 4s × N + N+1) — arista creada por el rewrite de hoy.
5. **"Plata perdida" por ítems sin asignar** — punto ciego del modelo de cobro.
6. **Contraste matemático de los colores de avatar** introducidos hoy.
7. **Foco de teclado global** (`:focus-visible` nunca implementado pese a estar en la auditoría previa).
8. **SW secuestrado por push** → offline no aplica a la home; favicon viejo; maskable safe-zone.
9. **Comprobantes (PII de terceros) sin retención/borrado** + consentimiento en la recolección + RUT innecesario.
10. **Ops**: sin CI, sin monitoreo de errores, e2e contaminan producción.
11. **"Deuda de comentario"**: comentarios que afirman arreglos que no existen (focus-visible) o falsos
    (avatares "legibles"); el tracker `00-pendientes.md` dice ✅ realtime postgres_changes cuando ya es broadcast.

---

## Plan de remediación sugerido (orden de impacto/esfuerzo)

**Tanda A — integridad de plata y seguridad (alto impacto, bajo-medio esfuerzo)**
- Migración: RLS de `claims` con `status='open'`; `unique(session_id, lower(trim(name)))`; tope de `split_n` (RPC/trigger); validar/recalcular `payments.amount` server-side.
- UX: tarjeta "Sin asignar: $X" en host; exigir al menos un método de cobro antes de generar el link.

**Tanda B — accesibilidad (alto impacto, bajo esfuerzo)**
- `:focus-visible` global; oscurecer `AVATAR_COLORS` a tonos AA; `aria-checked` en toggle de ítem; arreglar contraste de toasts y `text-3` funcional; touch targets ≥44px.

**Tanda C — realtime/performance (medio)**
- Eliminar N+1 (claims por session_id), subir poll a 15-30s + diff, memoizar summaries, debounce de `sync`,
  guard de secuencia en `load()`, `notifyChange` solo si canal joined.

**Tanda D — PWA/marca (bajo esfuerzo, visible)**
- Regenerar `favicon.ico`; LogoMark en install banner; registrar SW global; unificar crema `#faf2e7`;
  variante maskable con safe-zone; badge monocromo.

**Tanda E — privacidad/ops (medio, importante para lanzar)**
- Activar pg_cron + borrar comprobantes en la anonimización; consentimiento/aviso en crear y unirse;
  CI (lint+tsc+test); Sentry; staging para e2e + teardown.

**Tanda F — limpieza/mantenibilidad**
- Tipos `Claim.session_id`; helpers (firstName/initial/bank/errMessage); consumir tokens CSS; borrar dead code.
