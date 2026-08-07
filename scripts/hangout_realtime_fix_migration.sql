-- Run in Supabase Dashboard → SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/gvdedjhbdmxbervbfqiy/sql/new

-- The hangout screen subscribes to postgres_changes on hangouts, hangout_votes,
-- and hangout_participants, but those tables may never have been added to the
-- supabase_realtime publication (hangout_messages was, via its own migration,
-- but the other three were created directly in the dashboard and may have been
-- missed) — which would explain votes/participants not updating live for other
-- people in the hangout. ALTER PUBLICATION ... ADD TABLE errors if the table is
-- already in the publication, so this checks first.

do $$
declare
  t text;
begin
  foreach t in array array['hangouts', 'hangout_votes', 'hangout_participants'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
