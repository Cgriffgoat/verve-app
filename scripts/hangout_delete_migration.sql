-- Run in Supabase Dashboard → SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/gvdedjhbdmxbervbfqiy/sql/new

-- Lets the creator delete a hangout, and cleans up its participants/votes/
-- messages via a trigger rather than relying on unknown existing FK cascade
-- behavior (hangouts/hangout_votes/hangout_participants were created directly
-- in the dashboard, so their FK definitions aren't something we control here).

drop policy if exists hangouts_delete_own on public.hangouts;
create policy hangouts_delete_own on public.hangouts
  for delete using (auth.uid() = creator_id);

create or replace function public.cleanup_hangout_children()
returns trigger as $$
begin
  delete from public.hangout_participants where hangout_id = old.id;
  delete from public.hangout_votes where hangout_id = old.id;
  delete from public.hangout_messages where hangout_id = old.id;
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_cleanup_hangout_children on public.hangouts;
create trigger trg_cleanup_hangout_children
  before delete on public.hangouts
  for each row execute function public.cleanup_hangout_children();
