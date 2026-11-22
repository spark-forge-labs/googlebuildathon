-- India GP leaderboard for the BeyondGravity Supabase project.
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query → paste → Run).
-- Keeps only the fastest 10 race times per city; anyone can read the board and submit a time,
-- nobody can edit or delete rows from the browser.

create table if not exists public.race_leaderboard (
  id              bigint generated always as identity primary key,
  player_name     text        not null check (char_length(btrim(player_name)) between 1 and 20),
  city            text        not null check (city in (
                    'hyderabad','bangalore','mumbai','kolkata','delhi','chennai','pondicherry',
                    'vijayawada','vizag','warangal','kochi','goa','pune','ahmedabad','srinagar')),
  total_ms        integer     not null check (total_ms between 8000 and 900000),
  best_lap_ms     integer              check (best_lap_ms is null or best_lap_ms between 2000 and 300000),
  car             text                 check (car is null or char_length(car) <= 40),
  finish_position smallint             check (finish_position is null or finish_position between 1 and 6),
  created_at      timestamptz not null default now()
);

-- Serves "fastest 10 for this city" straight from the index (filter + order + limit)
create index if not exists race_leaderboard_city_time_idx
  on public.race_leaderboard (city, total_ms, created_at);

-- Row Level Security: public read, public insert, no update/delete
alter table public.race_leaderboard enable row level security;

drop policy if exists "leaderboard is readable by everyone" on public.race_leaderboard;
create policy "leaderboard is readable by everyone"
  on public.race_leaderboard for select
  to anon, authenticated
  using (true);

drop policy if exists "anyone can submit a race time" on public.race_leaderboard;
create policy "anyone can submit a race time"
  on public.race_leaderboard for insert
  to anon, authenticated
  with check (true); -- value limits are enforced by the CHECK constraints above

-- Least privilege: read everything, insert only the score columns (not id / created_at)
revoke all on public.race_leaderboard from anon, authenticated;
grant select on public.race_leaderboard to anon, authenticated;
grant insert (player_name, city, total_ms, best_lap_ms, car, finish_position)
  on public.race_leaderboard to anon, authenticated;

-- Trim to the top 10 per city after every insert.
-- Lives in a private schema (not exposed through the API), fixed search_path.
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
