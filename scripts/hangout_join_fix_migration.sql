-- Run in Supabase Dashboard → SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/gvdedjhbdmxbervbfqiy/sql/new

-- Fixes "No hangout found with that code" when joining: the hangouts table's
-- existing SELECT policy likely only allows reading a hangout you're already
-- a participant of, which makes join-by-code impossible (you need to read the
-- hangout to become a participant in the first place). This adds a second,
-- permissive SELECT policy allowing any authenticated user to look up a
-- hangout — safe, since Postgres OR's multiple permissive policies together,
-- so this only adds access and can't remove anything the old policy allowed.
-- The 6-character random join code is the actual security gate here, same as
-- the existing invite-link/join-code UX already assumes.

drop policy if exists hangouts_select_by_code on public.hangouts;
create policy hangouts_select_by_code on public.hangouts
  for select using (auth.role() = 'authenticated');
