# Auditoría de Base de Datos — A-Pagar

_Fecha: 2026-06-13 · Auditor: arquitecto DB senior (Postgres/Supabase)_

---

## Resumen ejecutivo

El esquema es funcional y muestra una evolución cuidadosa a través de 7 migraciones: cada una añade una capa de seguridad o un feature sin romper lo anterior. Las decisiones clave (items inmutables, host-como-participante, token secreto por RPC) son técnicamente razonables. Sin embargo, hay **tres problemas de alta severidad** que podrían producir datos inconsistentes en producción hoy mismo:

1. **Race condition en el cálculo ÷N** — dos claims simultáneos producen totales divergentes entre pestañas y la DB no tiene nada que los reconcilie.
2. **host_token legible desde el cliente** — el INSERT en `session_secrets` devuelve el token al navegador, pero la RPC acepta `null` como token válido para sesiones "legacy", creando un bypass completo de autenticación.
3. **Realtime de `claims` sin filtro de sesión** — cada cambio en `claims` en cualquier sesión del mundo activa un re-fetch completo en todos los suscriptores, lo que es ineficiente y escala mal.

El esquema subyacente (tipos, ON DELETE, normalización) está bien construido para un MVP. Los gaps más importantes son de lógica de negocio y seguridad, no de modelado puro.

---

## Modelo de datos (diagrama textual)

```
sessions (PK: id uuid)
  ├── host_id → auth.users(id) ON DELETE SET NULL   [siempre NULL en práctica]
  ├── status: text CHECK('open','closed')
  ├── split_mode: text CHECK('items','equal')        [migración 002]
  ├── split_total: integer NULL                       [migración 002]
  ├── split_n: integer NULL                           [migración 002]
  ├── propina_pct: integer CHECK(0,10)
  ├── host_name, host_bank, host_account, host_rut   [PII plano en sesión]
  ├── host_email, host_payment_link                  [migración 006]
  └── created_at: timestamptz

items (PK: id uuid)
  └── session_id → sessions(id) ON DELETE CASCADE
      name, price: integer, position: integer
      [sin UPDATE/DELETE desde migración 004]

participants (PK: id uuid)
  ├── session_id → sessions(id) ON DELETE CASCADE
  ├── name: text
  └── is_host: boolean DEFAULT false               [migración 007]
      [unique index parcial: is_host=true por session_id]

claims (PK: id uuid)
  ├── item_id → items(id) ON DELETE CASCADE
  ├── participant_id → participants(id) ON DELETE CASCADE
  ├── session_id → sessions(id) ON DELETE CASCADE  [migración 005, nullable]
  └── UNIQUE(item_id, participant_id)

payments (PK: id uuid)
  ├── session_id → sessions(id) ON DELETE CASCADE
  ├── participant_id → participants(id) ON DELETE CASCADE
  ├── amount: integer
  ├── comprobante_url: text NULL
  ├── confirmed_by_host: boolean DEFAULT false
  ├── paid_at: timestamptz NULL
  └── UNIQUE(session_id, participant_id)

session_secrets (PK: session_id → sessions(id) ON DELETE CASCADE)
  └── host_token: uuid NOT NULL

push_subscriptions (PK: id uuid)
  ├── session_id → sessions(id) ON DELETE CASCADE  [NULLABLE]
  ├── participant_id → participants(id) ON DELETE CASCADE [NULLABLE]
  ├── role: text CHECK('host','participant')
  └── UNIQUE(endpoint)

Storage bucket: comprobantes (privado, 5 MB, imágenes+PDF)
```

---

## Hallazgos priorizados

### [SEV-1] Race condition en cálculo ÷N — divergencia de totales entre clientes concurrentes

**Archivo**: `src/lib/utils.ts:58-64`, `src/hooks/use-session.ts:67-90`

**Descripción**: El precio por persona se calcula en el cliente como `Math.ceil(price / nClaims)`, donde `nClaims` es el número de claims que el cliente vio en el último fetch. Con Realtime, cuando dos participantes marcan el mismo ítem al mismo tiempo:

- Cliente A tiene `nClaims=1` antes del segundo claim → calcula `Math.ceil(1000/1)=1000`
- Cliente B tiene `nClaims=2` después del segundo claim → calcula `Math.ceil(1000/2)=500`
- El `amount` guardado en `payments` refleja el estado del cliente en el momento de hacer clic en "Ya transferí"
- El host ve totales diferentes a los que los participantes dicen haber transferido
- No hay ninguna función de DB que recalcule ni valide el monto al momento del INSERT en `payments`

**Impacto**: Un participante puede pagar $500 creyendo que divide con alguien más, mientras el otro ya quitó su claim y el monto real es $1.000. Discrepancias permanentes entre `payments.amount` y el split real.

**Recomendación (sin implementar)**: Crear una función RPC `compute_participant_total(session_id, participant_id)` que calcule el total en DB al momento del INSERT en `payments`, y que `payments` valide el `amount` contra ese cálculo mediante un trigger o constraint deferrable. Alternativamente, mover la lógica de precio-por-persona a una vista materializada o función IMMUTABLE para que sea la fuente de verdad.

---

### [SEV-1] Bypass del host_token vía modo legacy — cualquier visitante puede confirmar pagos

**Archivo**: `supabase/migrations/005_host_token.sql:65-74`

**Descripción**: La función `confirm_payment` y `close_session` tienen una rama explícita:

```sql
if v_secret is not null and (p_token is null or v_secret <> p_token) then
  raise exception 'Token de anfitrión inválido';
end if;
```

La condición `if v_secret is not null` significa que si `session_secrets` no tiene fila para esa sesión (sesiones pre-005 o sesiones donde el INSERT del token falló silenciosamente), **cualquier llamada con `p_token = null` pasa**. El cliente hace exactamente eso cuando `getLocalSession(sessionId)?.hostToken` no existe (`src/hooks/use-session.ts:114`). Un participante que conoce el `session_id` puede llamar `confirm_payment(session_id, su_propio_participant_id, null)` y confirmará su propio pago.

**Impacto**: Escalada de privilegios real: cualquier participante puede auto-confirmar su pago. En sesiones nuevas (005+ aplicada) esto solo afecta el caso edge de token perdido, pero el modo "legacy" es un bypass documentado y activo.

**Recomendación (sin implementar)**: Para sesiones creadas después de la migración 005, hacer que `session_secrets` sea obligatorio (NOT NULL path): si no hay secreto en DB para una sesión "nueva" (creada después de cierta fecha), rechazar la operación en lugar de permitirla. Documentar y acotar explícitamente el período legacy.

---

### [SEV-2] Realtime de `claims` sin filtro de session_id — fan-out global

**Archivo**: `src/hooks/use-session.ts:58`

```ts
.on('postgres_changes', { event: '*', schema: 'public', table: 'claims' }, () => load())
```

**Descripción**: La suscripción Realtime para `claims` no tiene filtro. Supabase Realtime entrega _todos_ los cambios de la tabla `claims` a _todos_ los suscriptores (una por cada pestaña abierta). El comentario en el código lo reconoce ("la columna `claims.session_id` recién existe desde la migración 005"), pero la migración 005 ya aplicó la columna y la backfill. El filtro no se activó.

**Impacto**:
- Con 10 sesiones activas simultáneas, cada cambio en cualquier sesión genera un re-fetch completo en los otros 9. Escala cuadráticamente.
- Supabase cobra por mensajes Realtime. Fan-out global es costoso.
- La columna `session_id` en `claims` existe y tiene índice (`claims_session_id_idx`), pero no se usa para el filtro.

**Recomendación (sin implementar)**: Cambiar el listener a `filter: \`session_id=eq.${sessionId}\`` igual que se hace para `payments` y `participants`. Requiere verificar que Supabase tenga REPLICA IDENTITY FULL o al menos que `session_id` aparezca en el payload del cambio.

---

### [SEV-2] PII del host almacenado en claro y legible por cualquiera con el session_id

**Archivo**: `supabase/migrations/001_initial.sql:88` — `"sessions_read_public"` policy: `using (true)`

**Descripción**: La tabla `sessions` tiene lectura pública total. Contiene `host_name`, `host_bank`, `host_account`, `host_rut` (RUT chileno = identificador nacional), `host_email`. Cualquiera que tenga (o adivine) un `session_id` puede hacer un SELECT y obtener todos los datos financieros y personales del host.

Los session_id son UUID v4 con 122 bits de entropía → difíciles de adivinar. Pero:
- El link se comparte por WhatsApp (grupos, reenvíos)
- El bucket `comprobantes` es privado (bien), pero la sesión con datos bancarios no lo es
- No hay expiración ni rotación del link

**Impacto**: Exposición de RUT + cuenta bancaria + banco de una persona natural. En Chile el RUT es usado como identificador en muchos servicios. Riesgo de phishing o suplantación.

**Recomendación (sin implementar)**: Considerar una política que solo exponga los campos de pago (`host_bank`, `host_account`, `host_rut`, `host_email`) al momento de hacer el pago (paso `transfer`), no en el SELECT inicial. O al menos excluir `host_rut` del payload público. Column-level security con una vista restringida sería la solución limpia.

---

### [SEV-2] claims.session_id es NULLABLE — integridad referencial débil

**Archivo**: `supabase/migrations/005_host_token.sql:110-116`

```sql
alter table claims add column if not exists session_id uuid references sessions(id) on delete cascade;

update claims c
   set session_id = i.session_id
  from items i
 where i.id = c.item_id
   and c.session_id is null;
```

**Descripción**: La columna `claims.session_id` se añadió como nullable con backfill. El trigger `fill_claim_session_id` llena el valor en INSERT nuevos, pero si el trigger falla o si alguien inserta con `session_id` explícito y erróneo, no hay constraint que lo detecte.

Más crítico: no hay constraint `CHECK` ni trigger que valide que `claims.session_id = items.session_id` donde `items.id = claims.item_id`. Un claim podría tener `session_id = A` pero `item_id` que pertenece a `session_id = B`.

**Impacto**: Claims huérfanos o cross-session si el trigger falla silenciosamente. La columna que existe "para filtrar Realtime" no está protegida contra inconsistencias.

**Recomendación (sin implementar)**: Hacer `claims.session_id NOT NULL` (los registros legacy ya fueron backfilled). Añadir un CHECK o un trigger BEFORE INSERT que valide `claims.session_id = (SELECT session_id FROM items WHERE id = NEW.item_id)`.

---

### [SEV-2] push_subscriptions.session_id y participant_id son NULLABLE sin lógica de validación

**Archivo**: `supabase/migrations/003_push_subscriptions.sql:5-11`

**Descripción**: Ambas FK son nullable. No hay constraint que exija al menos uno de los dos, ni que valide que `role = 'host'` implica `session_id IS NOT NULL` o que `role = 'participant'` implica `participant_id IS NOT NULL`. Un INSERT malformado (ej: `role='host'` sin `session_id`) queda en DB sin error.

**Impacto**: La lógica de envío de push (en `/api/push/send`) necesita encontrar suscripciones por `session_id` + `role`. Si hay filas con `session_id NULL`, el filtro no las encontrará y las notificaciones no se enviarán silenciosamente.

**Recomendación (sin implementar)**: Añadir constraints:
```sql
CHECK (
  (role = 'host'        AND session_id IS NOT NULL) OR
  (role = 'participant' AND participant_id IS NOT NULL)
)
```

---

### [SEV-3] Trigger `guard_payment_confirmation` usa `current_user` — frágil con connection pooling

**Archivo**: `supabase/migrations/005_host_token.sql:32-50`

**Descripción**:
```sql
if current_user in ('anon', 'authenticated') then
```

`current_user` devuelve el rol PostgreSQL del proceso que ejecuta la sentencia. Con Supabase + PgBouncer en modo transaction pooling, las conexiones se reutilizan. El rol efectivo es el que seteó `SET ROLE` en la sesión JWT, no un valor estable. Aunque Supabase sí setea el rol correctamente para cada petición, depender de `current_user` en un trigger es un patrón frágil que puede fallar si:
- Se usa la service_role key directamente desde el cliente (debería ser imposible pero es un error común)
- Se migra a otro pooler o se ejecuta desde SQL Editor (donde `current_user = 'postgres'`)

La función SECURITY DEFINER corre como el dueño (postgres), por lo que `current_user` dentro de la función SECURITY DEFINER es `postgres`, no `anon`. El trigger se ejecuta en el contexto del llamador, pero `confirm_payment` corre como postgres → el trigger vería `current_user = 'postgres'` y saltaría la protección.

**Impacto**: El guard que impide que `anon` setee `confirmed_by_host = true` directamente... no protege contra el camino `anon → confirm_payment (SECURITY DEFINER) → UPDATE`. El trigger cree que es `postgres` haciendo el UPDATE y lo permite. La protección real es que `confirm_payment` valida el token antes del UPDATE, pero el trigger da una falsa sensación de seguridad.

**Recomendación (sin implementar)**: Eliminar la rama `current_user in ('anon', 'authenticated')` del trigger o reemplazarla con una variable de sesión explícita (`SET LOCAL apagar.calling_rpc = 'confirm_payment'`) que la función SECURITY DEFINER setea antes del UPDATE. El trigger verifica esa variable en lugar de `current_user`.

---

### [SEV-3] Función `confirm_payment` no verifica que el participant pertenezca a la session

**Archivo**: `supabase/migrations/005_host_token.sql:55-75`

```sql
update payments
   set confirmed_by_host = true
 where session_id = p_session_id
   and participant_id = p_participant_id;
```

**Descripción**: La función valida el token contra la sesión, pero no verifica que `p_participant_id` pertenezca a `p_session_id`. Un host con token válido de sesión A podría llamar `confirm_payment(sessionA_id, participantB_id_from_sessionB, tokenA)`. La cláusula WHERE filtraría en `payments` (donde el join `session_id AND participant_id` debe existir simultáneamente), así que en la práctica no confirmaría nada incorrecto — pero depende de la unicidad de `payments(session_id, participant_id)` que sí existe. Aun así, es una verificación de integridad faltante que debería estar explícita.

**Impacto**: Bajo en práctica por el UNIQUE constraint en payments, pero es un gap de validación que complica auditorías de seguridad.

**Recomendación (sin implementar)**: Añadir antes del UPDATE:
```sql
IF NOT EXISTS (SELECT 1 FROM participants WHERE id = p_participant_id AND session_id = p_session_id) THEN
  RAISE EXCEPTION 'Participante no pertenece a esta sesión';
END IF;
```

---

### [SEV-3] Migración 002: split_total y split_n sin constraints de coherencia

**Archivo**: `supabase/migrations/002_split_mode.sql:7-11`

**Descripción**:
- `split_total INTEGER DEFAULT NULL` — sin CHECK `> 0`
- `split_n INTEGER DEFAULT NULL` — sin CHECK `>= 2`
- No hay constraint que exija: si `split_mode = 'equal'` entonces `split_total IS NOT NULL AND split_n IS NOT NULL`
- No hay constraint inverso: si `split_mode = 'items'` entonces `split_total IS NULL AND split_n IS NULL`

**Impacto**: Una sesión `split_mode = 'equal'` con `split_n = NULL` causa división por cero en el cliente (`Math.ceil(total / null)` = NaN). El código cliente lo maneja (`split_n ?? 1`), pero enmascarando un dato inválido en DB.

**Recomendación (sin implementar)**: Añadir constraints:
```sql
ALTER TABLE sessions ADD CONSTRAINT ck_equal_split_fields CHECK (
  (split_mode = 'items' AND split_total IS NULL AND split_n IS NULL) OR
  (split_mode = 'equal' AND split_total > 0 AND split_n >= 2)
);
```

---

### [SEV-3] propina_pct solo acepta 0 o 10 — no refleja la realidad chilena

**Archivo**: `supabase/migrations/001_initial.sql:12`

```sql
propina_pct integer not null default 10 check (propina_pct in (0, 10))
```

**Descripción**: En Chile la propina estándar es 10%, pero algunos restaurantes cobran 12% o 15% (especialmente internacionales). El CHECK `IN (0, 10)` hace imposible representar esto sin una nueva migración.

**Impacto**: Feature freeze en propina. Bajo impacto actual, pero podría requerir migración disruptiva en el futuro.

**Recomendación (sin implementar)**: Cambiar a `CHECK (propina_pct BETWEEN 0 AND 30)` con incrementos de 1 o 5. El frontend ya limita las opciones.

---

### [SEV-3] host_bank combina banco + tipo de cuenta en un solo campo de texto libre

**Archivo**: `src/app/crear/page.tsx:219`

```ts
host_bank: hostBank && hostAccountType ? `${hostBank} · ${hostAccountType}` : ...
```

**Descripción**: El schema tiene `host_bank text` y el cliente concatena `"Banco Estado · Cuenta RUT"` en ese campo. La separación se hace en el cliente con `split(' · ')`. Esto es frágil: si el nombre de un banco contiene " · " (improbable pero posible), el parse falla. La base de datos no tiene separación semántica de estos datos.

**Impacto**: Parsing frágil. No es posible hacer queries por banco o tipo de cuenta sin string parsing.

**Recomendación (sin implementar)**: Separar en `host_bank text` + `host_account_type text`. Migración no destructiva: añadir columna, backfill con split, deprecar la columna combinada.

---

### [SEV-3] payments.paid_at vs payments.created_at — semántica ambigua

**Archivo**: `supabase/migrations/001_initial.sql:63-64`

```sql
paid_at      timestamptz,   -- nullable
created_at   timestamptz not null default now()
```

**Descripción**: `created_at` se setea automáticamente al hacer el INSERT (upsert de comprobante). `paid_at` se setea explícitamente desde el cliente. En el código (`src/app/s/[id]/page.tsx:297`), se hace upsert con `paid_at: new Date().toISOString()`. Si el usuario hace upsert de un segundo comprobante, `paid_at` se actualiza pero `created_at` no. El trigger `protect_confirmed_payments` congela `comprobante_url` una vez confirmado, pero `paid_at` no está protegido por el trigger actual.

**Impacto**: `paid_at` es técnicamente "fecha del último intento de pago", no "fecha del primer pago". Confuso para auditorías.

**Recomendación (sin implementar)**: Añadir `paid_at` al check del trigger `protect_confirmed_payments`. O simplificar usando solo `created_at` del INSERT original.

---

## Índices y performance

### Índices existentes (del código):

| Tabla | Columna(s) | Tipo | Migración |
|-------|-----------|------|-----------|
| items | session_id | B-tree | 001 |
| participants | session_id | B-tree | 001 |
| claims | item_id | B-tree | 001 |
| claims | participant_id | B-tree | 001 |
| payments | session_id | B-tree | 001 |
| claims | session_id | B-tree | 005 (`claims_session_id_idx`) |
| participants | (session_id) WHERE is_host | Unique parcial | 007 |

### Índices faltantes (impacto real en queries actuales):

**1. `payments(participant_id)` — AUSENTE**
- Usado en: `src/hooks/use-session.ts:33` — `supabase.from('payments').select('*').eq('session_id', ...)`
- Pero también `payments.find(p => p.participant_id === existing.id)` en el cliente (filtrado en memoria)
- Sin embargo `confirm_payment` hace `UPDATE payments WHERE session_id = X AND participant_id = Y` — con el índice en `session_id` ya filtra bien, pero sin índice en `participant_id` tiene que escanear todos los pagos de la sesión. Para sesiones pequeñas no importa, pero es un gap.
- **Recomendación**: `CREATE INDEX ON payments(participant_id);`

**2. `claims(item_id, participant_id)` — ya cubierto por el UNIQUE, pero explicitarlo**
- El UNIQUE constraint crea implícitamente un índice B-tree. Está bien.

**3. `sessions(status, created_at)` — índice compuesto para listados futuros**
- Si se implementa un panel admin o listado de sesiones activas: `CREATE INDEX ON sessions(status, created_at DESC);`
- No urgente con el volumen actual.

**4. `push_subscriptions(session_id, role)` — AUSENTE**
- La API `/api/push/send` probablemente filtra por `session_id` y `role` para encontrar a quién notificar.
- **Recomendación**: `CREATE INDEX ON push_subscriptions(session_id, role);`

### Índices potencialmente redundantes:

- `claims(item_id)` + `UNIQUE(item_id, participant_id)` — el único índice ya cubre búsquedas por `item_id` como leading column. El índice simple en `item_id` es redundante.
  - **Acción**: Evaluar DROP del índice simple `claims(item_id)` ya que el UNIQUE index lo cubre.

---

## Cálculo en cliente vs DB — análisis de consistencia

### El problema central del ÷N:

```typescript
// src/lib/utils.ts:58-63
export function computeItemWithClaims(item: Item, claims: Claim[]): ItemWithClaims {
  const itemClaims = claims.filter(c => c.item_id === item.id)
  const count = itemClaims.length || 1
  return {
    ...item,
    claims: itemClaims,
    price_per_person: Math.ceil(item.price / count),  // snapshot del cliente
  }
}
```

Este cálculo usa el snapshot de `claims` que el cliente tiene en memoria. Entre el momento en que el usuario ve "Tu total: $500" y el momento en que hace INSERT en `payments`, pueden haber ocurrido:
- Otro participante quitó su claim → el total real es $1.000
- Otro participante añadió un claim → el total real es $333

El `amount` en `payments` queda "congelado" al valor del snapshot. No hay validación en DB.

### El target-to-collect en `cuenta/page.tsx`:

```typescript
// src/app/cuenta/page.tsx:76
claimedTotals[item.session_id] =
  (claimedTotals[item.session_id] ?? 0) + (item.price / cc.total) * cc.guests
```

Usa división flotante (`/`) en lugar de `Math.ceil` como el utils.ts. Esto introduce una discrepancia: el participante calculó su total con `Math.ceil(price/n)` pero el host ve `price/n` sin redondeo. Para items de precio impar divididos entre N personas, esto produce divergencias de 1-2 pesos que se acumulan. No es un bug crítico, pero crea confusión cuando el total "cobrado" no suma exactamente.

---

## Estado de las migraciones

| # | Archivo | ¿Idempotente? | ¿Reversible? | Notas |
|---|---------|--------------|-------------|-------|
| 001 | initial.sql | Parcialmente (no usa IF NOT EXISTS) | No (destruiría datos) | Base del esquema |
| 002 | split_mode.sql | Sí (usa IF NOT EXISTS) | Sí (DROP COLUMN) | Sin constraints de coherencia |
| 003 | push_subscriptions.sql | Sí (IF NOT EXISTS) | Sí | FKs nullable sin validation |
| 004 | security_hardening.sql | Sí (DROP IF EXISTS + CREATE OR REPLACE) | Parcialmente | Buen patrón defensivo |
| 005 | host_token.sql | Sí | No fácilmente | Lógica legacy peligrosa |
| 006 | payment_link.sql | Sí | Sí (DROP COLUMN) | Limpia y simple |
| 007 | host_participant.sql | Sí | Sí (DROP COLUMN + DROP INDEX) | Bien estructurada |

**Gap**: No hay migración `007_host_participant.sql` en la lista de archivos aplicados — el archivo existe en disco como `?? supabase/migrations/007_host_participant.sql` en el git status, lo que sugiere que **aún no fue aplicada en Supabase**. El código en `crear/page.tsx:249-259` ya la usa con un fallback graceful, pero el índice `participants_one_host_per_session` no existe en producción todavía.

---

## Quick wins

1. **Filtrar Realtime de `claims` por `session_id`** — cambio de 1 línea en `use-session.ts:58`, elimina el fan-out global. Requiere confirmar que Supabase Realtime puede filtrar por la nueva columna.

2. **Aplicar migración 007** — ya está escrita y lista. Bloquear el duplicado de host por sesión.

3. **Añadir `CREATE INDEX ON push_subscriptions(session_id, role)`** — 1 línea en una migración nueva, mejora las notificaciones push.

4. **Añadir constraints de coherencia a split_mode** — migración de 5 líneas, previene sesiones inválidas con `split_n = null`.

5. **Añadir `CHECK` a `propina_pct`** — cambiar `IN (0, 10)` a `BETWEEN 0 AND 30` para flexibilidad futura sin romper nada actual.

6. **Hacer `claims.session_id NOT NULL`** — el backfill ya se aplicó en migración 005. Solo falta el `ALTER COLUMN ... SET NOT NULL`.

---

## Decisiones de diseño pendientes

### 1. ¿Dónde vive el cálculo de totales?

**Estado actual**: 100% en cliente. Cada pestaña puede llegar a un total diferente según el timing de su último fetch.

**Opciones**:
- A) Mantener en cliente + aceptar la eventual inconsistencia (aceptable para MVP)
- B) Función RPC `get_participant_total(session_id, participant_id)` que devuelve el total calculado atomicamente
- C) Columna computada / vista materializada `participant_totals`

La opción B es la más pragmática: solo se necesita antes del INSERT en `payments`.

### 2. ¿Deberían los `claims` ser inmutables también?

La migración 004 hizo `items` inmutables. Los `claims` sí pueden borrarse (el participante puede desmarcar). Esto es correcto para UX, pero crea el problema del ÷N: el total de alguien depende de los claims de otros, que pueden cambiar. Consideración: ¿cerrar claims una vez que el participante hace clic en "Ya transferí"? Esto evitaría que el total cambie después del pago.

### 3. ¿Escalar de UUID a ID secuenciales para session_id?

Los UUIDs v4 son buenos para seguridad (no adivinables) pero innecesariamente grandes para índices. Para el volumen actual (PWA personal/grupal chilena), no es un problema. No se recomienda cambiar.

### 4. ¿Expiración de sesiones?

No hay TTL ni `expires_at` en `sessions`. Las sesiones viven indefinidamente. Para un MVP está bien, pero en producción se acumularán datos de sesiones abandonadas. Considerar un job de limpieza o `expires_at timestamptz` + RLS que oculte sesiones viejas.

### 5. ¿Separar host_bank en columnas distintas?

Ver hallazgo SEV-3 sobre `host_bank`. Decisión de producto: ¿vale la pena migrar para poder filtrar/reportar por banco? Probablemente no en MVP.

---

## Preguntas abiertas

1. **¿La migración 007 ya fue aplicada en el proyecto Supabase de producción?** El git status la marca como untracked (`??`), lo que podría indicar que es nueva. Confirmar con `supabase db diff` o consultando el estado en el dashboard.

2. **¿`/api/push/send` usa `anon_key` o `service_role_key` para leer `push_subscriptions`?** La migración 004 deja un comentario al respecto (línea 54-59) indicando que el SELECT en push_subscriptions está comentado esperando el cambio a service_role. Si aún usa anon_key, las claves p256dh y auth de WebPush son públicamente legibles via RLS (no hay policy SELECT en push_subscriptions... lo que significa DENY by default, bien). Verificar que el servidor puede leer con service_role.

3. **¿`sessions.host_id` se usa en algún lugar?** Siempre es NULL (sin auth). ¿Se planea implementar auth? Si no, la columna es ruido. Si sí, la policy `sessions_update_host` fue eliminada en 004 y habría que rehacerla.

4. **¿Hay un migration runner o se aplican manualmente en el SQL Editor?** Las migraciones no tienen prefijo de timestamp (solo número secuencial). Si se usa `supabase db push`, el estado se trackea en `supabase_migrations.schema_migrations`. Si se aplican manualmente, no hay garantía de orden.

5. **¿El bucket `comprobantes` tiene lifecycle rules?** Los comprobantes son imágenes que pesan hasta 5 MB. Sin limpieza, el storage crece indefinidamente. ¿Se planea limpiar comprobantes de sesiones cerradas?

6. **¿Qué pasa con un participante que se une a una sesión `equal` cuando ya hay `split_n - 1` participantes?** El código cliente lo valida (`src/app/s/[id]/page.tsx:79`), pero no hay constraint en DB. Si dos personas se unen simultáneamente cuando queda un cupo, ambas pueden crear su registro de `participants` sin que la DB rechace el segundo.

---

_Auditoría realizada leyendo el código fuente. No se ejecutaron queries contra la base de datos de producción._
