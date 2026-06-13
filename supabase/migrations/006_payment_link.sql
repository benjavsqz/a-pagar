-- 006: Datos extra del anfitrión (opcionales)
-- Ejecutar en Supabase SQL Editor.
--
-- host_payment_link: link de pago (Mercado Pago, MACH, Fintoc Cobro, alias…)
--   que el participante abre con un botón "Pagar ahora".
-- host_email: correo del anfitrión — en Chile la transferencia avisa al correo
--   del destinatario, así que es parte de los datos para transferir.
-- Ambos son opcionales; el flujo bancario sigue funcionando sin ellos.

alter table sessions add column if not exists host_payment_link text;
alter table sessions add column if not exists host_email text;
