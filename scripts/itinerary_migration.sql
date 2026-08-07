-- Run in Supabase Dashboard → SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/gvdedjhbdmxbervbfqiy/sql/new

-- Itinerary builder: schedules saved trip-board activities onto specific
-- days/times, ordered per day. Reuses trip_board_items rather than a new
-- table — an itinerary item IS a board item with schedule metadata attached.
-- Unscheduled items (scheduled_date is null) stay as regular saved places.

alter table public.trip_board_items
  add column if not exists scheduled_date date,
  add column if not exists scheduled_time text,
  add column if not exists sort_order integer not null default 0;

alter table public.trip_boards
  add column if not exists itinerary_template text not null default 'minimal';
