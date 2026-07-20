import { supabase } from './supabase';

export type ContentType = 'hangout_message' | 'review' | 'community_event';

export type BlockedUser = {
  id: string;
  blocked_id: string;
  blocked_display_name: string | null;
  created_at: string;
};

export const REPORT_REASONS = [
  'Spam',
  'Harassment or abuse',
  'Inappropriate content',
  'Scam or fraud',
  'Something else',
] as const;

export async function reportContent(
  reporterId: string,
  contentType: ContentType,
  contentId: string,
  reason: string,
  note: string | null,
  reportedUserId: string | null,
): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    content_type: contentType,
    content_id: contentId,
    reported_user_id: reportedUserId,
    reason,
    note: note?.trim() || null,
  });
  if (error) throw error;
}

export async function blockUser(
  blockerId: string,
  blockedId: string,
  blockedDisplayName: string | null,
): Promise<void> {
  const { error } = await supabase.from('blocked_users').upsert(
    { blocker_id: blockerId, blocked_id: blockedId, blocked_display_name: blockedDisplayName },
    { onConflict: 'blocker_id,blocked_id' },
  );
  if (error) throw error;
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .match({ blocker_id: blockerId, blocked_id: blockedId });
  if (error) throw error;
}

export async function fetchBlockedUserIds(userId: string): Promise<Set<string>> {
  const { data } = await supabase.from('blocked_users').select('blocked_id').eq('blocker_id', userId);
  return new Set((data ?? []).map(r => r.blocked_id as string));
}

export async function fetchBlockedUsers(userId: string): Promise<BlockedUser[]> {
  const { data } = await supabase
    .from('blocked_users')
    .select('*')
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false });
  return (data ?? []) as BlockedUser[];
}
