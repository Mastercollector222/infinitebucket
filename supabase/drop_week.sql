-- Drop weekly leaderboard. Idempotent — safe to run on top of play.sql.
-- Anon can do NOTHING; boards read through /api/drop/board, writes only
-- through the service_role RPCs called by the signed /api/play routes.

create table if not exists public.drop_week_scores (
  week_id text not null,
  wallet  text not null,
  wins    int not null default 0,
  games   int not null default 0,
  primary key (week_id, wallet)
);

create table if not exists public.drop_week_meta (
  week_id    text primary key,
  prize_usdg numeric not null default 10,
  payout_tx  text,
  closed     boolean not null default false
);

alter table public.drop_week_scores enable row level security;
alter table public.drop_week_meta enable row level security;
revoke all on table public.drop_week_scores from anon, authenticated;
revoke all on table public.drop_week_meta from anon, authenticated;
grant all on table public.drop_week_scores to service_role;
grant all on table public.drop_week_meta to service_role;

-- ISO week id anchored to UTC Monday, e.g. '2026-40'.
create or replace function public.drop_week_id()
returns text language sql stable as $$
  select to_char(date_trunc('week', now() at time zone 'utc'), 'IYYY-IW')
$$;
revoke all on function public.drop_week_id() from public, anon, authenticated;
grant execute on function public.drop_week_id() to service_role;

-- Match start: cap accounting (unchanged) + weekly games counter.
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
  insert into public.drop_week_scores (week_id, wallet, games)
    values (public.drop_week_id(), lower(p_wallet), 1)
    on conflict (week_id, wallet)
    do update set games = public.drop_week_scores.games + 1;
  return jsonb_build_object(
    'allowed', true, 'remaining', p_cap - r.plays_today - 1,
    'wins', r.wins, 'games_played', r.games_played + 1
  );
end; $$;

-- Win: career + weekly wins, only while an un-scored match exists.
create or replace function public.drop_win(p_wallet text)
returns int language plpgsql security definer set search_path = public as $$
declare
  new_wins int;
begin
  update public.drop_scores
     set wins = wins + 1, updated_at = now()
   where wallet = lower(p_wallet) and games_played > wins
  returning wins into new_wins;
  if new_wins is not null then
    insert into public.drop_week_scores (week_id, wallet, wins)
      values (public.drop_week_id(), lower(p_wallet), 1)
      on conflict (week_id, wallet)
      do update set wins = public.drop_week_scores.wins + 1;
  end if;
  return new_wins;
end; $$;

revoke all on function public.drop_start(text, int) from public, anon, authenticated;
revoke all on function public.drop_win(text) from public, anon, authenticated;
grant execute on function public.drop_start(text, int) to service_role;
grant execute on function public.drop_win(text) to service_role;
