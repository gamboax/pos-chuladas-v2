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
  category text not null default 'Otros',
  description text not null,
  amount numeric(12, 2) not null default 0,
  payment_method text not null default 'Efectivo',
  created_at timestamptz not null default now()
);

alter table public.expenses add column if not exists city text;
alter table public.expenses add column if not exists category text not null default 'Otros';
alter table public.expenses add column if not exists payment_method text not null default 'Efectivo';

create table if not exists public.cash_cuts (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  cashier_name text,
  expected_total numeric(12, 2) not null default 0,
  counted_total numeric(12, 2) not null default 0,
  total_sales numeric(12, 2) not null default 0,
  expected_cash numeric(12, 2) not null default 0,
  cash_counted numeric(12, 2) not null default 0,
  transfer_total numeric(12, 2) not null default 0,
  card_total numeric(12, 2) not null default 0,
  cash_expenses numeric(12, 2) not null default 0,
  difference numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.cash_cuts add column if not exists total_sales numeric(12, 2) not null default 0;
alter table public.cash_cuts add column if not exists expected_cash numeric(12, 2) not null default 0;
alter table public.cash_cuts add column if not exists cash_counted numeric(12, 2) not null default 0;
alter table public.cash_cuts add column if not exists transfer_total numeric(12, 2) not null default 0;
alter table public.cash_cuts add column if not exists card_total numeric(12, 2) not null default 0;
alter table public.cash_cuts add column if not exists cash_expenses numeric(12, 2) not null default 0;
alter table public.cash_cuts add column if not exists difference numeric(12, 2) not null default 0;
alter table public.cash_cuts add column if not exists notes text;

create table if not exists public.purchase_lots (
  id uuid primary key default gen_random_uuid(),
  name text,
  supplier text,
  purchase_place text,
  purchase_date date,
  total_investment numeric(12, 2) not null default 0,
  total_cost numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.purchase_lots add column if not exists name text;
alter table public.purchase_lots add column if not exists supplier text;
alter table public.purchase_lots add column if not exists purchase_place text;
alter table public.purchase_lots add column if not exists purchase_date date;
alter table public.purchase_lots add column if not exists total_investment numeric(12, 2) not null default 0;
alter table public.purchase_lots add column if not exists total_cost numeric(12, 2) not null default 0;
alter table public.purchase_lots add column if not exists notes text;

create table if not exists public.purchase_lot_items (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid references public.purchase_lots(id) on delete cascade,
  code text,
  category text,
  material text,
  quantity_purchased numeric(12, 2) not null default 0,
  quantity numeric(12, 2) not null default 0,
  unit_cost numeric(12, 2) not null default 0,
  suggested_price numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.purchase_lot_items add column if not exists code text;
alter table public.purchase_lot_items add column if not exists category text;
alter table public.purchase_lot_items add column if not exists material text;
alter table public.purchase_lot_items add column if not exists quantity_purchased numeric(12, 2) not null default 0;
alter table public.purchase_lot_items add column if not exists quantity numeric(12, 2) not null default 0;
alter table public.purchase_lot_items add column if not exists unit_cost numeric(12, 2) not null default 0;
alter table public.purchase_lot_items add column if not exists suggested_price numeric(12, 2) not null default 0;

create table if not exists public.product_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  purchase_lot_item_id uuid references public.purchase_lot_items(id) on delete set null,
  purchase_lot_id uuid references public.purchase_lots(id) on delete set null,
  category text,
  material text,
  unit_cost numeric(12, 2) not null default 0,
  suggested_price numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.sale_items add column if not exists purchase_lot_item_id uuid references public.purchase_lot_items(id) on delete set null;
alter table public.sale_items add column if not exists product_code_id uuid references public.product_codes(id) on delete set null;

create index if not exists sales_folio_idx on public.sales (folio);
create index if not exists sales_city_created_at_idx on public.sales (city, created_at desc);
create index if not exists sale_items_sale_id_idx on public.sale_items (sale_id);
create index if not exists sale_items_category_idx on public.sale_items (category);
create index if not exists sale_items_code_detected_idx on public.sale_items (code_detected);
create index if not exists sale_items_purchase_lot_item_idx on public.sale_items (purchase_lot_item_id);
create index if not exists expenses_created_at_idx on public.expenses (created_at desc);
create index if not exists expenses_city_created_at_idx on public.expenses (city, created_at desc);
create index if not exists cash_cuts_created_at_idx on public.cash_cuts (created_at desc);
create index if not exists cash_cuts_city_created_at_idx on public.cash_cuts (city, created_at desc);
create index if not exists purchase_lots_created_at_idx on public.purchase_lots (created_at desc);
create index if not exists purchase_lot_items_lot_id_idx on public.purchase_lot_items (lot_id);
create index if not exists purchase_lot_items_code_idx on public.purchase_lot_items (code);
create index if not exists product_codes_code_idx on public.product_codes (code);
create index if not exists product_codes_lot_item_idx on public.product_codes (purchase_lot_item_id);

alter table public.cities enable row level security;
alter table public.events enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.expenses enable row level security;
alter table public.cash_cuts enable row level security;
alter table public.purchase_lots enable row level security;
alter table public.purchase_lot_items enable row level security;
alter table public.product_codes enable row level security;

drop policy if exists "Allow public cities read" on public.cities;
drop policy if exists "Allow public events read" on public.events;
drop policy if exists "Allow public sales inserts" on public.sales;
drop policy if exists "Allow public sales select" on public.sales;
drop policy if exists "Allow public sale item inserts" on public.sale_items;
drop policy if exists "Allow public sale item select" on public.sale_items;
drop policy if exists "Allow public sale item updates" on public.sale_items;
drop policy if exists "Allow public expenses inserts" on public.expenses;
drop policy if exists "Allow public expenses select" on public.expenses;
drop policy if exists "Allow public cash cuts inserts" on public.cash_cuts;
drop policy if exists "Allow public cash cuts select" on public.cash_cuts;
drop policy if exists "Allow public purchase lots inserts" on public.purchase_lots;
drop policy if exists "Allow public purchase lots select" on public.purchase_lots;
drop policy if exists "Allow public purchase lot items inserts" on public.purchase_lot_items;
drop policy if exists "Allow public purchase lot items select" on public.purchase_lot_items;
drop policy if exists "Allow public product codes inserts" on public.product_codes;
drop policy if exists "Allow public product codes select" on public.product_codes;
drop policy if exists "Allow public product codes updates" on public.product_codes;

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

create policy "Allow public sale item updates"
  on public.sale_items
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "Allow public expenses inserts"
  on public.expenses
  for insert
  to anon, authenticated
  with check (true);

create policy "Allow public expenses select"
  on public.expenses
  for select
  to anon, authenticated
  using (true);

create policy "Allow public cash cuts inserts"
  on public.cash_cuts
  for insert
  to anon, authenticated
  with check (true);

create policy "Allow public cash cuts select"
  on public.cash_cuts
  for select
  to anon, authenticated
  using (true);

create policy "Allow public purchase lots inserts"
  on public.purchase_lots
  for insert
  to anon, authenticated
  with check (true);

create policy "Allow public purchase lots select"
  on public.purchase_lots
  for select
  to anon, authenticated
  using (true);

create policy "Allow public purchase lot items inserts"
  on public.purchase_lot_items
  for insert
  to anon, authenticated
  with check (true);

create policy "Allow public purchase lot items select"
  on public.purchase_lot_items
  for select
  to anon, authenticated
  using (true);

create policy "Allow public product codes inserts"
  on public.product_codes
  for insert
  to anon, authenticated
  with check (true);

create policy "Allow public product codes select"
  on public.product_codes
  for select
  to anon, authenticated
  using (true);

create policy "Allow public product codes updates"
  on public.product_codes
  for update
  to anon, authenticated
  using (true)
  with check (true);

grant select on public.cities to anon, authenticated;
grant select on public.events to anon, authenticated;
grant select, insert on public.sales to anon, authenticated;
grant select, insert, update on public.sale_items to anon, authenticated;
grant select, insert on public.expenses to anon, authenticated;
grant select, insert on public.cash_cuts to anon, authenticated;
grant select, insert on public.purchase_lots to anon, authenticated;
grant select, insert on public.purchase_lot_items to anon, authenticated;
grant select, insert, update on public.product_codes to anon, authenticated;
