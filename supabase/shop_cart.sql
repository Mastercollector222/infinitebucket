-- Infinite Bucket Shop — cart + pay-then-ship migration.
-- Run AFTER shop.sql. Idempotent — safe to re-run.
--
-- Changes:
--   shop_orders       → multi-item orders (items live in shop_order_items),
--                       new status enum, shipping columns.
--   shop_order_items  → line items (product snapshot price + qty).
--   shop_shipments    → PII, one row per order. No public access at all:
--                       reads/writes only via /api/shop/shipment (buyer,
--                       signature-checked) and /api/admin/shop (admin).
--                       Fields are AES-256-GCM ciphertext when
--                       SHIPPING_ENCRYPTION_KEY is set (enc=true), else
--                       plaintext visible only to the service role.

create table if not exists public.shop_order_items (
  id         bigint generated always as identity primary key,
  order_id   bigint  not null references public.shop_orders(id) on delete cascade,
  product_id bigint  not null references public.shop_products(id),
  qty        int     not null check (qty > 0),
  price_usdg numeric not null          -- unit list price snapshot
);
create index if not exists shop_order_items_order_idx on public.shop_order_items (order_id);

create table if not exists public.shop_shipments (
  order_id       bigint primary key references public.shop_orders(id) on delete cascade,
  recipient_name text not null default '',
  line1          text not null default '',
  line2          text not null default '',
  city           text not null default '',
  region         text not null default '',
  postal         text not null default '',
  country        text not null default '',
  phone          text not null default '',
  enc            bool not null default false,  -- true = AES-256-GCM ciphertext fields
  created_at     timestamptz not null default now()
);

-- Orders gain shipping + totals columns; single-item columns go nullable
-- (kept only for any rows created before this migration).
alter table public.shop_orders
  add column if not exists shipping_usdg numeric not null default 0,
  add column if not exists total_usdg    numeric not null default 0,
  alter column product_id drop not null,
  alter column qty        drop not null,
  alter column price_usdg drop not null;

-- New status enum: awaiting_payment | paid_need_address | paid_pending_ship
-- | shipped | cancelled. Existing rows move off the old value first.
alter table public.shop_orders drop constraint if exists shop_orders_status_check;
update public.shop_orders set status = 'awaiting_payment' where status = 'awaiting_tx';
alter table public.shop_orders add constraint shop_orders_status_check
  check (status in ('awaiting_payment','paid_need_address','paid_pending_ship','shipped','cancelled'));

alter table public.shop_order_items enable row level security;
alter table public.shop_shipments   enable row level security;

-- No anon policies on either table — order items and PII are only ever
-- read/written by the signature-verified API with the service role.

grant all on table public.shop_order_items, public.shop_shipments to service_role;
grant usage, select on all sequences in schema public to service_role;
