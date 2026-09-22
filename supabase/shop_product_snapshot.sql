-- Infinite Bucket Shop — product delete hardening.
-- Run AFTER shop.sql + shop_cart.sql. Idempotent — safe to re-run.
--
-- Deleting a product used to fail with
--   "violates foreign key constraint shop_orders_product_id_fkey"
-- (and the same on shop_order_items) because order rows reference it.
-- Now each order line snapshots the product title, and both product_id
-- foreign keys become ON DELETE SET NULL — order history survives a
-- product delete forever, and delete always works.

alter table public.shop_order_items
  add column if not exists title text not null default '',
  alter column product_id drop not null;

-- Backfill titles for order lines created before this migration.
update public.shop_order_items i
  set title = p.title
  from public.shop_products p
  where i.product_id = p.id and i.title = '';

alter table public.shop_order_items
  drop constraint if exists shop_order_items_product_id_fkey,
  add constraint shop_order_items_product_id_fkey
    foreign key (product_id) references public.shop_products(id)
    on delete set null;

alter table public.shop_orders
  drop constraint if exists shop_orders_product_id_fkey,
  add constraint shop_orders_product_id_fkey
    foreign key (product_id) references public.shop_products(id)
    on delete set null;
