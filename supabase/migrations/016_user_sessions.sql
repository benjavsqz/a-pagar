-- 016: Índice personal de boletas por cuenta (auth opcional, magic link) — ADITIVO.
-- Ejecutar en Supabase SQL Editor DESPUÉS de la 015.
--
-- ⚠️ Solo cambios SEGUROS aquí + probar en staging. Esta migración es 100% aditiva:
--    crea UNA tabla nueva con RLS propia y NO toca ninguna policy, RPC, tabla o
--    columna existente. El modelo anónimo (host_token + RLS de las 004/008/011)
--    sigue intacto y gobernando TODAS las acciones de host. Esta tabla es solo un
--    índice personal "qué boletas guardé en mi cuenta", para que el historial
--    sobreviva entre dispositivos. NO otorga ningún permiso de acción sobre una
--    sesión: quién puede confirmar pagos / cerrar boletas lo sigue decidiendo el
--    host_token, no `auth.uid()`.
--
-- Requisito en el dashboard: habilitar Authentication → Email (magic link / OTP).
-- Sin eso, nadie puede iniciar sesión y esta tabla simplemente queda vacía; la app
-- degrada con gracia (la entrada de "entra con tu correo" muestra un aviso claro).
--
-- ============================================================
-- TABLA: user_sessions (relación N:M entre auth.users y sessions)
-- ============================================================
create table if not exists user_sessions (
  user_id    uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references sessions (id)   on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

-- Índice para listar rápido "mis boletas" por usuario.
create index if not exists user_sessions_user_idx on user_sessions (user_id);

-- ============================================================
-- RLS: un usuario SOLO ve / inserta / borra SUS PROPIAS filas.
-- Nadie anónimo toca esta tabla (solo rol `authenticated`).
-- ============================================================
alter table user_sessions enable row level security;

drop policy if exists "user_sessions_select_own" on user_sessions;
create policy "user_sessions_select_own" on user_sessions
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_sessions_insert_own" on user_sessions;
create policy "user_sessions_insert_own" on user_sessions
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_sessions_delete_own" on user_sessions;
create policy "user_sessions_delete_own" on user_sessions
  for delete to authenticated
  using (auth.uid() = user_id);

-- (Sin UPDATE: una fila es un puntero inmutable user→session; se crea o se borra.)
--
-- NOTA sobre visibilidad de la boleta en sí: que un usuario tenga una fila en
-- user_sessions NO cambia las policies de `sessions`/`items`/`payments`/etc. La
-- lectura de esas tablas se rige por sus propias policies (lectura pública por
-- session_id, como hoy). Esto es solo un marcador "guardé esta boleta", nunca una
-- llave de acción.
