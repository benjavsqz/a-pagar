-- A-Pagar: Esquema inicial
-- Ejecutar en Supabase SQL Editor

-- =====================
-- SESSIONS
-- =====================
create table sessions (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid references auth.users(id) on delete set null,
  restaurant_name text,
  status      text not null default 'open' check (status in ('open', 'closed')),
  propina_pct integer not null default 10 check (propina_pct in (0, 10)),
  host_name   text not null,
  host_bank   text,
  host_account text,
  host_rut    text,
  created_at  timestamptz not null default now()
);

-- =====================
-- ITEMS
-- =====================
create table items (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  name        text not null,
  price       integer not null, -- en pesos CLP, sin decimales
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

-- =====================
-- PARTICIPANTS
-- =====================
create table participants (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- =====================
-- CLAIMS (quién marcó qué ítem)
-- =====================
create table claims (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references items(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique(item_id, participant_id) -- un participante no puede reclamar el mismo ítem dos veces
);

-- =====================
-- PAYMENTS
-- =====================
create table payments (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references sessions(id) on delete cascade,
  participant_id      uuid not null references participants(id) on delete cascade,
  amount              integer not null,
  comprobante_url     text,
  confirmed_by_host   boolean not null default false,
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  unique(session_id, participant_id)
);

-- =====================
-- ÍNDICES
-- =====================
create index on items(session_id);
create index on participants(session_id);
create index on claims(item_id);
create index on claims(participant_id);
create index on payments(session_id);

-- =====================
-- RLS (Row Level Security)
-- =====================
alter table sessions    enable row level security;
alter table items       enable row level security;
alter table participants enable row level security;
alter table claims      enable row level security;
alter table payments    enable row level security;

-- Sessions: lectura pública por link, escritura solo autenticados o anónimos con el session_id
create policy "sessions_read_public" on sessions for select using (true);
create policy "sessions_insert_any" on sessions for insert with check (true);
create policy "sessions_update_host" on sessions for update using (
  host_id = auth.uid() or host_id is null
);

-- Items: lectura pública, escritura solo si eres el host de la sesión
create policy "items_read_public" on items for select using (true);
create policy "items_insert_host" on items for insert with check (true);
create policy "items_update_host" on items for update using (true);
create policy "items_delete_host" on items for delete using (true);

-- Participants: lectura pública, inserción libre
create policy "participants_read_public" on participants for select using (true);
create policy "participants_insert_any" on participants for insert with check (true);

-- Claims: lectura pública, inserción y borrado libre (el participante marca y desmarca)
create policy "claims_read_public" on claims for select using (true);
create policy "claims_insert_any" on claims for insert with check (true);
create policy "claims_delete_any" on claims for delete using (true);

-- Payments: lectura pública, inserción libre
create policy "payments_read_public" on payments for select using (true);
create policy "payments_insert_any" on payments for insert with check (true);
create policy "payments_update_any" on payments for update using (true);

-- =====================
-- REALTIME
-- =====================
-- Habilitar realtime para claims y payments (lo que cambia en tiempo real)
alter publication supabase_realtime add table claims;
alter publication supabase_realtime add table payments;

-- =====================
-- STORAGE (comprobantes)
-- =====================
insert into storage.buckets (id, name, public) values ('comprobantes', 'comprobantes', true);

create policy "comprobantes_read_public" on storage.objects
  for select using (bucket_id = 'comprobantes');

create policy "comprobantes_insert_any" on storage.objects
  for insert with check (bucket_id = 'comprobantes');
