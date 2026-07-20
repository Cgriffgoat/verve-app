-- Run in Supabase Dashboard → SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/gvdedjhbdmxbervbfqiy/sql/new

create table if not exists public.hangout_messages (
  id          uuid        primary key default gen_random_uuid(),
  hangout_id  uuid        not null references public.hangouts(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  display_name text       not null,
  content     text        not null check (char_length(content) > 0 and char_length(content) <= 1000),
  created_at  timestamptz not null default now()
);

-- Fixes an earlier version of this script that named the column "body";
-- the app code (lib/hangouts.ts) reads/writes "content".
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'hangout_messages' and column_name = 'body'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'hangout_messages' and column_name = 'content'
  ) then
    alter table public.hangout_messages rename column body to content;
  end if;
end $$;

alter table public.hangout_messages enable row level security;

-- Participants can read messages for their hangouts
create policy "hangout_messages_select"
  on public.hangout_messages for select
  using (
    exists (
      select 1 from public.hangout_participants hp
      where hp.hangout_id = hangout_messages.hangout_id
        and hp.user_id = auth.uid()
    )
  );

-- Participants can insert their own messages
create policy "hangout_messages_insert"
  on public.hangout_messages for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.hangout_participants hp
      where hp.hangout_id = hangout_messages.hangout_id
        and hp.user_id = auth.uid()
    )
  );

create index if not exists hangout_messages_hangout_id_created_at_idx
  on public.hangout_messages (hangout_id, created_at asc);

-- Enable Realtime on this table (run once per project)
alter publication supabase_realtime add table public.hangout_messages;
