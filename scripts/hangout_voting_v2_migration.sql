-- Run in Supabase Dashboard → SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/gvdedjhbdmxbervbfqiy/sql/new

-- Adds price / dog-friendly / live-music as hangout voting dimensions, and the
-- underlying activity attributes those votes filter on.

alter table public.hangout_votes
  add column if not exists price        text,
  add column if not exists dog_friendly text,
  add column if not exists live_music   text;

alter table public.activities
  add column if not exists price_level    text,
  add column if not exists allows_dogs    boolean,
  add column if not exists has_live_music boolean;
