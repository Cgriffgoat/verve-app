-- Run in Supabase Dashboard → SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/gvdedjhbdmxbervbfqiy/sql/new

-- Fixes "saving to a trip board spins forever": trip_board_items likely has no
-- (or an incorrect) INSERT/DELETE policy for the board's owner, so adding an
-- activity to your own board was silently denied by RLS. These are additive —
-- Postgres OR's multiple permissive policies together, so this can only add
-- access, never remove anything an existing policy already allowed.

drop policy if exists trip_board_items_insert_own on public.trip_board_items;
create policy trip_board_items_insert_own on public.trip_board_items
  for insert with check (
    exists (
      select 1 from public.trip_boards tb
      where tb.id = trip_board_items.board_id and tb.user_id = auth.uid()
    )
  );

drop policy if exists trip_board_items_select_own on public.trip_board_items;
create policy trip_board_items_select_own on public.trip_board_items
  for select using (
    exists (
      select 1 from public.trip_boards tb
      where tb.id = trip_board_items.board_id and tb.user_id = auth.uid()
    )
  );

drop policy if exists trip_board_items_delete_own on public.trip_board_items;
create policy trip_board_items_delete_own on public.trip_board_items
  for delete using (
    exists (
      select 1 from public.trip_boards tb
      where tb.id = trip_board_items.board_id and tb.user_id = auth.uid()
    )
  );
