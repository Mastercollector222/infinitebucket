-- game_events: timed per-game events (e.g. a 7-day Match race). The row
-- stores the prize, deadline, frozen winner, and payout tx. Public read;
-- writes service-role only via the signed API paths.

create table if not exists public.game_events (
  id            text primary key,
  game          text not null,
  kind          text not null default 'race', -- 'race' = highest max_level at ends_at
  ends_at       timestamptz not null,
  prize_usdg    numeric not null default 10,
  winner_wallet text,
  prize_level   int,
  payout_tx     text,
  closed        boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.game_events enable row level security;
revoke all on table public.game_events from anon, authenticated;
grant select on table public.game_events to anon, authenticated;
grant all on table public.game_events to service_role;

create policy game_events_read on public.game_events
  for select to anon, authenticated
  using (true);

-- Atomic close: records the winner the API computed (first >=5M INFINITY
-- wallet on the board at close time) exactly once — a second call matches
-- no row and returns null, so the freeze can't be overwritten.
create or replace function public.game_event_close(
  p_id     text,
  p_winner text,
  p_level  int
)
returns public.game_events
language plpgsql security definer set search_path = public as $$
declare
  r public.game_events;
begin
  update public.game_events
     set winner_wallet = lower(p_winner),
         prize_level   = p_level,
         closed        = true
   where id = p_id and closed = false
  returning * into r;
  return r;
end; $$;

revoke all on function public.game_event_close(text, text, int) from public;
revoke execute on function public.game_event_close(text, text, int)
  from anon, authenticated;
grant execute on function public.game_event_close(text, text, int)
  to service_role;

-- This event: 7-day Match race ending Sun 18 Oct 2026 00:00 UTC — the end
-- of the 7th UTC day from launch (Sat 10 Oct). Prize: 10 USDG to the
-- highest max_level held by a >=5M-INFINITY wallet at close.
insert into public.game_events
  (id, game, kind, ends_at, prize_usdg)
values
  ('match-2026-10-18', 'match', 'race', '2026-10-18T00:00:00Z', 10)
on conflict (id) do nothing;
