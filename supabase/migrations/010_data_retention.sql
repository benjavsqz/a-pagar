-- 010: Retención de datos del host (Ley 21.719) — anonimizar 30 días tras cerrar
-- Ejecutar en Supabase SQL Editor DESPUÉS de la 009.
--
-- Decisión de producto: los datos personales del anfitrión (RUT, cuenta, banco,
-- correo, link de pago) se borran 30 días después de que la boleta se cierra.
-- audits/01-seguridad.md (PII sin TTL) + decisión del equipo.

-- ============================================================
-- closed_at: necesitamos saber CUÁNDO se cerró para contar los 30 días.
-- ============================================================
alter table sessions add column if not exists closed_at timestamptz;

-- close_session pasa a registrar el instante de cierre (mantiene la validación
-- de token de la 008/009).
create or replace function close_session(
  p_session_id uuid,
  p_token uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_secret uuid;
begin
  select host_token into v_secret from session_secrets where session_id = p_session_id;
  if v_secret is null or p_token is null or v_secret <> p_token then
    raise exception 'Token de anfitrión inválido o ausente';
  end if;

  update sessions
     set status = 'closed',
         closed_at = coalesce(closed_at, now())
   where id = p_session_id;
end;
$$;

-- ============================================================
-- Anonimización: borra PII del host en boletas cerradas hace > 30 días.
-- Idempotente: solo toca filas que aún tengan datos.
-- ============================================================
create or replace function anonymize_old_sessions()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  with updated as (
    update sessions
       set host_rut = null,
           host_account = null,
           host_bank = null,
           host_email = null,
           host_payment_link = null
     where status = 'closed'
       and closed_at is not null
       and closed_at < now() - interval '30 days'
       and (host_rut is not null or host_account is not null or host_bank is not null
            or host_email is not null or host_payment_link is not null)
    returning 1
  )
  select count(*) into v_count from updated;

  -- Los secretos de host de boletas viejas tampoco hacen falta.
  delete from session_secrets s
   using sessions ss
   where ss.id = s.session_id
     and ss.status = 'closed'
     and ss.closed_at is not null
     and ss.closed_at < now() - interval '30 days';

  return v_count;
end;
$$;

-- ============================================================
-- Programación automática (pg_cron). Corre todos los días a las 03:00.
-- NOTA: en Supabase, pg_cron debe habilitarse una vez en
--   Dashboard → Database → Extensions → "pg_cron".
-- Si la extensión no está habilitada, las dos líneas de abajo fallarán: habilítala
-- y vuelve a ejecutar SOLO este bloque. La función ya queda creada y se puede
-- llamar a mano con  select anonymize_old_sessions();
-- ============================================================
-- create extension if not exists pg_cron;
-- select cron.schedule('anonymize-old-sessions', '0 3 * * *', $$ select anonymize_old_sessions(); $$);
