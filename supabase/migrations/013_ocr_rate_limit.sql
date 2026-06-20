-- 013: Rate-limit durable del OCR por IP (ventana fija) en Supabase.
-- Ejecutar en Supabase SQL Editor DESPUÉS de la 012.
--
-- CONTEXTO: el limitador del route (src/app/api/ocr/route.ts) es en memoria y
-- por-instancia serverless: con N lambdas el límite efectivo es N×límite, y un
-- atacante cae en instancias frescas para gastar la cuota de Gemini. Esta tabla
-- + función hacen el conteo GLOBAL entre instancias. Sin datos personales: solo
-- IP + contador por ventana.
--
-- ⚠️ No se pudo ejecutar contra Postgres en desarrollo: probar en staging.

create table if not exists public.ocr_rate_limit (
  ip           text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (ip, window_start)
);

-- Acceso solo vía la función SECURITY DEFINER de abajo (no lectura/escritura directa).
alter table public.ocr_rate_limit enable row level security;
revoke all on public.ocr_rate_limit from anon, authenticated;

-- Registra un hit y devuelve TRUE si la IP ya superó el límite en la ventana
-- actual. Ventana fija de p_window_seconds. Conteo atómico con upsert.
create or replace function public.hit_ocr_rate_limit(
  p_ip text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.ocr_rate_limit (ip, window_start, count)
  values (p_ip, v_window, 1)
  on conflict (ip, window_start)
  do update set count = public.ocr_rate_limit.count + 1
  returning count into v_count;

  -- Limpieza oportunista de ventanas viejas.
  delete from public.ocr_rate_limit
   where window_start < now() - make_interval(secs => p_window_seconds * 3);

  return v_count > p_limit;
end;
$$;

revoke all on function public.hit_ocr_rate_limit(text, integer, integer) from public;
grant execute on function public.hit_ocr_rate_limit(text, integer, integer) to anon, authenticated;
