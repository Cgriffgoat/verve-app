import { supabase } from './supabase';
import type { Activity } from './types';

export type ItineraryTemplate = 'minimal' | 'sunset' | 'night';

export type TripBoard = {
  id: string;
  user_id: string;
  name: string;
  location: string | null;
  join_code: string;
  itinerary_template: ItineraryTemplate;
  created_at: string;
  item_count: number;
};

export type ItineraryItem = {
  activity: Activity;
  scheduledDate: string | null; // 'YYYY-MM-DD'
  scheduledTime: string | null; // 'HH:MM' 24hr
  sortOrder: number;
};

export type BoardMember = {
  id: string;
  board_id: string;
  user_id: string;
  display_name: string | null;
  role: 'owner' | 'member';
  joined_at: string;
};

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Boards you own OR were invited into via code
export async function fetchUserBoards(userId: string): Promise<TripBoard[]> {
  const { data: memberRows } = await supabase
    .from('trip_board_members')
    .select('trip_boards(*)')
    .eq('user_id', userId);

  const boards = (memberRows ?? [])
    .map((r: any) => r.trip_boards as TripBoard | null)
    .filter((b): b is TripBoard => b != null);

  if (boards.length === 0) return [];

  const { data: items } = await supabase
    .from('trip_board_items')
    .select('board_id')
    .in('board_id', boards.map(b => b.id));

  const countMap: Record<string, number> = {};
  (items ?? []).forEach(r => {
    countMap[r.board_id] = (countMap[r.board_id] ?? 0) + 1;
  });

  const withCounts = boards.map(b => ({ ...b, item_count: countMap[b.id] ?? 0 }));
  withCounts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return withCounts;
}

export async function createBoard(
  userId: string,
  name: string,
  location?: string,
  displayName?: string,
): Promise<TripBoard> {
  let board: TripBoard | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('trip_boards')
      .insert({
        user_id: userId,
        name: name.trim(),
        location: location?.trim() || null,
        join_code: generateCode(),
      })
      .select()
      .single();

    if (error?.code === '23505') continue; // code collision — retry
    if (error) throw error;
    board = data as TripBoard;
    break;
  }

  if (!board) throw new Error('Failed to generate a unique code. Try again.');

  await supabase.from('trip_board_members').insert({
    board_id: board.id,
    user_id: userId,
    display_name: displayName ?? null,
    role: 'owner',
  });

  return { ...board, item_count: 0 };
}

export async function joinBoard(
  joinCode: string,
  userId: string,
  displayName: string,
): Promise<TripBoard> {
  const { data, error } = await supabase
    .from('trip_boards')
    .select('*')
    .eq('join_code', joinCode.toUpperCase().trim())
    .single();

  if (error || !data) throw new Error('No trip board found with that code.');

  await supabase.from('trip_board_members').upsert(
    { board_id: data.id, user_id: userId, display_name: displayName, role: 'member' },
    { onConflict: 'board_id,user_id', ignoreDuplicates: false },
  );

  return data as TripBoard;
}

export async function fetchBoardMembers(boardId: string): Promise<BoardMember[]> {
  const { data } = await supabase
    .from('trip_board_members')
    .select('*')
    .eq('board_id', boardId)
    .order('joined_at', { ascending: true });
  return (data ?? []) as BoardMember[];
}

export async function addToBoard(boardId: string, activityId: string): Promise<void> {
  const { error } = await supabase
    .from('trip_board_items')
    .upsert(
      { board_id: boardId, activity_id: activityId },
      { onConflict: 'board_id,activity_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function removeFromBoard(boardId: string, activityId: string): Promise<void> {
  await supabase
    .from('trip_board_items')
    .delete()
    .match({ board_id: boardId, activity_id: activityId });
}

function rowToActivity(a: any): Activity {
  return {
    id: String(a.id),
    title: a.title,
    subtitle: a.subtitle,
    category: a.category,
    score: a.score,
    imageUrl: a.photo_url,
    distance: a.distance,
    commitment: a.commitment,
    good_for: a.good_for ?? [],
    priceLevel: a.price_level ?? null,
    allowsDogs: a.allows_dogs ?? null,
    hasLiveMusic: a.has_live_music ?? null,
    googleRating: a.google_rating ?? null,
    verviScore: a.vervi_avg_score ?? null,
    verviReviewCount: a.vervi_review_count ?? 0,
  };
}

export async function fetchBoardActivities(boardId: string): Promise<Activity[]> {
  const { data } = await supabase
    .from('trip_board_items')
    .select('added_at, activities(*)')
    .eq('board_id', boardId)
    .order('added_at', { ascending: false });

  return ((data ?? []) as any[])
    .filter(r => r.activities)
    .map(r => rowToActivity(r.activities));
}

// Returns board IDs that contain this activity (RLS scopes to current user's boards)
export async function fetchBoardIdsForActivity(activityId: string): Promise<string[]> {
  const { data } = await supabase
    .from('trip_board_items')
    .select('board_id')
    .eq('activity_id', activityId);
  return (data ?? []).map(r => r.board_id);
}

// ── Itinerary ──────────────────────────────────────────────────────────────

export async function fetchItineraryItems(boardId: string): Promise<ItineraryItem[]> {
  const { data } = await supabase
    .from('trip_board_items')
    .select('activity_id, scheduled_date, scheduled_time, sort_order, activities(*)')
    .eq('board_id', boardId)
    .order('sort_order', { ascending: true });

  return ((data ?? []) as any[])
    .filter(r => r.activities)
    .map(r => ({
      activity: rowToActivity(r.activities),
      scheduledDate: r.scheduled_date,
      scheduledTime: r.scheduled_time,
      sortOrder: r.sort_order ?? 0,
    }));
}

export async function scheduleItem(
  boardId: string,
  activityId: string,
  date: string,
  time: string | null,
  sortOrder: number,
): Promise<void> {
  const { error } = await supabase
    .from('trip_board_items')
    .update({ scheduled_date: date, scheduled_time: time, sort_order: sortOrder })
    .match({ board_id: boardId, activity_id: activityId });
  if (error) throw error;
}

export async function unscheduleItem(boardId: string, activityId: string): Promise<void> {
  const { error } = await supabase
    .from('trip_board_items')
    .update({ scheduled_date: null, scheduled_time: null, sort_order: 0 })
    .match({ board_id: boardId, activity_id: activityId });
  if (error) throw error;
}

// Batch-updates sort_order for every item in a day, in the given order —
// used after a drag-to-reorder.
export async function reorderDay(
  boardId: string,
  activityIdsInOrder: string[],
): Promise<void> {
  await Promise.all(
    activityIdsInOrder.map((activityId, index) =>
      supabase
        .from('trip_board_items')
        .update({ sort_order: index })
        .match({ board_id: boardId, activity_id: activityId }),
    ),
  );
}

export async function updateBoardTemplate(
  boardId: string,
  template: ItineraryTemplate,
): Promise<void> {
  const { error } = await supabase
    .from('trip_boards')
    .update({ itinerary_template: template })
    .eq('id', boardId);
  if (error) throw error;
}
