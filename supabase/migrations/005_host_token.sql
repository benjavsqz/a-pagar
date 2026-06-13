-- 005: Host token — autorización real para acciones de anfitrión
-- Ejecutar en Supabase SQL Editor DESPUÉS de la 004.
--
-- Problema: sin auth, cualquier participante podía confirmar pagos (UPDATE
-- payments con policy abierta) o suplantar al host. Solución: al crear la
-- sesión, el cliente genera un token secreto que se guarda en una tabla SIN
-- lectura pública. Las acciones de host (confirmar pago, cerrar boleta) pasan
-- por funciones SECURITY DEFINER que validan el token.
--
-- Compatibilidad: sesiones creadas ANTES de esta migración no tienen secreto;
-- para ellas las funciones operan en modo legacy (sin token), igual que hoy.

-- =====================
-- SESSION_SECRETS: solo INSERT desde el cliente; nunca SELECT/UPDATE/DELETE
-- =====================
create table if not exists session_secrets (
  session_id uuid primary key references sessions(id) on delete cascade,
  host_token uuid not null,
  created_at timestamptz not null default now()
);

alter table session_secrets enable row level security;

drop policy if exists "secrets_insert_any" on session_secrets;
create policy "secrets_insert_any" on session_secrets
  for insert with check (true);
-- (sin policy de select/update/delete → denegado por defecto)

-- =====================
-- GUARD: el cliente (rol anon) no puede tocar confirmed_by_host directamente
-- =====================
create or replace function guard_payment_confirmation()
returns trigger language plpgsql as $$
begin
  -- Las funciones security definer corren como el dueño (postgres) y pasan.
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.confirmed_by_host := false;
    elsif new.confirmed_by_host is distinct from old.confirmed_by_host then
      raise exception 'Solo el anfitrión puede confirmar pagos';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_payment_confirmation on payments;
create trigger trg_guard_payment_confirmation
  before insert or update on payments
  for each row execute function guard_payment_confirmation();

-- =====================
-- RPC: confirmar pago (valida host_token)
-- =====================
create or replace function confirm_payment(
  p_session_id uuid,
  p_participant_id uuid,
  p_token uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_secret uuid;
begin
  select host_token into v_secret from session_secrets where session_id = p_session_id;
  -- Legacy: sesiones sin secreto se permiten (modelo de confianza anterior)
  if v_secret is not null and (p_token is null or v_secret <> p_token) then
    raise exception 'Token de anfitrión inválido';
  end if;

  update payments
     set confirmed_by_host = true
   where session_id = p_session_id
     and participant_id = p_participant_id;
end;
$$;

-- =====================
-- RPC: cerrar boleta (valida host_token)
-- =====================
create or replace function close_session(
  p_session_id uuid,
  p_token uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_secret uuid;
begin
  select host_token into v_secret from session_secrets where session_id = p_session_id;
  if v_secret is not null and (p_token is null or v_secret <> p_token) then
    raise exception 'Token de anfitrión inválido';
  end if;

  update sessions set status = 'closed' where id = p_session_id;
end;
$$;

-- =====================
-- Una boleta cerrada no acepta nuevos participantes
-- =====================
drop policy if exists "participants_insert_any" on participants;
create policy "participants_insert_open_session" on participants
  for insert with check (
    exists (select 1 from sessions s where s.id = session_id and s.status = 'open')
  );

-- =====================
-- CLAIMS: columna session_id para poder filtrar realtime por sesión
-- (el código aún no la usa; queda lista para activar el filtro)
-- =====================
alter table claims add column if not exists session_id uuid references sessions(id) on delete cascade;

update claims c
   set session_id = i.session_id
  from items i
 where i.id = c.item_id
   and c.session_id is null;

create or replace function fill_claim_session_id()
returns trigger language plpgsql as $$
begin
  if new.session_id is null then
    select session_id into new.session_id from items where id = new.item_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fill_claim_session_id on claims;
create trigger trg_fill_claim_session_id
  before insert on claims
  for each row execute function fill_claim_session_id();

create index if not exists claims_session_id_idx on claims(session_id);

-- =====================
-- STORAGE: bucket de comprobantes privado + límites de subida
-- (la app ahora guarda el path y genera signed URLs al ver el comprobante)
-- =====================
update storage.buckets
   set public = false,
       file_size_limit = 5242880, -- 5 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','application/pdf']
 where id = 'comprobantes';
