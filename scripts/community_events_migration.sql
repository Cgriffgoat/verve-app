-- Run this in Supabase Dashboard → SQL Editor
-- Dashboard URL: https://supabase.com/dashboard/project/gvdedjhbdmxbervbfqiy/sql/new

create table if not exists public.community_events (
  id                   uuid        primary key default gen_random_uuid(),
  creator_id           uuid        not null references auth.users(id) on delete cascade,
  creator_display_name text,
  title                text        not null,
  description          text,
  category             text        not null default 'Events',
  latitude             float8      not null,
  longitude            float8      not null,
  location_name        text        not null,
  event_date           date        not null,
  event_time           text,
  photo_url            text,
  created_at           timestamptz not null default now(),
  status               text        not null default 'active'
);

alter table public.community_events enable row level security;

create policy "community_events_read"
  on public.community_events for select
  using (status = 'active');

create policy "community_events_insert"
  on public.community_events for insert
  with check (auth.uid() = creator_id);

create policy "community_events_update_own"
  on public.community_events for update
  using (auth.uid() = creator_id);

create index if not exists community_events_geo_date_idx
  on public.community_events (latitude, longitude, event_date, status);
