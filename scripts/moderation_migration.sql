-- Run in Supabase Dashboard → SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/gvdedjhbdmxbervbfqiy/sql/new

-- Report + block mechanism for user-generated content (hangout chat, reviews,
-- community events) — required by App Store Review Guideline 1.2.

create table if not exists public.blocked_users (
  id                    uuid primary key default gen_random_uuid(),
  blocker_id            uuid not null references auth.users(id) on delete cascade,
  blocked_id            uuid not null references auth.users(id) on delete cascade,
  blocked_display_name  text,
  created_at            timestamptz not null default now(),
  unique (blocker_id, blocked_id)
);

alter table public.blocked_users enable row level security;

create policy "blocked_users_select_own" on public.blocked_users
  for select using (auth.uid() = blocker_id);
create policy "blocked_users_insert_own" on public.blocked_users
  for insert with check (auth.uid() = blocker_id);
create policy "blocked_users_delete_own" on public.blocked_users
  for delete using (auth.uid() = blocker_id);

create table if not exists public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references auth.users(id) on delete cascade,
  content_type     text not null check (content_type in ('hangout_message', 'review', 'community_event')),
  content_id       text not null,
  reported_user_id uuid references auth.users(id) on delete set null,
  reason           text not null,
  note             text,
  status           text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at       timestamptz not null default now()
);

alter table public.reports enable row level security;

-- Reporters can file reports but cannot read the queue back — reports are
-- triaged by the developer via the Supabase dashboard (service role bypasses RLS).
create policy "reports_insert_own" on public.reports
  for insert with check (auth.uid() = reporter_id);
