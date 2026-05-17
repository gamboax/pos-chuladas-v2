create extension if not exists pgcrypto;

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  name text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  city text not null,
  cashier_id text,
  cashier_name text not null,
  subtotal numeric(12, 2) not null default 0,
  discount_percent numeric(5, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  payment_method text not null,
  customer_name text,
  customer_whatsapp text,
  customer_type text,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  category text not null,
  quantity numeric(12, 2) not null,
  unit_price numeric(12, 2) not null,
  subtotal numeric(12, 2) not null,
  material text,
  code_detected text,
  capture_origin text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  city text,
  description text not null,
  amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.cash_cuts (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  cashier_name text,
  expected_total numeric(12, 2) not null default 0,
  counted_total numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_lots (
  id uuid primary key default gen_random_uuid(),
  supplier text,
  total_cost numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_lot_items (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid references public.purchase_lots(id) on delete cascade,
  category text,
  material text,
  quantity numeric(12, 2) not null default 0,
  unit_cost numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists sales_folio_idx on public.sales (folio);
create index if not exists sales_city_created_at_idx on public.sales (city, created_at desc);
create index if not exists sale_items_sale_id_idx on public.sale_items (sale_id);
create index if not exists sale_items_category_idx on public.sale_items (category);

alter table public.cities enable row level security;
alter table public.events enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.expenses enable row level security;
alter table public.cash_cuts enable row level security;
alter table public.purchase_lots enable row level security;
alter table public.purchase_lot_items enable row level security;

drop policy if exists "Allow public cities read" on public.cities;
drop policy if exists "Allow public events read" on public.events;
drop policy if exists "Allow public sales inserts" on public.sales;
drop policy if exists "Allow public sales select" on public.sales;
drop policy if exists "Allow public sale item inserts" on public.sale_items;
drop policy if exists "Allow public sale item select" on public.sale_items;

create policy "Allow public cities read"
  on public.cities
  for select
  to anon, authenticated
  using (true);

create policy "Allow public events read"
  on public.events
  for select
  to anon, authenticated
  using (true);

create policy "Allow public sales inserts"
  on public.sales
  for insert
  to anon, authenticated
  with check (true);

create policy "Allow public sales select"
  on public.sales
  for select
  to anon, authenticated
  using (true);

create policy "Allow public sale item inserts"
  on public.sale_items
  for insert
  to anon, authenticated
  with check (true);

create policy "Allow public sale item select"
  on public.sale_items
  for select
  to anon, authenticated
  using (true);

grant select on public.cities to anon, authenticated;
grant select on public.events to anon, authenticated;
grant select, insert on public.sales to anon, authenticated;
grant select, insert on public.sale_items to anon, authenticated;

-- Admin-phase tables are created for future work. Grant only after the admin UI and RLS model are finalized.
