# 13 — Plan: auth profunda (ligar propiedad del host a cuentas) — DISEÑO, sin código

Fecha: 2026-06-20
Estado: **research-only**. Este documento NO implementa nada. Define el plan, las
migraciones, el análisis de riesgo y el rollout seguro para *eventualmente* atar la
propiedad de una boleta (host) a una cuenta de usuario (`auth.uid()`), en vez de
(o además de) el `host_token` secreto en localStorage.

> Contexto: la migración **016** ya añadió, de forma 100% aditiva, auth opcional por
> magic link y una tabla `user_sessions` que es solo un **índice personal** de
> boletas. Ese índice NO da permisos de acción. Este plan cubre el paso profundo y
> sensible que deliberadamente se dejó fuera del alcance de la 016.

---

## 1. Modelo actual (lo que NO se debe romper)

- **Sin cuentas.** El historial vive en `localStorage` (`apagar_sessions_v2`).
- **Gating de host por `host_token`.** Al crear la boleta se genera un `host_token`
  (uuid) que se guarda en `session_secrets` (servidor) y en localStorage (cliente).
  Las RPC `confirm_payment`, `close_session` y `register_host_participant`
  (migraciones 008/010) son `SECURITY DEFINER` y exigen que el token recibido
  coincida con `session_secrets.host_token`. Sin token válido → excepción.
- **RLS endurecida** (004/008/011): lectura pública por `session_id`; INSERT de
  `participants` solo invitados (`is_host = false`); el participante host se crea
  por RPC con token.
- **Propiedad: el dispositivo que tiene el token ES el host.** No hay identidad.

Consecuencia (el problema que la auth profunda resolvería): si pierdes el
dispositivo / borras localStorage, **pierdes el control de la boleta para siempre**
(nadie puede confirmar pagos ni cerrarla). El token no es recuperable por diseño.

---

## 2. Objetivo de la auth profunda

Permitir que un host **autenticado** gestione sus boletas desde cualquier
dispositivo, sin depender del `host_token` local, atando la propiedad a
`auth.uid()` — **sin** debilitar el modelo anónimo para quien no inicia sesión.

Requisito transversal: **coexistencia**. Durante mucho tiempo habrá boletas creadas
sin cuenta (solo token) y boletas creadas con cuenta. El sistema debe aceptar
*ambas* pruebas de propiedad.

---

## 3. Diseño propuesto: "doble llave" (token OR owner)

La idea central es que una acción de host se autorice si se cumple **cualquiera** de:

1. **Token válido** (camino actual, anónimo), o
2. **`auth.uid()` == dueño registrado de la sesión** (camino con cuenta).

Esto preserva el flujo anónimo intacto y agrega el camino por cuenta como
alternativa, no como reemplazo forzado.

### 3.1 Esquema

Nueva tabla de propiedad explícita (NO reutilizar `user_sessions`, que es un índice
personal de lectura y puede tener punteros a boletas ajenas que el usuario solo
"guardó"):

```
session_owners(
  session_id uuid primary key references sessions(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now()
)
```

- `session_id` es PK ⇒ **un solo dueño** por boleta.
- Poblado por: (a) creación de boleta estando autenticado, y (b) "reclamar"
  (claim) una boleta anónima existente probando el `host_token` (ver 3.4).

`sessions.host_id` ya existe en el tipo (`host_id uuid | null`), hoy sin uso de
seguridad. **Decisión:** no usar `sessions.host_id` para autorización (es editable
por las policies de UPDATE de `sessions` que hoy son abiertas para campos del host);
usar la tabla dedicada `session_owners` con RLS estricta. Mantener `host_id` solo
como dato informativo o deprecarlo.

### 3.2 RPC: aceptar token OR owner

Reescribir `confirm_payment` / `close_session` / `register_host_participant` para
autorizar con **cualquiera** de las dos pruebas. Patrón (pseudocódigo, no código
final):

```
authorized :=
     ( v_secret is not null and p_token is not null and v_secret = p_token )
  OR ( auth.uid() is not null
       and exists (select 1 from session_owners o
                   where o.session_id = p_session_id and o.user_id = auth.uid()) );
if not authorized then raise exception 'No autorizado'; end if;
```

Notas críticas:
- Mantener `SECURITY DEFINER` + `set search_path = public`.
- `auth.uid()` dentro de una función `SECURITY DEFINER` **sí** refleja al usuario
  que llamó (viene del JWT, no del owner de la función). Verificar en staging.
- **No** relajar el caso token: el `OR` solo *agrega* un camino; el camino token
  sigue idéntico (incluido el bloqueo de token NULL de la 008-A).

### 3.3 RLS de `session_owners`

```
enable row level security;
select/insert/delete: to authenticated, using/with check (auth.uid() = user_id)
```

El INSERT "normal" desde el cliente no basta para *robar* una boleta porque la
inserción real de propiedad debe pasar por una RPC que valida (creación con sesión,
o claim con token). Para evitar que un usuario inserte `session_owners` de una
boleta ajena sin prueba, **NO** dar INSERT directo libre: hacer el INSERT dentro de
RPC `SECURITY DEFINER` (claim) y dejar en la policy solo SELECT/DELETE propios.

### 3.4 "Reclamar" una boleta anónima (backfill del dueño)

Para que un host que ya tiene boletas (token en localStorage) las migre a su cuenta:

```
rpc claim_session_ownership(p_session_id uuid, p_token uuid):
  - exige auth.uid() not null
  - valida p_token contra session_secrets (misma prueba que hoy)
  - inserta en session_owners(session_id, auth.uid()) si no existe dueño
  - (idempotente; si ya hay dueño distinto, error)
```

Así la propiedad por cuenta se obtiene **probando el token actual** — sin ventana
de robo. La UI de `/cuenta` (cuando el usuario está logueado) puede ofrecer
"reclamar la gestión de estas boletas en mi cuenta" usando los tokens locales.

---

## 4. Migraciones (orden y contenido)

Numeración tras la 016. Cada una con header `-- 0NN: ... DESPUÉS de la 0NN-1.`,
RLS habilitada donde aplique, y `⚠️ probar en staging`.

1. **017_session_owners.sql** — crea `session_owners` + RLS (solo SELECT/DELETE
   propios; sin INSERT directo). Aditiva. Sin tocar nada existente.
2. **018_ownership_rpcs.sql** — `claim_session_ownership` (nueva) + *reescritura*
   de `confirm_payment` / `close_session` / `register_host_participant` al patrón
   "token OR owner". **Aquí está el riesgo**: toca RPC de seguridad existentes.
   Debe preservar byte-a-byte la rama token.
3. **019_create_with_owner.sql** — opcional: una RPC `create_session_owned` o un
   trigger que, si `auth.uid()` no es null al crear la sesión, inserte el dueño.
   Alternativa más simple: el cliente llama `claim_session_ownership` justo después
   de crear, reusando el token recién generado (sin nueva ruta de creación).

Backfill de datos: **no** se puede backfillear propiedad de boletas históricas
automáticamente (no sabemos qué usuario era el host — no había cuentas). El backfill
es **opt-in** vía `claim_session_ownership` con el token local. Boletas cuyo token
se perdió quedan como están (anónimas, gestionables solo con token) — aceptable.

---

## 5. Cambios de cliente (fuera del alcance de este doc, pero listados)

- `crear/page.tsx`: tras crear, si hay sesión, llamar `claim_session_ownership`.
- `host/[id]/page.tsx`: al autorizar acciones, pasar el JWT (ya va en cookies vía
  `@supabase/ssr`) **además** del token; el servidor decide por OR. Hoy estas
  páginas están fuera de alcance y NO se tocaron.
- Recuperación: pantalla "no tengo el token pero es mi cuenta" → lista boletas de
  `session_owners` y permite actuar sin token.

---

## 6. Análisis de riesgo

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Reescribir RPC de seguridad rompe el camino token (regresión silenciosa) | **Alta** | Mantener la rama token idéntica; tests e2e anónimos (3/3) como gate de no-regresión; revisar diff línea a línea contra 008/010. |
| `auth.uid()` no disponible/incorrecto dentro de `SECURITY DEFINER` | Media | Probar en staging con usuario real; si falla, pasar el user_id verificado por un wrapper que llame `auth.uid()` fuera de la función definer. |
| Robo de propiedad por INSERT directo en `session_owners` | Alta | No exponer INSERT directo; solo vía RPC que valida token o creación. Policy con `auth.uid() = user_id` no basta por sí sola (no prueba que seas el host). |
| Doble dueño / condición de carrera al reclamar | Media | PK en `session_id` (un dueño); INSERT idempotente con `on conflict do nothing` y verificación de dueño previo. |
| Boletas anónimas existentes quedan sin dueño | Baja (aceptado) | Claim opt-in con token; no romper su gestión por token. |
| `auth.users` cascada al borrar usuario elimina `session_owners` pero NO la boleta | Baja | `on delete cascade` solo borra el puntero de propiedad; la boleta sigue gestionable por token. Documentar. |
| CSP / same-origin del callback | Baja | El callback es same-origin; `connect-src` ya permite Supabase. Sin cambios. |

---

## 7. Rollout seguro (fases)

1. **Fase 0 (hecho, migración 016):** auth opcional + índice personal. Cero impacto
   en seguridad de acciones.
2. **Fase 1:** desplegar 017 (tabla + RLS) — inerte, nadie la usa aún.
3. **Fase 2:** desplegar 018 en **staging**; correr la suite e2e anónima (debe ser
   3/3) + nuevas pruebas con cuenta. Verificar que token-solo sigue funcionando.
4. **Fase 3:** activar el claim en cliente (creación con dueño + botón "reclamar").
   `host_token` y cuenta **coexisten**; ningún usuario pierde acceso.
5. **Fase 4 (opcional, lejano):** si se decide *reemplazar* el token, requiere que
   ~100% de las boletas activas tengan dueño y un periodo de gracia largo. Mientras
   existan boletas anónimas legítimas, **no** quitar el camino token.

Decisión recomendada: **coexistencia permanente** (token OR owner). Quitar el token
no aporta seguridad y rompería el caso de uso anónimo, que es el corazón del producto.

---

## 8. Resumen

Atar la propiedad del host a cuentas se hace con una tabla dedicada
`session_owners` (un dueño por boleta) y autorización **"token OR owner"** en las
RPC existentes, obteniendo la propiedad por **claim con el token actual** (sin
ventana de robo). Es aditivo y reversible por fases; el flujo anónimo se preserva
como camino de primera clase. El mayor riesgo es la reescritura de las RPC de
seguridad: se contiene manteniendo la rama token intacta y usando los 3 e2e
anónimos como gate de no-regresión. No se recomienda eliminar el `host_token`.
