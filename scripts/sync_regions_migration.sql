-- Run in Supabase Dashboard → SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/gvdedjhbdmxbervbfqiy/sql/new

-- Tracks the last time each rough geographic area was synced against Google
-- Places, so repeat app opens in the same area don't re-trigger a ~42-call
-- Places API burst every time. Shared across all users — whoever syncs an
-- area first benefits everyone else nearby for the cache window.
create table if not exists public.sync_regions (
  grid_key   text primary key,
  latitude   double precision not null,
  longitude  double precision not null,
  synced_at  timestamptz not null default now()
);

alter table public.sync_regions enable row level security;

-- No personal data here — any authenticated user can read/write the shared cache.
create policy "sync_regions_select_authenticated" on public.sync_regions
  for select using (auth.role() = 'authenticated');
create policy "sync_regions_upsert_authenticated" on public.sync_regions
  for insert with check (auth.role() = 'authenticated');
create policy "sync_regions_update_authenticated" on public.sync_regions
  for update using (auth.role() = 'authenticated');
