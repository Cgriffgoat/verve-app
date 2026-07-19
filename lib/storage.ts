import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

export async function uploadReviewPhoto(uri: string, userId: string): Promise<string> {
  const filename = `${userId}/${Date.now()}.jpg`;

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
