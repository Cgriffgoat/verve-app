-- Run in Supabase Dashboard → SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/gvdedjhbdmxbervbfqiy/sql/new

-- Separates "Google's rating" from "Vervi's community score" — right now the
-- score badge always shows a Google-derived number even when nobody has
-- actually reviewed a place on Vervi yet, which makes everything look
-- similarly (unremarkably) scored. This adds a real Vervi score computed
-- from actual reviews, kept in sync via trigger, plus the raw Google rating
-- for reference. The existing `score` column is left untouched — it's still
-- used for sorting/ranking queries elsewhere and shouldn't change behavior.

alter table public.activities
  add column if not exists google_rating numeric,
  add column if not exists vervi_avg_score numeric,
  add column if not exists vervi_review_count integer not null default 0;

create or replace function public.refresh_activity_review_stats()
returns trigger as $$
declare
  target_activity_id uuid;
begin
  target_activity_id := coalesce(new.activity_id, old.activity_id);
  update public.activities a
  set
    vervi_review_count = sub.cnt,
    vervi_avg_score = sub.avg_score
  from (
    select count(*) as cnt, avg(score) as avg_score
    from public.reviews
    where activity_id = target_activity_id
  ) sub
  where a.id = target_activity_id;
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

drop trigger if exists trg_refresh_activity_review_stats on public.reviews;
create trigger trg_refresh_activity_review_stats
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_activity_review_stats();
