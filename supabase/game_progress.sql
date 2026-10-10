-- game_progress: per-wallet best level per game (/play/match, future games).
-- Idempotent. Public read for leaderboards; writes only through
-- POST /api/game/progress — a signed progress-session proof verified
-- server-side, then applied with the service role. Wallet-only auth means
-- there is no Supabase session to check in RLS, so own-wallet enforcement
-- lives in the API signature; anon/authenticated get no write grant.

create table if not exists public.game_progress (
  wallet     text not null,
  game       text not null,
  max_level  int not null default 0 check (max_level >= 0 and max_level <= 100000),
  updated_at timestamptz not null default now(),
  primary key (wallet, game)
);

alter table public.game_progress enable row level security;
revoke all on table public.game_progress from anon, authenticated;
grant select on table public.game_progress to anon, authenticated;
grant all on table public.game_progress to service_role;

create policy game_progress_read on public.game_progress
  for select to anon, authenticated
  using (true);

create index if not exists game_progress_board_idx
  on public.game_progress (game, max_level desc);

-- Only-ever-raises upsert: max_level can go up, never down. updated_at moves
-- only when the level actually advances.
create or replace function public.game_progress_bump(
  p_wallet text,
  p_game   text,
  p_level  int
)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_max int;
begin
  insert into public.game_progress (wallet, game, max_level)
  values (lower(p_wallet), p_game, p_level)
  on conflict (wallet, game) do update
    set max_level  = greatest(game_progress.max_level, excluded.max_level),
        updated_at = case
          when excluded.max_level > game_progress.max_level then now()
          else game_progress.updated_at
        end
  returning max_level into v_max;
  return v_max;
end; $$;

revoke all on function public.game_progress_bump(text, text, int) from public;
revoke execute on function public.game_progress_bump(text, text, int)
  from anon, authenticated;
grant execute on function public.game_progress_bump(text, text, int)
  to service_role;
