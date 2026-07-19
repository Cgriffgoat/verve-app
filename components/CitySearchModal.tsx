import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveLocation } from '../context/LocationContext';
import type { ActiveLocation } from '../lib/location';

const CORAL = '#FF5C5C';
const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? '';

const PLACES_NEW = 'https://places.googleapis.com/v1';

type Prediction = {
  place_id: string;
  mainText: string;
  secondaryText: string;
};

interface SelectedLoc {
  latitude: number;
  longitude: number;
  city: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** When provided the modal calls this instead of setting the global active location.
   *  The "Use my current location" row is hidden — irrelevant for trip planning. */
  onSelect?: (loc: SelectedLoc) => void;
  title?: string;
}

export function CitySearchModal({ visible, onClose, onSelect, title }: Props) {
  const insets = useSafeAreaInsets();
  const { setManualLocation, resetToGPS } = useActiveLocation();

  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [fetching, setFetching] = useState(false);
  const [resetting, setResetting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setPredictions([]);
    }
  }, [visible]);

  const searchCities = async (text: string) => {
    if (text.length < 2) {
      setPredictions([]);
      return;
    }
    setFetching(true);
    try {
      const res = await fetch(`${PLACES_NEW}/places:autocomplete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': PLACES_KEY,
        },
        body: JSON.stringify({
          input: text,
          includedPrimaryTypes: [
            'locality',
            'sublocality',
            'neighborhood',
            'administrative_area_level_1',
            'postal_code',
          ],
        }),
      });
      const data = await res.json();
      const suggestions: Prediction[] = (data.suggestions ?? []).map((s: any) => ({
        place_id: s.placePrediction?.placeId ?? '',
        mainText: s.placePrediction?.structuredFormat?.mainText?.text ?? '',
        secondaryText: s.placePrediction?.structuredFormat?.secondaryText?.text ?? '',
      })).filter((p: Prediction) => p.place_id);
      setPredictions(suggestions);
    } catch (e: any) {
      console.error('[CitySearch] error:', e.message);
      setPredictions([]);
    } finally {
      setFetching(false);
    }
  };

  const handleChangeText = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchCities(text), 350);
  };

  const selectCity = async (prediction: Prediction) => {
    Keyboard.dismiss();
    setFetching(true);
    try {
      const res = await fetch(`${PLACES_NEW}/places/${prediction.place_id}`, {
        headers: {
          'X-Goog-Api-Key': PLACES_KEY,
          'X-Goog-FieldMask': 'location',
        },
      });
      const data = await res.json();
      const loc_data = data.location;
      if (!loc_data) return;

      if (onSelect) {
        onSelect({ latitude: loc_data.latitude, longitude: loc_data.longitude, city: prediction.mainText });
        onClose();
        return;
      }
      const loc: ActiveLocation = {
        latitude: loc_data.latitude,
        longitude: loc_data.longitude,
        city: prediction.mainText,
        isManual: true,
      };
      await setManualLocation(loc);
      onClose();
    } catch {} finally {
      setFetching(false);
    }
  };

  const handleUseMyLocation = async () => {
    Keyboard.dismiss();
    setResetting(true);
    await resetToGPS();
    setResetting(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{title ?? 'Change location'}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.doneBtn}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Search input */}
        <View style={styles.inputRow}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.input}
            placeholder="City, neighborhood, or zip code…"
            placeholderTextColor="#BDBDBD"
            value={query}
            onChangeText={handleChangeText}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {fetching && <ActivityIndicator size="small" color={CORAL} style={styles.spinner} />}
        </View>

        {/* Use current location — hidden when caller handles selection directly */}
        {!onSelect && (
          <>
            <TouchableOpacity
              style={styles.gpsRow}
              onPress={handleUseMyLocation}
              disabled={resetting}
            >
              <Text style={styles.gpsIcon}>📍</Text>
              <Text style={styles.gpsText}>Use my current location</Text>
              {resetting && <ActivityIndicator size="small" color={CORAL} style={{ marginLeft: 8 }} />}
            </TouchableOpacity>
            <View style={styles.divider} />
          </>
        )}

        {/* Results */}
        <FlatList
          data={predictions}
          keyExtractor={item => item.place_id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.result} onPress={() => selectCity(item)}>
              <Text style={styles.resultCity}>{item.mainText}</Text>
              <Text style={styles.resultCountry}>{item.secondaryText}</Text>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            query.length >= 2 && !fetching ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No results found</Text>
              </View>
            ) : null
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  doneBtn: { fontSize: 16, color: CORAL, fontWeight: '600' },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    marginHorizontal: 16,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  searchIcon: { fontSize: 15, marginRight: 6 },
  input: {
    flex: 1,
    height: 46,
    fontSize: 16,
    color: '#1A1A1A',
  },
  spinner: { marginLeft: 8 },

  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
  },
  gpsIcon: { fontSize: 18 },
  gpsText: { fontSize: 15, fontWeight: '600', color: CORAL },

  divider: { height: 1, backgroundColor: '#F0F0F0' },

  result: { paddingHorizontal: 20, paddingVertical: 14 },
  resultCity: { fontSize: 15, fontWeight: '600', color: '#1A1A1A', marginBottom: 2 },
  resultCountry: { fontSize: 13, color: '#8E8E93' },
  separator: { height: 1, backgroundColor: '#F0F0F0', marginLeft: 20 },

  emptyState: { paddingTop: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#8E8E93' },
});
