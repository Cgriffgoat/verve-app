import AsyncStorage from '@react-native-async-storage/async-storage';

export type ActiveLocation = {
  latitude: number;
  longitude: number;
  city: string;
  isManual: boolean;
};

const KEY = '@verve/active_location';

export async function loadSavedLocation(): Promise<ActiveLocation | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ActiveLocation) : null;
  } catch {
    return null;
  }
}

export async function persistLocation(loc: ActiveLocation): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(loc));
  } catch {}
}

export async function clearPersistedLocation(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}
