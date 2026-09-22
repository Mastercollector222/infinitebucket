-- Infinite Bucket Shop — per-item hold gates + product descriptions.
-- Run AFTER shop.sql + shop_cart.sql. Idempotent — safe to re-run.
--
-- Browsing is no longer gated: every visitor sees every active product.
-- shop_products.min_infinity_tokens is the per-item hold requirement
-- (human token units, e.g. 1000000 = 1M INFINITY). 0 = any connected
-- wallet can buy.

alter table public.shop_products
  add column if not exists description  text,
  add column if not exists min_infinity_tokens bigint not null default 0;

-- Example gates from the spec.
update public.shop_products
  set min_infinity_tokens = 1000000
  where title ilike 'copper%' and min_infinity_tokens = 0;

update public.shop_products
  set min_infinity_tokens = 5000000
  where title ilike 'silver%' and min_infinity_tokens = 0;
