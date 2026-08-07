-- Run in Supabase Dashboard → SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/gvdedjhbdmxbervbfqiy/sql/new

-- Adds collaborative trip boards (join by code, like hangouts) and fixes
-- "saving to a trip board spins forever" — trip_board_items likely had no
-- (or an incorrect) INSERT policy, so adding an activity to your own board
-- was silently denied by RLS.

alter table public.trip_boards
  add column if not exists join_code text unique;

create table if not exists public.trip_board_members (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references public.trip_boards(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text,
  role         text not null default 'member' check (role in ('owner', 'member')),
  joined_at    timestamptz not null default now(),
  unique (board_id, user_id)
);

alter table public.trip_board_members enable row level security;

drop policy if exists trip_board_members_select on public.trip_board_members;
create policy trip_board_members_select on public.trip_board_members
  for select using (
    exists (
      select 1 from public.trip_board_members m
      where m.board_id = trip_board_members.board_id and m.user_id = auth.uid()
    )
  );

drop policy if exists trip_board_members_insert_self on public.trip_board_members;
create policy trip_board_members_insert_self on public.trip_board_members
  for insert with check (auth.uid() = user_id);

-- trip_boards: members (not just the owner) can view the board
drop policy if exists trip_boards_select_member on public.trip_boards;
create policy trip_boards_select_member on public.trip_boards
  for select using (
    exists (
      select 1 from public.trip_board_members m
      where m.board_id = trip_boards.id and m.user_id = auth.uid()
    )
  );

-- Anyone with the join code can look up the board to join it (the code
-- itself is the security gate, same model as hangouts.hangouts_select_by_code)
drop policy if exists trip_boards_select_by_code on public.trip_boards;
create policy trip_boards_select_by_code on public.trip_boards
  for select using (auth.role() = 'authenticated');

-- trip_board_items: any member can view/add/remove, not just the owner
drop policy if exists trip_board_items_insert_own on public.trip_board_items;
create policy trip_board_items_insert_own on public.trip_board_items
  for insert with check (
    exists (
      select 1 from public.trip_board_members m
      where m.board_id = trip_board_items.board_id and m.user_id = auth.uid()
    )
  );

drop policy if exists trip_board_items_select_own on public.trip_board_items;
create policy trip_board_items_select_own on public.trip_board_items
  for select using (
    exists (
      select 1 from public.trip_board_members m
      where m.board_id = trip_board_items.board_id and m.user_id = auth.uid()
    )
  );

drop policy if exists trip_board_items_delete_own on public.trip_board_items;
create policy trip_board_items_delete_own on public.trip_board_items
  for delete using (
    exists (
      select 1 from public.trip_board_members m
      where m.board_id = trip_board_items.board_id and m.user_id = auth.uid()
    )
  );

-- Backfill: make every existing board owner a member row, and give existing
-- boards a join code, so nothing already created breaks under the new model.
insert into public.trip_board_members (board_id, user_id, role)
select id, user_id, 'owner' from public.trip_boards tb
where not exists (
  select 1 from public.trip_board_members m where m.board_id = tb.id and m.user_id = tb.user_id
)
on conflict (board_id, user_id) do nothing;

do $$
declare
  b record;
  new_code text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  for b in select id from public.trip_boards where join_code is null loop
    loop
      new_code := '';
      for i in 1..6 loop
        new_code := new_code || substr(chars, (floor(random() * length(chars)) + 1)::int, 1);
      end loop;
      exit when not exists (select 1 from public.trip_boards where join_code = new_code);
    end loop;
    update public.trip_boards set join_code = new_code where id = b.id;
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_board_items'
  ) then
    execute 'alter publication supabase_realtime add table public.trip_board_items';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_board_members'
  ) then
    execute 'alter publication supabase_realtime add table public.trip_board_members';
  end if;
end $$;
