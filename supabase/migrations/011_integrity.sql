-- 011: Integridad de datos (auditoría ultra 2026-06-14, audits/08).
-- Ejecutar en Supabase SQL Editor DESPUÉS de la 010.
-- Cierra 4 brechas P0/P1 de integridad/seguridad que dependían solo del cliente.

-- ============================================================
-- (A) [P0] Claims solo mutables si la sesión está ABIERTA.
--     La 008 endureció participants con status='open' pero NO se replicó a
--     claims: cualquiera con el session_id podía insertar/borrar claims sobre
--     una boleta cerrada vía API directa, alterando el reparto post-cierre.
--     (La UI ya lo bloquea, pero eso es solo cliente.)
-- ============================================================
drop policy if exists "claims_insert_any" on claims;
create policy "claims_insert_open" on claims for insert with check (
  exists (
    select 1 from items i
      join sessions s on s.id = i.session_id
     where i.id = item_id and s.status = 'open'
  )
);

drop policy if exists "claims_delete_any" on claims;
create policy "claims_delete_open" on claims for delete using (
  exists (
    select 1 from items i
      join sessions s on s.id = i.session_id
     where i.id = item_id and s.status = 'open'
  )
);

-- ============================================================
-- (B) [P1] Nombres de participante únicos por sesión (case/space-insensitive).
--     El chequeo en cliente tiene carrera; dos "María" simultáneos pasaban ambos.
--     NOTA: si una sesión existente ya tiene nombres duplicados, este índice
--     fallará al crearse — limpiar duplicados antes o aplicar en ventana sin tráfico.
-- ============================================================
create unique index if not exists participants_session_name_unique
  on participants (session_id, lower(trim(name)));

-- ============================================================
-- (C) [P1] Tope de cupo en "partes iguales", a prueba de carrera.
--     sharePerPerson = split_total/split_n es fijo; si entran más de split_n-1
--     invitados (el host es el +1), la suma cobrada supera el total (sobre-cobro).
--     El `for update` sobre la fila de sessions serializa joins concurrentes.
-- ============================================================
create or replace function check_equal_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mode text;
  v_n int;
  v_count int;
begin
  select split_mode, split_n into v_mode, v_n
    from sessions where id = new.session_id for update;

  if v_mode = 'equal' and v_n is not null and not coalesce(new.is_host, false) then
    select count(*) into v_count
      from participants
     where session_id = new.session_id and coalesce(is_host, false) = false;
    if v_count >= v_n - 1 then
      raise exception 'La mesa de partes iguales ya está completa';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_equal_capacity on participants;
create trigger trg_check_equal_capacity
  before insert on participants
  for each row execute function check_equal_capacity();

-- ============================================================
-- (D) [P1] Monto del pago recalculado en el servidor (no confiar en el cliente).
--     La 009 congeló amount en UPDATE pero el INSERT quedó libre: un participante
--     podía registrar amount=1 y figurar como "pagó". Este trigger BEFORE INSERT
--     ignora el amount del cliente y lo recalcula desde claims/split, replicando
--     EXACTO el redondeo de computeParticipantSummary (src/lib/utils.ts):
--       items: subtotal = Σ ceil(item.price / claims_del_item); total = subtotal + ceil(subtotal*pct/100)
--       equal: ceil(split_total / split_n)
--     Corre antes que trg_guard_payment_confirmation (009) por orden alfabético.
-- ============================================================
create or replace function set_payment_amount()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mode text;
  v_pct int;
  v_split_total int;
  v_split_n int;
  v_subtotal numeric;
begin
  select split_mode, propina_pct, split_total, split_n
    into v_mode, v_pct, v_split_total, v_split_n
    from sessions where id = new.session_id;

  if v_mode = 'equal' and v_split_n is not null and v_split_n > 0 then
    new.amount := ceil(v_split_total::numeric / v_split_n);
  else
    select coalesce(sum(ceil(i.price::numeric / cc.cnt)), 0)
      into v_subtotal
      from claims cl
      join items i on i.id = cl.item_id
      join (select item_id, count(*) cnt from claims group by item_id) cc
        on cc.item_id = cl.item_id
     where cl.participant_id = new.participant_id
       and i.session_id = new.session_id;
    new.amount := v_subtotal + ceil(v_subtotal * coalesce(v_pct, 0) / 100.0);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_payment_amount on payments;
create trigger trg_set_payment_amount
  before insert on payments
  for each row execute function set_payment_amount();
