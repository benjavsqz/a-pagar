-- 007: El anfitrión puede marcar lo que consumió
-- Ejecutar en Supabase SQL Editor DESPUÉS de la 006.
--
-- CONTEXTO: hasta ahora el host NO era un participante; su consumo se asumía
-- como "el resto no reclamado" y nunca se cobraba. El problema: si el host
-- compartía un plato con un amigo y solo el amigo lo marcaba, el amigo pagaba
-- el 100% en vez del 50%.
--
-- SOLUCIÓN: el host pasa a ser un participante marcado con is_host = true.
-- Sus claims SÍ cuentan para dividir bien los platos compartidos (÷N), pero
-- su consumo se EXCLUYE de lo "por cobrar" (no se cobra a sí mismo) y no
-- aparece como alguien que debe transferir.
--
-- Compatibilidad: sesiones antiguas no tienen participante host (la columna
-- default false). Todo sigue funcionando: simplemente nadie está marcado como
-- host y el cálculo se comporta como antes.

alter table participants
  add column if not exists is_host boolean not null default false;

-- Como máximo un host por sesión.
create unique index if not exists participants_one_host_per_session
  on participants (session_id)
  where is_host;
