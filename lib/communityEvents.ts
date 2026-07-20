import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

export type CommunityEvent = {
  id: string;
  creator_id: string;
  creator_display_name: string | null;
  title: string;
  description: string | null;
  category: string;
  latitude: number;
  longitude: number;
  location_name: string;
  event_date: string;
  event_time: string | null;
  photo_url: string | null;
  created_at: string;
  status: string;
};

export type NewCommunityEvent = {
  creator_id: string;
  creator_display_name: string | null;
  title: string;
  description: string | null;
  category: string;
  latitude: number;
  longitude: number;
  location_name: string;
  event_date: string;
  event_time: string | null;
  photo_url: string | null;
};

export async function fetchCommunityEvents(
  lat: number,
  lng: number,
  radiusMiles = 25,
): Promise<CommunityEvent[]> {
  const MILES_PER_DEG = 69;
  const latDelta = radiusMiles / MILES_PER_DEG;
  const lngDelta = latDelta / Math.cos((lat * Math.PI) / 180);

  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('community_events')
    .select('*')
    .eq('status', 'active')
    .gte('event_date', today)
    .gte('latitude', lat - latDelta)
    .lte('latitude', lat + latDelta)
    .gte('longitude', lng - lngDelta)
    .lte('longitude', lng + lngDelta)
    .order('event_date', { ascending: true });

  if (error) throw error;
  const events = (data ?? []) as CommunityEvent[];

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return events;

  const { data: blocked } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', user.id);
  const blockedIds = new Set((blocked ?? []).map(b => b.blocked_id as string));

  return events.filter(e => !blockedIds.has(e.creator_id));
}

export async function submitCommunityEvent(
  event: NewCommunityEvent,
): Promise<CommunityEvent> {
  const { data, error } = await supabase
    .from('community_events')
    .insert(event)
    .select()
    .single();
  if (error) throw error;
  return data as CommunityEvent;
}

export async function uploadEventPhoto(uri: string, userId: string): Promise<string> {
  const filename = `events/${userId}/${Date.now()}.jpg`;
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const { data, error } = await supabase.storage
    .from('review-photos')
    .upload(filename, decode(base64), { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage
    .from('review-photos')
    .getPublicUrl(data.path);
  return publicUrl;
}
