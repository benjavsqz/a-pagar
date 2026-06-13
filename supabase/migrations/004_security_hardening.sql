-- 004: Endurecimiento de seguridad RLS
-- Ejecutar en Supabase SQL Editor.
--
-- CONTEXTO: la app no usa auth — host_id siempre es null. La policy original
-- "sessions_update_host" (host_id = auth.uid() OR host_id IS NULL) permitía a
-- CUALQUIER visitante con el link hacer UPDATE de la sesión, incluyendo
-- host_account y host_rut → un atacante podía redirigir las transferencias
-- a su propia cuenta bancaria.
--
-- La app nunca hace UPDATE a sessions ni a items después de crearlos,
-- así que se elimina ese permiso por completo (deny-by-default de RLS).

-- =====================
-- SESSIONS: nadie puede modificar una sesión una vez creada
-- =====================
drop policy if exists "sessions_update_host" on sessions;

-- =====================
-- ITEMS: inmutables después de la creación (la app no los edita ni borra)
-- =====================
drop policy if exists "items_update_host" on items;
drop policy if exists "items_delete_host" on items;

-- =====================
-- PAYMENTS: impedir que se modifique el monto o se "des-confirme" un pago.
-- La app solo necesita UPDATE para:
--   a) participante re-sube comprobante (upsert) mientras no esté confirmado
--   b) host marca confirmed_by_host = true
-- Un trigger protege los campos sensibles una vez confirmado el pago.
-- =====================
create or replace function protect_confirmed_payments()
returns trigger language plpgsql as $$
begin
  -- Un pago confirmado queda congelado (solo se permite no cambiar nada)
  if old.confirmed_by_host = true and (
    new.confirmed_by_host = false
    or new.amount <> old.amount
    or coalesce(new.comprobante_url, '') <> coalesce(old.comprobante_url, '')
  ) then
    raise exception 'No se puede modificar un pago ya confirmado';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_confirmed_payments on payments;
create trigger trg_protect_confirmed_payments
  before update on payments
  for each row execute function protect_confirmed_payments();

-- =====================
-- PUSH_SUBSCRIPTIONS: las suscripciones (endpoint + claves) no deberían ser
-- públicamente legibles. NOTA: /api/push/send hoy usa la anon key, por lo que
-- quitar el SELECT público lo rompería. Cuando agregues SUPABASE_SERVICE_ROLE_KEY
-- al servidor y cambies src/lib/supabase/server.ts para usarla en esa ruta,
-- descomenta estas líneas:
--
-- drop policy if exists "Anyone can read subscriptions" on push_subscriptions;
-- drop policy if exists "Anyone can delete subscriptions" on push_subscriptions;
