-- Drop (/play) career scores. Idempotent.
-- Anon can do NOTHING — no select, insert, update, or delete. All access is
-- through /api/play/* with the service role after a signature + live
-- balance check.

create table if not exists public.drop_scores (
  wallet       text primary key,
  wins         int not null default 0,
  games_played int not null default 0,
  plays_today  int not null default 0,
  plays_day    date not null default (timezone('utc', now()))::date,
  updated_at   timestamptz not null default now()
);

alter table public.drop_scores enable row level security;
revoke all on table public.drop_scores from anon, authenticated;
grant all on table public.drop_scores to service_role;

-- Atomic match-start: resets the daily counter when the UTC day rolls,
-- then enforces the cap. Returns allowed + remaining + current wins.
create or replace function public.drop_start(p_wallet text, p_cap int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
  today date := (timezone('utc', now()))::date;
begin
  insert into public.drop_scores (wallet) values (lower(p_wallet))
    on conflict (wallet) do nothing;
  update public.drop_scores
     set plays_today = 0, plays_day = today
   where wallet = lower(p_wallet) and plays_day <> today;
  select plays_today, wins, games_played into r
    from public.drop_scores where wallet = lower(p_wallet);
  if r.plays_today >= p_cap then
    return jsonb_build_object(
      'allowed', false, 'remaining', 0,
      'wins', r.wins, 'games_played', r.games_played
    );
  end if;
  update public.drop_scores
     set plays_today = plays_today + 1,
         games_played = games_played + 1,
         updated_at = now()
   where wallet = lower(p_wallet);
  return jsonb_build_object(
    'allowed', true, 'remaining', p_cap - r.plays_today - 1,
    'wins', r.wins, 'games_played', r.games_played + 1
  );
end; $$;

-- Atomic win increment — wins can never exceed recorded games_played, so a
-- replayed result signature can't inflate the career score.
create or replace function public.drop_win(p_wallet text)
returns int language plpgsql security definer set search_path = public as $$
declare
  new_wins int;
begin
  update public.drop_scores
     set wins = wins + 1, updated_at = now()
   where wallet = lower(p_wallet) and games_played > wins
  returning wins into new_wins;
  return new_wins; -- null when no un-scored match exists
end; $$;

revoke all on function public.drop_start(text, int) from public, anon, authenticated;
revoke all on function public.drop_win(text) from public, anon, authenticated;
grant execute on function public.drop_start(text, int) to service_role;
grant execute on function public.drop_win(text) to service_role;
