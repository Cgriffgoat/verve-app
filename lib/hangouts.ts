import { supabase } from './supabase';

export type Hangout = {
  id: string;
  creator_id: string;
  title: string | null;
  join_code: string;
  status: 'voting' | 'decided';
  selected_activity_id: string | null;
  latitude: number | null;
  longitude: number | null;
  city_name: string | null;
  created_at: string;
};

export type Participant = {
  id: string;
  hangout_id: string;
  user_id: string;
  display_name: string | null;
  joined_at: string;
};

export type Vote = {
  id: string;
  hangout_id: string;
  user_id: string;
  vibe: string | null;         // feel: 'food' | 'outdoors' | 'games' | 'arts'
  setting: string | null;      // time of day
  budget: string | null;       // duration: 'quick' | 'couple' | 'half_day' | 'all_day'
  price: string | null;        // '$' | '$$' | '$$$'
  dog_friendly: string | null; // 'yes' | 'no'
  live_music: string | null;   // 'yes' | 'no'
};

export type Suggestion = {
  id: string;
  hangout_id: string;
  activity_id: string;
  suggested_by: string;
};

export type HangoutMessage = {
  id: string;
  hangout_id: string;
  user_id: string;
  display_name: string;
  content: string;
  created_at: string;
};

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export type HangoutLocation = {
  latitude: number;
  longitude: number;
  city_name: string;
};

export async function createHangout(
  userId: string,
  displayName: string,
  title?: string,
  location?: HangoutLocation,
): Promise<Hangout> {
  let hangout: Hangout | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('hangouts')
      .insert({
        creator_id: userId,
        title: title?.trim() || null,
        join_code: generateCode(),
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        city_name: location?.city_name ?? null,
      })
      .select()
      .single();

    if (error?.code === '23505') continue; // code collision — retry
    if (error) throw error;
    hangout = data as Hangout;
    break;
  }

  if (!hangout) throw new Error('Failed to generate a unique code. Try again.');

  await supabase.from('hangout_participants').insert({
    hangout_id: hangout.id,
    user_id: userId,
    display_name: displayName,
  });

  return hangout;
}

export async function joinHangout(
  joinCode: string,
  userId: string,
  displayName: string,
): Promise<Hangout> {
  const { data, error } = await supabase
    .from('hangouts')
    .select('*')
    .eq('join_code', joinCode.toUpperCase().trim())
    .single();

  if (error || !data) throw new Error('No hangout found with that code.');

  await supabase.from('hangout_participants').upsert(
    { hangout_id: data.id, user_id: userId, display_name: displayName },
    { onConflict: 'hangout_id,user_id', ignoreDuplicates: true },
  );

  return data as Hangout;
}

export type VoteField = 'vibe' | 'setting' | 'budget' | 'price' | 'dog_friendly' | 'live_music';

export async function castVote(
  hangoutId: string,
  userId: string,
  field: VoteField,
  value: string,
): Promise<void> {
  await supabase.from('hangout_votes').upsert(
    { hangout_id: hangoutId, user_id: userId, [field]: value, updated_at: new Date().toISOString() },
    { onConflict: 'hangout_id,user_id' },
  );
}

export async function suggestActivity(
  hangoutId: string,
  activityId: string,
  userId: string,
): Promise<void> {
  await supabase.from('hangout_suggestions').upsert(
    { hangout_id: hangoutId, activity_id: activityId, suggested_by: userId },
    { onConflict: 'hangout_id,activity_id', ignoreDuplicates: true },
  );
}

export async function sendMessage(
  hangoutId: string,
  userId: string,
  displayName: string,
  body: string,
): Promise<void> {
  const { error } = await supabase.from('hangout_messages').insert({
    hangout_id: hangoutId,
    user_id: userId,
    display_name: displayName,
    content: body.trim(),
  });
  if (error) throw error;
}

export async function decideActivity(
  hangoutId: string,
  activityId: string,
): Promise<void> {
  const { error } = await supabase
    .from('hangouts')
    .update({ status: 'decided', selected_activity_id: activityId })
    .eq('id', hangoutId);
  if (error) throw error;
}

// Reopens voting after a "We're going here!" decision — for when someone
// locked in too eagerly and the group wants to keep looking.
export async function undecideActivity(hangoutId: string): Promise<void> {
  const { error } = await supabase
    .from('hangouts')
    .update({ status: 'voting', selected_activity_id: null })
    .eq('id', hangoutId);
  if (error) throw error;
}
