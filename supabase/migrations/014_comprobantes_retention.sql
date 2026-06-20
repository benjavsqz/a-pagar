-- 014: Retención de comprobantes (Ley 21.719) — caducar 30 días tras cerrar.
-- Ejecutar en Supabase SQL Editor DESPUÉS de la 013.
--
-- Decisión de producto (coherente con la 010): los comprobantes de transferencia
-- que los participantes suben (imágenes en un bucket privado de Storage) son datos
-- personales y no deben conservarse indefinidamente. Se "caducan" 30 días después
-- de que la boleta se cierra, igual que el PII del anfitrión.
--
-- ⚠️ IMPORTANTE — LÍMITE DE ESTA MIGRACIÓN (TODO para el humano):
--   Esta migración SOLO pone en NULL la referencia `payments.comprobante_url` de las
--   boletas cerradas hace > 30 días, de modo que la imagen deja de ser accesible
--   desde la app. El OBJETO físico en el bucket de Storage NO se borra desde SQL:
--   los archivos viven en `storage.objects` / el backend de Storage y eliminarlos a
--   mano por SQL puede dejar el bucket inconsistente.
--   Para borrar de verdad el archivo se necesita UNA de estas dos opciones, que un
--   humano debe configurar en el panel de Supabase:
--     (a) Una regla de ciclo de vida (lifecycle / object TTL) en el bucket de
--         comprobantes que expire los objetos a los 30 días, o
--     (b) Una Edge Function programada (Scheduled Function) que liste y borre los
--         objetos huérfanos vía la Storage API (service_role) usando
--         storage.remove([...]). Ver el bloque pg_cron del final si decides
--         dispararla desde la base de datos.
--   Mientras eso no exista, el archivo queda en el bucket aunque la app ya no lo
--   muestre. Documentado a propósito para no prometer protección que no existe.
--
-- ⚠️ No se pudo ejecutar contra Postgres en desarrollo: probar en staging.

-- ============================================================
-- Caduca la referencia al comprobante en boletas cerradas hace > 30 días.
-- Idempotente: solo toca filas que aún tengan una URL.
-- Reutiliza sessions.closed_at (creado en la 010).
-- ============================================================
create or replace function anonymize_old_comprobantes()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  with updated as (
    update payments p
       set comprobante_url = null
      from sessions s
     where s.id = p.session_id
       and s.status = 'closed'
       and s.closed_at is not null
       and s.closed_at < now() - interval '30 days'
       and p.comprobante_url is not null
    returning 1
  )
  select count(*) into v_count from updated;

  return v_count;
end;
$$;

-- ============================================================
-- Programación automática (pg_cron). Corre todos los días a las 03:10
-- (después de anonymize_old_sessions de la 010, a las 03:00).
-- NOTA: en Supabase, pg_cron debe habilitarse una vez en
--   Dashboard → Database → Extensions → "pg_cron".
-- NO asumas que pg_cron existe: si la extensión no está habilitada, las dos
-- líneas de abajo fallarán. Habilítala y vuelve a ejecutar SOLO este bloque.
-- La función ya queda creada y se puede llamar a mano con
--   select anonymize_old_comprobantes();
--
-- RECORDATORIO: esto NO borra el archivo del bucket (ver TODO de la cabecera).
-- Si además agendas una Edge Function que limpie Storage, hazlo aparte.
-- ============================================================
-- create extension if not exists pg_cron;
-- select cron.schedule('anonymize-old-comprobantes', '10 3 * * *', $$ select anonymize_old_comprobantes(); $$);
