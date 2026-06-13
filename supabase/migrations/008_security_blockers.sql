-- 008: Cierre de bloqueadores de seguridad detectados en la auditoría (audits/01-seguridad.md)
-- Ejecutar en Supabase SQL Editor DESPUÉS de la 007.
--
-- Cubre tres hallazgos que bloqueaban producción:
--   (A) Bypass de token en modo "legacy": las RPC confirm_payment/close_session
--       aceptaban token NULL cuando la sesión no tenía secreto → cualquiera con
--       el session_id (visible en la URL) confirmaba pagos o cerraba boletas ajenas.
--   (B) Escalada de privilegios vía is_host: la policy de INSERT de participants
--       permitía a un invitado auto-marcarse is_host=true y esconderse del cobro.
--   (C) (parcial) endurecimiento del bucket de comprobantes.
--
-- Compatibilidad: las sesiones SIN secreto (creadas antes de la 005) ya no pueden
-- confirmar/cerrar por RPC. Es el comportamiento seguro y deseado: solo el
-- dispositivo que creó la boleta (y por tanto tiene el host_token) puede actuar.

-- ============================================================
-- (A) RPC: exigir host_token SIEMPRE (sin excepción legacy)
-- ============================================================
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
  if v_secret is null or p_token is null or v_secret <> p_token then
    raise exception 'Token de anfitrión inválido o ausente';
  end if;

  update payments
     set confirmed_by_host = true
   where session_id = p_session_id
     and participant_id = p_participant_id;
end;
$$;

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

  update sessions set status = 'closed' where id = p_session_id;
end;
$$;

-- ============================================================
-- (B) is_host no puede setearse desde el cliente (rol anon).
--     La policy de INSERT solo deja crear INVITADOS (is_host = false).
--     El participante "anfitrión" se crea con una RPC SECURITY DEFINER que
--     valida el host_token (corre como owner → ignora RLS y el WITH CHECK).
-- ============================================================
drop policy if exists "participants_insert_open_session" on participants;
create policy "participants_insert_guest_only" on participants
  for insert with check (
    is_host = false
    and exists (select 1 from sessions s where s.id = session_id and s.status = 'open')
  );

create or replace function register_host_participant(
  p_session_id uuid,
  p_name text,
  p_token uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_secret uuid;
  v_id uuid;
begin
  select host_token into v_secret from session_secrets where session_id = p_session_id;
  if v_secret is null or p_token is null or v_secret <> p_token then
    raise exception 'Token de anfitrión inválido o ausente';
  end if;

  -- Idempotente: respeta el unique index participants_one_host_per_session (007)
  select id into v_id from participants
   where session_id = p_session_id and is_host limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into participants (session_id, name, is_host)
  values (p_session_id, coalesce(nullif(trim(p_name), ''), 'Anfitrión'), true)
  returning id into v_id;
  return v_id;
end;
$$;

-- ============================================================
-- (C) STORAGE: el bucket de comprobantes debe ser privado y NO listable por anon.
--     La app sube el comprobante (INSERT) y luego genera signed URLs para verlo.
--     Estas policies acotan storage.objects del bucket 'comprobantes':
--       - INSERT permitido (subir comprobante)
--       - SELECT permitido (necesario para createSignedUrl con anon)
--       - sin UPDATE/DELETE para anon
--     NOTA: revisa en el dashboard que no queden policies abiertas heredadas
--     y que el bucket siga con public=false (migración 005).
-- ============================================================
drop policy if exists "comprobantes_insert" on storage.objects;
create policy "comprobantes_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'comprobantes');

drop policy if exists "comprobantes_select" on storage.objects;
create policy "comprobantes_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'comprobantes');
