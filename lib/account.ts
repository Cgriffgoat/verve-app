import { supabase } from './supabase';

// Best-effort cleanup of a user's own content across every table the app writes
// to, plus their uploaded photos. Some rows may already cascade-delete once the
// auth user itself is removed (tables created with `on delete cascade` FKs to
// auth.users) — this covers what the client can reach directly via RLS.
export async function deleteAllUserContent(userId: string): Promise<void> {
  const { data: boards } = await supabase.from('trip_boards').select('id').eq('user_id', userId);
  const boardIds = (boards ?? []).map(b => b.id as string);
  if (boardIds.length > 0) {
    await supabase.from('trip_board_items').delete().in('board_id', boardIds);
  }

  await Promise.allSettled([
    supabase.from('trip_boards').delete().eq('user_id', userId),
    supabase.from('reviews').delete().eq('user_id', userId),
    supabase.from('saved_items').delete().eq('user_id', userId),
    supabase.from('hangout_votes').delete().eq('user_id', userId),
    supabase.from('hangout_participants').delete().eq('user_id', userId),
    supabase.from('hangout_messages').delete().eq('user_id', userId),
    supabase.from('community_events').delete().eq('creator_id', userId),
    supabase.from('blocked_users').delete().eq('blocker_id', userId),
  ]);

  await Promise.allSettled([
    supabase.storage.from('review-photos').list(userId).then(({ data }) =>
      data?.length
        ? supabase.storage.from('review-photos').remove(data.map(f => `${userId}/${f.name}`))
        : null,
    ),
    supabase.storage.from('review-photos').list(`events/${userId}`).then(({ data }) =>
      data?.length
        ? supabase.storage.from('review-photos').remove(data.map(f => `events/${userId}/${f.name}`))
        : null,
    ),
  ]);
}

export async function requestAccountDeletion(userId: string, email: string | null): Promise<void> {
  const { error } = await supabase
    .from('account_deletion_requests')
    .insert({ user_id: userId, email });
  if (error) throw error;
}
