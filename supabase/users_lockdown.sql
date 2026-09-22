-- Infinite Bucket — public.users lockdown + shop stock/refund hardening.
-- Run AFTER shop.sql + shop_cart.sql (+ later shop migrations). Idempotent.
--
-- 1) Anon can no longer write public.users. The old
--    users_insert/users_update policies used `true`, which let ANY holder
--    of the public anon key rewrite ANY wallet's profile. All profile
--    writes now go through signature-verified API routes (service role).
--    Public SELECT stays — profile fields are public data by design.

revoke insert, update on table public.users from anon, authenticated;
drop policy if exists users_insert on public.users;
drop policy if exists users_update on public.users;
-- users_select_public stays as-is (read-only).

-- 2) Atomic stock decrement, called at payment verification. Returns true
--    only when the row existed with enough stock — Postgres serializes the
--    row update, so two concurrent payments can't oversell the last unit.
create or replace function public.decrement_stock(pid bigint, q int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shop_products
     set stock = stock - q
   where id = pid and stock >= q;
  return found;
end;
$$;

revoke all on function public.decrement_stock(bigint, int) from public, anon, authenticated;
grant execute on function public.decrement_stock(bigint, int) to service_role;

-- 3) needs_refund: payment verified on-chain but a line item was out of
--    stock — money received, order unshippable, refund owed.
alter table public.shop_orders drop constraint if exists shop_orders_status_check;
alter table public.shop_orders add constraint shop_orders_status_check
  check (status in (
    'awaiting_payment','paid_need_address','paid_pending_ship',
    'needs_refund','shipped','cancelled'
  ));
