import { supabase } from './supabase';
import type { Activity } from './types';

export type TripBoard = {
  id: string;
  user_id: string;
  name: string;
  location: string | null;
  created_at: string;
  item_count: number;
};

export async function fetchUserBoards(userId: string): Promise<TripBoard[]> {
  const { data: boards } = await supabase
    .from('trip_boards')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (!boards || boards.length === 0) return [];

  const { data: items } = await supabase
    .from('trip_board_items')
    .select('board_id')
    .in('board_id', boards.map(b => b.id));

  const countMap: Record<string, number> = {};
  (items ?? []).forEach(r => {
    countMap[r.board_id] = (countMap[r.board_id] ?? 0) + 1;
  });

  return boards.map(b => ({ ...b, item_count: countMap[b.id] ?? 0 }));
}

export async function createBoard(
  userId: string,
  name: string,
  location?: string,
): Promise<TripBoard> {
  const { data, error } = await supabase
    .from('trip_boards')
    .insert({ user_id: userId, name: name.trim(), location: location?.trim() || null })
    .select()
    .single();
  if (error) throw error;
  return { ...data, item_count: 0 };
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

export async function fetchBoardActivities(boardId: string): Promise<Activity[]> {
  const { data } = await supabase
    .from('trip_board_items')
    .select('added_at, activities(*)')
    .eq('board_id', boardId)
    .order('added_at', { ascending: false });

  return ((data ?? []) as any[])
    .filter(r => r.activities)
    .map(r => {
      const a = r.activities;
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
      };
    });
}

// Returns board IDs that contain this activity (RLS scopes to current user's boards)
export async function fetchBoardIdsForActivity(activityId: string): Promise<string[]> {
  const { data } = await supabase
    .from('trip_board_items')
    .select('board_id')
    .eq('activity_id', activityId);
  return (data ?? []).map(r => r.board_id);
}
