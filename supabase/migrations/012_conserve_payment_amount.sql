-- 012: Conservación del dinero — el host absorbe el resto del redondeo.
-- Ejecutar en Supabase SQL Editor DESPUÉS de la 011.
--
-- CONTEXTO: la 011 (D) recalcula payment.amount en el servidor con ceil por
-- persona (Σ ceil(price/N)), que para divisiones impares SUPERA el precio del
-- ítem (plata fantasma: $10.000 ÷3 = $10.002). El cliente ahora reparte el
-- precio conservando el total exacto (src/lib/utils.ts → claimShare). Este
-- trigger debe replicar EXACTO esa lógica o payment.amount diverge de lo que el
-- invitado ve y de lo que el host suma.
--
-- MODELO "el host absorbe el resto" (idéntico a claimShare en TS):
--   - N claimants de un ítem. Si N<=1 → paga el precio completo.
--   - Si el host reclama el ítem: los invitados pagan ceil(price/N) y el host
--     paga el remanente exacto (price − Σ invitados). Su consumo no se cobra.
--   - Si NO hay host entre los claimants: el resto (price mod N) se reparte de a
--     $1 entre los primeros (orden estable por created_at, luego id).
--
-- ⚠️ Esta migración no se pudo ejecutar contra Postgres en el entorno de
--    desarrollo: PROBAR en un proyecto Supabase de staging antes de producción.

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
    select coalesce(sum(
      case
        when s.n <= 1 then s.price
        -- El host comparte el ítem: invitados pagan ceil; el host absorbe el resto.
        when s.has_host and s.i_am_host then s.price - ceil(s.price::numeric / s.n) * (s.n - 1)
        when s.has_host then ceil(s.price::numeric / s.n)
        -- Solo invitados: reparte el resto de a $1 entre los primeros (orden estable).
        else floor(s.price::numeric / s.n)
             + (case when s.my_idx < (s.price - floor(s.price::numeric / s.n) * s.n) then 1 else 0 end)
      end
    ), 0)
    into v_subtotal
    from (
      select
        i.id as item_id,
        i.price,
        (select count(*) from claims c where c.item_id = i.id) as n,
        exists (
          select 1 from claims ch
            join participants ph on ph.id = ch.participant_id
           where ch.item_id = i.id and coalesce(ph.is_host, false)
        ) as has_host,
        coalesce(
          (select pme.is_host from participants pme where pme.id = new.participant_id),
          false
        ) as i_am_host,
        -- índice 0-based de MI claim entre los del ítem (orden created_at, id)
        (select count(*)
           from claims co, claims cm
          where co.item_id = i.id
            and cm.item_id = i.id
            and cm.participant_id = new.participant_id
            and (co.created_at < cm.created_at
                 or (co.created_at = cm.created_at and co.id < cm.id))
        ) as my_idx
      from claims cl
      join items i on i.id = cl.item_id
      where cl.participant_id = new.participant_id
        and i.session_id = new.session_id
    ) s;

    new.amount := v_subtotal + ceil(v_subtotal * coalesce(v_pct, 0) / 100.0);
  end if;
  return new;
end;
$$;

-- El trigger trg_set_payment_amount (011 D) ya apunta a esta función; al
-- reemplazarla con CREATE OR REPLACE no hace falta recrearlo.
