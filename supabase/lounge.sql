-- Holders Lounge — /lounge chat. Idempotent.
-- Reads happen only through /api/lounge/messages (service role + live
-- balance check); writes only through /api/lounge/send. The anon key can
-- do NOTHING here — no select, insert, update, or delete. Because anon
-- can't select, Supabase Realtime broadcast is not usable for this table
-- without opening reads to anyone holding the public key, which would
-- break the 5M-read gate — the client polls the API every 4s instead.

create table if not exists public.lounge_messages (
  id         uuid primary key default gen_random_uuid(),
  wallet     text not null,
  body       text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);

alter table public.lounge_messages enable row level security;
revoke all on table public.lounge_messages from anon, authenticated;
grant all on table public.lounge_messages to service_role;

create index if not exists lounge_messages_created_idx
  on public.lounge_messages (created_at desc);

-- Optional mute list: admin sets wallet + until; /api/lounge/send rejects
-- while now() < until.
create table if not exists public.lounge_mutes (
  wallet     text primary key,
  until      timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.lounge_mutes enable row level security;
revoke all on table public.lounge_mutes from anon, authenticated;
grant all on table public.lounge_mutes to service_role;
