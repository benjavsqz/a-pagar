-- 009: Integridad del monto de pago + verificación de participante
-- Ejecutar en Supabase SQL Editor DESPUÉS de la 008.
--
-- Cubre dos hallazgos de la auditoría (audits/01-seguridad.md, audits/02-database.md):
--   (A) [ALTO] payments.amount mutable: la policy payments_update_any (FOR UPDATE
--       USING true) dejaba a un participante bajar su amount a $1 antes de que el
--       host confirmara (subiendo cualquier comprobante). El trigger de la 005 solo
--       protege confirmed_by_host, no el monto.
--   (B) [SEV3] confirm_payment no verificaba que el participant perteneciera a la
--       session — defensa en profundidad y error explícito.

-- ============================================================
-- (A) El rol anon no puede modificar amount de un pago ya creado.
--     Se reescribe el guard existente para cubrir también el monto:
--       - INSERT: confirmed_by_host se fuerza a false (igual que la 005).
--       - UPDATE (anon/authenticated): bloquear cambios a confirmed_by_host
--         y a amount. El monto solo se fija al crear el pago; recalcularlo
--         debe pasar por borrar/recrear el pago, no por un UPDATE silencioso.
--     Las RPC SECURITY DEFINER corren como owner (current_user = postgres) y pasan.
-- ============================================================
create or replace function guard_payment_confirmation()
returns trigger language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.confirmed_by_host := false;
    else
      if new.confirmed_by_host is distinct from old.confirmed_by_host then
        raise exception 'Solo el anfitrión puede confirmar pagos';
      end if;
      if new.amount is distinct from old.amount then
        raise exception 'No se puede modificar el monto de un pago ya registrado';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- El trigger trg_guard_payment_confirmation (creado en la 005) ya invoca esta
-- función en before insert or update; al hacer CREATE OR REPLACE basta con esto.

-- ============================================================
-- (B) confirm_payment: exigir token (como en la 008) y además verificar que el
--     participante pertenezca a la sesión antes de confirmar.
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

  if not exists (
    select 1 from participants
     where id = p_participant_id and session_id = p_session_id
  ) then
    raise exception 'El participante no pertenece a esta boleta';
  end if;

  update payments
     set confirmed_by_host = true
   where session_id = p_session_id
     and participant_id = p_participant_id;
end;
$$;
