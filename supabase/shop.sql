-- Infinite Bucket Shop — schema + RLS + seed data.
-- Run in the Supabase SQL editor for the existing project.
--
-- Access model (there is no Supabase Auth / JWT in this app):
--   shop_tiers / shop_products / shop_settings → public read via anon key.
--   shop_orders and all writes → service role only, mediated by Next.js API
--   routes that verify a wallet signature (loginMessage proof) before writing.
--   With the anon key there is no auth context, so RLS cannot express
--   "own wallet" — denying anon writes and verifying signatures server-side
--   is the strict equivalent of "insert own wallet / select own wallet".

create table if not exists public.shop_settings (
  key   text primary key,
  value text not null
);

create table if not exists public.shop_tiers (
  id         bigint generated always as identity primary key,
  min_tokens numeric not null,          -- INFINITY balance (token units) to qualify
  percent    int    not null check (percent between 0 and 100),
  label      text   not null default '',
  sort       int    not null default 0
);

create table if not exists public.shop_products (
  id         bigint generated always as identity primary key,
  title      text    not null,
  blurb      text    not null default '',
  image_url  text,
  price_usdg numeric not null check (price_usdg >= 0),
  stock      int     not null default 0,
  active     bool    not null default false,
  sort       int     not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_orders (
  id               bigint generated always as identity primary key,
  wallet           text    not null,          -- lowercase buyer address
  product_id       bigint  not null references public.shop_products(id),
  qty              int     not null check (qty > 0),
  price_usdg       numeric not null,          -- unit list price at order time
  discount_pct     int     not null default 0,
  usdg_due         numeric not null,          -- qty * price * (1 - pct/100)
  infinity_raw_due text    not null,          -- exact wei-scale amount to send
  status           text    not null default 'awaiting_tx'
                   check (status in ('awaiting_tx','paid_pending_ship','shipped','cancelled')),
  tx_hash          text,
  tracking_note    text,
  created_at       timestamptz not null default now(),
  paid_at          timestamptz,
  shipped_at       timestamptz
);

-- A payment tx can only be attached to one order.
create unique index if not exists shop_orders_tx_hash_key
  on public.shop_orders (tx_hash) where tx_hash is not null;

create index if not exists shop_orders_wallet_idx on public.shop_orders (wallet);
create index if not exists shop_orders_status_idx on public.shop_orders (status);

alter table public.shop_settings enable row level security;
alter table public.shop_tiers    enable row level security;
alter table public.shop_products enable row level security;
alter table public.shop_orders   enable row level security;

-- Public read for catalog / tiers / settings.
drop policy if exists shop_settings_read on public.shop_settings;
create policy shop_settings_read on public.shop_settings for select using (true);

drop policy if exists shop_tiers_read on public.shop_tiers;
create policy shop_tiers_read on public.shop_tiers for select using (true);

drop policy if exists shop_products_read on public.shop_products;
create policy shop_products_read on public.shop_products for select using (true);

-- No anon insert/update/delete policies on any shop table, and no anon
-- select on shop_orders: writes + order reads go through the signed API.

-- Seed.
insert into public.shop_settings (key, value) values
  ('shop_min_tokens', '1000000')
on conflict (key) do nothing;

insert into public.shop_tiers (min_tokens, percent, label, sort) values
  (1000000,  0,  'Holder',   1),
  (5000000,  5,  'Whale',    2),
  (10000000, 10, 'Big Bucket', 3),
  (25000000, 20, 'Overflowing', 4)
on conflict do nothing;

insert into public.shop_products (title, blurb, image_url, price_usdg, stock, active, sort) values
  ('Copper round', 'Solid copper INFINITY round. Physical merch — ships to the address you give the creator.', null, 25, 0, false, 1),
  ('Silver round', '1 oz silver INFINITY round. Physical merch — ships to the address you give the creator.', null, 75, 0, false, 2)
on conflict do nothing;
