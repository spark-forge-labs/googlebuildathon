-- India GP leaderboard for the BeyondGravity Supabase project.
-- Run in the Supabase SQL editor (Dashboard → SQL Editor → New query → paste → Run).
-- Safe to re-run; upgrades the first version (which allowed direct inserts from browsers).
--
-- Model: browsers can READ the top 10 and ghost replays. Only the `submit-race` Edge Function
-- (service role) can WRITE, after validating the run's checkpoint + telemetry trail.

-- ---------- Leaderboard: fastest 10 per city ----------
create table if not exists public.race_leaderboard (
  id              bigint generated always as identity primary key,
  player_name     text        not null check (char_length(btrim(player_name)) between 1 and 20),
  city            text        not null,
  total_ms        integer     not null check (total_ms between 8000 and 900000),
  best_lap_ms     integer              check (best_lap_ms is null or best_lap_ms between 2000 and 300000),
  car             text                 check (car is null or char_length(car) <= 40),
  finish_position smallint             check (finish_position is null or finish_position between 1 and 6),
  created_at      timestamptz not null default now()
);

-- City list (re-created so new circuits can be added by re-running this script)
alter table public.race_leaderboard drop constraint if exists race_leaderboard_city_check;
alter table public.race_leaderboard add constraint race_leaderboard_city_check check (city in (
  'hyderabad','bangalore','mumbai','kolkata','delhi','chennai','pondicherry','vijayawada','vizag',
  'warangal','kochi','goa','pune','ahmedabad','srinagar',
  'london','paris','newyork','mexicocity','sanfrancisco','dallas','toronto','sydney','shanghai','hongkong','bangkok','lasvegas'));

create index if not exists race_leaderboard_city_time_idx
  on public.race_leaderboard (city, total_ms, created_at);

alter table public.race_leaderboard enable row level security;

drop policy if exists "leaderboard is readable by everyone" on public.race_leaderboard;
create policy "leaderboard is readable by everyone"
  on public.race_leaderboard for select
  to anon, authenticated
  using (true);

-- v1 allowed browsers to insert directly; v2 removes that (writes go through the Edge Function)
drop policy if exists "anyone can submit a race time" on public.race_leaderboard;
revoke all on public.race_leaderboard from anon, authenticated;
grant select on public.race_leaderboard to anon, authenticated;

-- ---------- Ghost replays (only for runs that are on the board) ----------
create table if not exists public.race_replays (
  id             bigint generated always as identity primary key,
  leaderboard_id bigint      not null unique references public.race_leaderboard (id) on delete cascade,
  city           text        not null,
  player_name    text        not null,
  car            text,
  total_ms       integer     not null,
  checkpoints    jsonb       not null,
  samples        jsonb       not null,
  created_at     timestamptz not null default now()
);
create index if not exists race_replays_city_time_idx on public.race_replays (city, total_ms);

alter table public.race_replays enable row level security;
drop policy if exists "replays are readable by everyone" on public.race_replays;
create policy "replays are readable by everyone"
  on public.race_replays for select
  to anon, authenticated
  using (true);
revoke all on public.race_replays from anon, authenticated;
grant select on public.race_replays to anon, authenticated;

-- ---------- Submission log for rate limiting (service role only) ----------
create table if not exists public.race_submit_log (
  id         bigint generated always as identity primary key,
  ip_hash    text        not null,
  accepted   boolean     not null,
  reason     text,
  created_at timestamptz not null default now()
);
create index if not exists race_submit_log_ip_time_idx on public.race_submit_log (ip_hash, created_at);
alter table public.race_submit_log enable row level security; -- no policies: invisible to browsers
revoke all on public.race_submit_log from anon, authenticated;

-- ---------- Keep only the top 10 per city after every insert ----------
create schema if not exists private;

create or replace function private.race_leaderboard_keep_top10()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.race_leaderboard r
  where r.city = new.city
    and r.id not in (
      select k.id
      from public.race_leaderboard k
      where k.city = new.city
      order by k.total_ms asc, k.created_at asc
      limit 10
    );
  return null;
end;
$$;

revoke execute on function private.race_leaderboard_keep_top10() from public, anon, authenticated;

drop trigger if exists race_leaderboard_keep_top10 on public.race_leaderboard;
create trigger race_leaderboard_keep_top10
  after insert on public.race_leaderboard
  for each row execute function private.race_leaderboard_keep_top10();
