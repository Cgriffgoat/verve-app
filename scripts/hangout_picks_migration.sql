-- Run in Supabase Dashboard → SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/gvdedjhbdmxbervbfqiy/sql/new

-- "Pick N activities" mode: a hangout can optionally set a target number of
-- activities the group wants to lock in (instead of the single "we're going
-- here" decision), and anyone can add/remove activities from the shared list
-- until it's full.

alter table public.hangouts
  add column if not exists target_activity_count integer;

create table if not exists public.hangout_picks (
  id          uuid primary key default gen_random_uuid(),
  hangout_id  uuid not null references public.hangouts(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  picked_by   uuid not null references auth.users(id) on delete cascade,
  picked_at   timestamptz not null default now(),
  unique (hangout_id, activity_id)
);

alter table public.hangout_picks enable row level security;

drop policy if exists hangout_picks_select on public.hangout_picks;
create policy hangout_picks_select on public.hangout_picks
  for select using (
    exists (
      select 1 from public.hangout_participants hp
      where hp.hangout_id = hangout_picks.hangout_id and hp.user_id = auth.uid()
    )
  );

drop policy if exists hangout_picks_insert on public.hangout_picks;
create policy hangout_picks_insert on public.hangout_picks
  for insert with check (
    auth.uid() = picked_by
    and exists (
      select 1 from public.hangout_participants hp
      where hp.hangout_id = hangout_picks.hangout_id and hp.user_id = auth.uid()
    )
  );

drop policy if exists hangout_picks_delete on public.hangout_picks;
create policy hangout_picks_delete on public.hangout_picks
  for delete using (
    exists (
      select 1 from public.hangout_participants hp
      where hp.hangout_id = hangout_picks.hangout_id and hp.user_id = auth.uid()
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hangout_picks'
  ) then
    execute 'alter publication supabase_realtime add table public.hangout_picks';
  end if;
end $$;
