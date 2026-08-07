-- Run in Supabase Dashboard → SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/gvdedjhbdmxbervbfqiy/sql/new

-- Fixes "infinite recursion detected in policy for relation trip_board_members":
-- the trip_board_members_select policy queried trip_board_members from inside
-- its own policy, which re-triggers the same policy recursively. Same issue
-- cascaded into trip_boards and trip_board_items since their policies query
-- trip_board_members too. Fix: check membership through a SECURITY DEFINER
-- function, which runs with elevated privileges and bypasses RLS for its own
-- internal lookup — breaking the recursive cycle.

create or replace function public.is_trip_board_member(_board_id uuid, _user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.trip_board_members
    where board_id = _board_id and user_id = _user_id
  );
$$;

drop policy if exists trip_board_members_select on public.trip_board_members;
create policy trip_board_members_select on public.trip_board_members
  for select using (public.is_trip_board_member(board_id, auth.uid()));

drop policy if exists trip_boards_select_member on public.trip_boards;
create policy trip_boards_select_member on public.trip_boards
  for select using (public.is_trip_board_member(id, auth.uid()));

drop policy if exists trip_board_items_insert_own on public.trip_board_items;
create policy trip_board_items_insert_own on public.trip_board_items
  for insert with check (public.is_trip_board_member(board_id, auth.uid()));

drop policy if exists trip_board_items_select_own on public.trip_board_items;
create policy trip_board_items_select_own on public.trip_board_items
  for select using (public.is_trip_board_member(board_id, auth.uid()));

drop policy if exists trip_board_items_delete_own on public.trip_board_items;
create policy trip_board_items_delete_own on public.trip_board_items
  for delete using (public.is_trip_board_member(board_id, auth.uid()));
