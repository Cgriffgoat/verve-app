import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import {
  type ActiveLocation,
  loadSavedLocation,
  persistLocation,
  clearPersistedLocation,
} from '../lib/location';

type LocationCtx = {
  location: ActiveLocation | null;
  locationLoading: boolean;
  setManualLocation: (loc: ActiveLocation) => Promise<void>;
  resetToGPS: () => Promise<void>;
};

const LocationContext = createContext<LocationCtx>({
  location: null,
  locationLoading: true,
  setManualLocation: async () => {},
  resetToGPS: async () => {},
});

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<ActiveLocation | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);

  const getGPSLocation = useCallback(async (): Promise<ActiveLocation | null> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    let coords: { latitude: number; longitude: number };
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      coords = loc.coords;
    } catch {
      const last = await Location.getLastKnownPositionAsync();
      if (!last) return null;
      coords = last.coords;
    }

    let city = 'Nearby';
    try {
      const [geo] = await Location.reverseGeocodeAsync(coords);
      city = geo.city ?? geo.subregion ?? geo.region ?? 'Nearby';
    } catch {}

    return { ...coords, city, isManual: false };
  }, []);

  useEffect(() => {
    (async () => {
      setLocationLoading(true);
      const saved = await loadSavedLocation();
      if (saved) {
        setLocation(saved);
        setLocationLoading(false);
        return;
      }
      const gps = await getGPSLocation();
      setLocation(gps);
      setLocationLoading(false);
    })();
  }, [getGPSLocation]);

  const setManualLocation = useCallback(async (loc: ActiveLocation) => {
    setLocation(loc);
    await persistLocation(loc);
  }, []);

  const resetToGPS = useCallback(async () => {
    await clearPersistedLocation();
    setLocationLoading(true);
    const gps = await getGPSLocation();
    setLocation(gps);
    setLocationLoading(false);
  }, [getGPSLocation]);

  return (
    <LocationContext.Provider value={{ location, locationLoading, setManualLocation, resetToGPS }}>
      {children}
    </LocationContext.Provider>
  );
}

export const useActiveLocation = () => useContext(LocationContext);
