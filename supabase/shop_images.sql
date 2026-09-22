-- Shop product galleries — images text[] replaces the single image_url.
-- Idempotent. image_url is kept in sync (images[0]) by the admin API for
-- legacy readers; images is canonical.

alter table public.shop_products
  add column if not exists images text[] not null default '{}';

-- Backfill: existing image_url becomes the first gallery image.
update public.shop_products
   set images = array[image_url]
 where image_url is not null
   and image_url <> ''
   and images = '{}';
