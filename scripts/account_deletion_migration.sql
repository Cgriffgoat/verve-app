-- Run in Supabase Dashboard → SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/gvdedjhbdmxbervbfqiy/sql/new

-- The app's anon key can never delete an auth user directly (that requires the
-- service-role key, which must never ship in a mobile app). Instead: the app
-- wipes the user's own content, then logs a request here for the developer to
-- finish by deleting the auth user from the Supabase dashboard.
--
-- Not FK'd to auth.users on purpose — this row should survive the eventual
-- auth.users deletion as an audit record of what was requested and when.
create table if not exists public.account_deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  email        text,
  requested_at timestamptz not null default now()
);

alter table public.account_deletion_requests enable row level security;

create policy account_deletion_requests_insert_own on public.account_deletion_requests
  for insert with check (auth.uid() = user_id);
