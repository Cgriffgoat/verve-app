import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Clapperboard,
  TreePine,
  Utensils,
  Ticket,
  Gamepad2,
  Wine,
  ShoppingBag,
  Landmark,
  Leaf,
  MapPin,
  Plus,
  Zap,
  Baby,
  Sparkles,
} from 'lucide-react-native';
import { useActiveLocation } from '../../context/LocationContext';
import { fetchCommunityEvents, type CommunityEvent } from '../../lib/communityEvents';
import { SubmitEventModal } from '../../components/SubmitEventModal';
import { ReportModal } from '../../components/ReportModal';
import { supabase } from '../../lib/supabase';

const CORAL = '#FF5C5C';
const COMMUNITY_COLOR = '#AF52DE';
const CARD_HEIGHT = 120;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CATEGORIES = [
  'Everything',
  'Movies',
  'Outdoors',
  'Food & Drink',
  'Nightlife',
  'Shopping',
  'Arts & Culture',
  'Wellness',
  'Events',
  'Adventure/Thrill',
  'Games & Hobbies',
  'Family Fun',
  'Seasonal/Unique',
];

const CATEGORY_COLORS: Record<string, string> = {
  Movies:             '#5B7FFF',
  Outdoors:           '#4CAF50',
  'Food & Drink':     '#FF9500',
  Nightlife:          '#7C3AED',
  Shopping:           '#EC4899',
  'Arts & Culture':   '#D97706',
  Wellness:           '#0D9488',
  Events:             '#AF52DE',
  'Adventure/Thrill': '#FF4500',
  'Games & Hobbies':  '#32C5C5',
  'Family Fun':       '#F59E0B',
  'Seasonal/Unique':  '#8B5CF6',
};

const CATEGORY_EMOJI: Record<string, string> = {
  Movies:             '🎬',
  Outdoors:           '🌿',
  'Food & Drink':     '🍽️',
  Nightlife:          '🍷',
  Shopping:           '🛍️',
  'Arts & Culture':   '🎨',
  Wellness:           '🧘',
  Events:             '🎭',
  'Adventure/Thrill': '⚡',
  'Games & Hobbies':  '🎮',
  'Family Fun':       '👶',
  'Seasonal/Unique':  '✨',
};

type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const CATEGORY_ICON: Record<string, LucideIcon> = {
  Movies:             Clapperboard,
  Outdoors:           TreePine,
  'Food & Drink':     Utensils,
  Nightlife:          Wine,
  Shopping:           ShoppingBag,
  'Arts & Culture':   Landmark,
  Wellness:           Leaf,
  Events:             Ticket,
  'Adventure/Thrill': Zap,
  'Games & Hobbies':  Gamepad2,
  'Family Fun':       Baby,
  'Seasonal/Unique':  Sparkles,
};

function PlacePin({ category, score, selected }: { category: string; score?: number; selected: boolean }) {
  const color = CATEGORY_COLORS[category] ?? CORAL;
  const Icon = CATEGORY_ICON[category] ?? MapPin;
  const size = selected ? 44 : 38;

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[pinStyles.body, { backgroundColor: color, width: size, height: size, borderRadius: size / 4 },
        selected && pinStyles.bodySelected]}>
        <Icon size={selected ? 22 : 18} color="#fff" strokeWidth={2} />
        {score != null && (
          <View style={pinStyles.scoreBadge}>
            <Text style={pinStyles.scoreText}>{score}</Text>
          </View>
        )}
      </View>
      <View style={[pinStyles.pointer, { borderTopColor: color }]} />
    </View>
  );
}

function CommunityPin({ selected }: { selected: boolean }) {
  const size = selected ? 44 : 38;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={[pinStyles.body, {
        backgroundColor: COMMUNITY_COLOR,
        width: size,
        height: size,
        borderRadius: size / 4,
        borderWidth: 2,
        borderColor: '#fff',
      }, selected && pinStyles.bodySelected]}>
        <Text style={{ fontSize: selected ? 20 : 17 }}>⭐</Text>
      </View>
      <View style={[pinStyles.pointer, { borderTopColor: COMMUNITY_COLOR }]} />
    </View>
  );
}

const pinStyles = StyleSheet.create({
  body: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  bodySelected: {
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 9,
  },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  scoreBadge: {
    position: 'absolute',
    bottom: -5,
    right: -7,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 3,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 3,
  },
  scoreText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1A1A1A',
  },
});

const SEARCH_TYPES: Array<{ types: string[]; category: string }> = [
  { types: ['movie_theater'],                                                                                       category: 'Movies' },
  { types: ['park', 'beach', 'hiking_area', 'campground', 'national_park', 'botanical_garden', 'marina', 'dog_park'], category: 'Outdoors' },
  { types: ['restaurant', 'cafe', 'bakery', 'food_court'],                                                         category: 'Food & Drink' },
  { types: ['bar', 'night_club', 'brewery', 'wine_bar'],                                                           category: 'Nightlife' },
  { types: ['shopping_mall', 'clothing_store', 'book_store', 'market', 'gift_shop'],                               category: 'Shopping' },
  { types: ['museum', 'art_gallery', 'performing_arts_theater', 'historical_landmark', 'library'],                 category: 'Arts & Culture' },
  { types: ['spa', 'yoga_studio', 'gym', 'fitness_center', 'sports_complex'],                                     category: 'Wellness' },
  { types: ['tourist_attraction', 'stadium'],                                                                       category: 'Events' },
  { types: ['amusement_center', 'amusement_park', 'go_karting_venue', 'miniature_golf_course'],                   category: 'Adventure/Thrill' },
  { types: ['bowling_alley'],                                                                                       category: 'Games & Hobbies' },
  { types: ['zoo', 'aquarium', 'water_park', 'playground'],                                                        category: 'Family Fun' },
];

const PLACES_NEW = 'https://places.googleapis.com/v1';
const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? '';
const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.location',
  'places.rating', 'places.userRatingCount', 'places.photos',
  'places.shortFormattedAddress',
].join(',');

type Place = {
  place_id: string;
  name: string;
  vicinity: string;
  lat: number;
  lng: number;
  rating?: number;
  score?: number;
  user_ratings_total?: number;
  photoName?: string;
  photoUrl?: string;
  category: string;
  source: 'places' | 'community';
  eventDate?: string;
  eventTime?: string;
  creatorName?: string;
  creatorId?: string;
};

async function fetchNearbyNew(
  lat: number,
  lng: number,
  types: string[],
  category: string,
): Promise<Place[]> {
  const res = await fetch(`${PLACES_NEW}/places:searchNearby`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes: types,
      maxResultCount: 20,
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius: 5000 },
      },
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.places ?? []).map((p: any): Place => {
    const rating: number | undefined = p.rating;
    return {
      place_id: p.id,
      name: p.displayName?.text ?? '',
      vicinity: p.shortFormattedAddress ?? '',
      lat: p.location?.latitude ?? lat,
      lng: p.location?.longitude ?? lng,
      rating,
      score: rating ? Math.max(55, Math.min(100, Math.round((rating / 5) * 100))) : undefined,
      user_ratings_total: p.userRatingCount,
      photoName: p.photos?.[0]?.name,
      category,
      source: 'places',
    };
  });
}

function communityEventToPlace(e: CommunityEvent): Place {
  return {
    place_id: `community_${e.id}`,
    name: e.title,
    vicinity: e.location_name,
    lat: e.latitude,
    lng: e.longitude,
    category: e.category,
    source: 'community',
    photoUrl: e.photo_url ?? undefined,
    eventDate: e.event_date,
    eventTime: e.event_time ?? undefined,
    creatorName: e.creator_display_name ?? undefined,
    creatorId: e.creator_id,
  };
}

function formatEventDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const cardAnim = useRef(new Animated.Value(CARD_HEIGHT + 60)).current;

  const { location: activeLocation, locationLoading } = useActiveLocation();

  const [places, setPlaces] = useState<Place[]>([]);
  const [communityPlaces, setCommunityPlaces] = useState<Place[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [activeCategory, setActiveCategory] = useState('Everything');
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [submitModalVisible, setSubmitModalVisible] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [reportingPlace, setReportingPlace] = useState<Place | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!activeLocation) return;
    fetchNearby(activeLocation.latitude, activeLocation.longitude);
  }, [activeLocation]);

  const fetchNearby = async (lat: number, lng: number) => {
    if (!PLACES_KEY) return;
    setLoadingPlaces(true);
    try {
      const [batches, communityData] = await Promise.all([
        Promise.all(
          SEARCH_TYPES.map(({ types, category }) =>
            fetchNearbyNew(lat, lng, types, category).catch(() => [] as Place[]),
          ),
        ),
        fetchCommunityEvents(lat, lng).catch(() => [] as CommunityEvent[]),
      ]);

      const seen = new Set<string>();
      const all: Place[] = [];
      for (const batch of batches) {
        for (const place of batch) {
          if (!seen.has(place.place_id)) {
            seen.add(place.place_id);
            all.push(place);
          }
        }
      }
      setPlaces(all);
      setCommunityPlaces(communityData.map(communityEventToPlace));
    } finally {
      setLoadingPlaces(false);
    }
  };

  const showCard = useCallback(
    (place: Place) => {
      setSelectedPlace(place);
      Animated.spring(cardAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 70,
        friction: 12,
      }).start();
    },
    [cardAnim],
  );

  const hideCard = useCallback(() => {
    Animated.timing(cardAnim, {
      toValue: CARD_HEIGHT + 60,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setSelectedPlace(null));
  }, [cardAnim]);

  const filteredPlaces =
    activeCategory === 'Everything'
      ? places
      : places.filter(p => p.category === activeCategory);

  const filteredCommunity =
    activeCategory === 'Everything'
      ? communityPlaces
      : communityPlaces.filter(p => p.category === activeCategory);

  const visiblePlaces = [...filteredPlaces, ...filteredCommunity];

  const getPhotoUrl = (photoName: string) =>
    `${PLACES_NEW}/${photoName}/media?maxWidthPx=400&key=${PLACES_KEY}`;

  const handleEventSubmitted = () => {
    if (activeLocation) {
      fetchNearby(activeLocation.latitude, activeLocation.longitude);
    }
  };

  // ── Waiting for location ───────────────────────────────────────────────────
  if (locationLoading || !activeLocation) {
    return (
      <View style={styles.permScreen}>
        <ActivityIndicator size="large" color={CORAL} />
        <Text style={[styles.permSub, { marginTop: 16 }]}>Finding your location…</Text>
      </View>
    );
  }

  // ── Main map view ──────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <SubmitEventModal
        visible={submitModalVisible}
        onClose={() => setSubmitModalVisible(false)}
        onSubmitted={handleEventSubmitted}
      />

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: activeLocation.latitude,
          longitude: activeLocation.longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={hideCard}
      >
        {visiblePlaces.map(place => (
          <Marker
            key={place.place_id}
            coordinate={{ latitude: place.lat, longitude: place.lng }}
            onPress={e => { e.stopPropagation(); showCard(place); }}
            tracksViewChanges={false}
          >
            {place.source === 'community'
              ? <CommunityPin selected={selectedPlace?.place_id === place.place_id} />
              : <PlacePin
                  category={place.category}
                  score={place.score}
                  selected={selectedPlace?.place_id === place.place_id}
                />
            }
          </Marker>
        ))}
      </MapView>

      {/* ── Category pills — floating top ─────────────────────────────────── */}
      <View style={[styles.pillsWrapper, { top: insets.top + 12 }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsScroll}
        >
          {CATEGORIES.map(cat => {
            const active = activeCategory === cat;
            const color = cat === 'Everything' ? CORAL : (CATEGORY_COLORS[cat] ?? CORAL);
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.pill, active && { backgroundColor: color }]}
                onPress={() => { setActiveCategory(cat); hideCard(); }}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{cat}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Loading badge ─────────────────────────────────────────────────── */}
      {loadingPlaces && (
        <View style={[styles.loadingBadge, { top: insets.top + 58 }]}>
          <ActivityIndicator size="small" color={CORAL} />
          <Text style={styles.loadingText}>Loading places…</Text>
        </View>
      )}

      {/* ── Place count badge ─────────────────────────────────────────────── */}
      {!loadingPlaces && places.length > 0 && (
        <View style={[styles.countBadge, { top: insets.top + 58 }]}>
          <Text style={styles.countText}>
            {visiblePlaces.length} place{visiblePlaces.length === 1 ? '' : 's'}
          </Text>
        </View>
      )}

      {/* ── Submit event FAB ──────────────────────────────────────────────── */}
      {!selectedPlace && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 80 }]}
          onPress={() => setSubmitModalVisible(true)}
          activeOpacity={0.85}
        >
          <Plus size={22} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      )}

      {/* ── Bottom place card ─────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.bottomCard,
          { bottom: insets.bottom + 16, transform: [{ translateY: cardAnim }] },
        ]}
        pointerEvents={selectedPlace ? 'box-none' : 'none'}
      >
        {selectedPlace && (
          <View style={styles.cardInner}>
            {/* Photo */}
            {(selectedPlace.photoUrl || selectedPlace.photoName) ? (
              <Image
                source={{ uri: selectedPlace.photoUrl ?? getPhotoUrl(selectedPlace.photoName!) }}
                style={styles.cardPhoto}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.cardPhoto, styles.cardPhotoPlaceholder]}>
                <Text style={styles.cardPhotoEmoji}>
                  {CATEGORY_EMOJI[selectedPlace.category] ?? '📍'}
                </Text>
              </View>
            )}

            {/* Info */}
            <View style={styles.cardInfo}>
              <View style={styles.cardCategoryRow}>
                <View
                  style={[
                    styles.categoryDot,
                    { backgroundColor: CATEGORY_COLORS[selectedPlace.category] ?? CORAL },
                  ]}
                />
                <Text style={[styles.categoryLabel, { color: CATEGORY_COLORS[selectedPlace.category] ?? CORAL }]}>
                  {selectedPlace.category}
                </Text>
                {selectedPlace.source === 'community' && (
                  <View style={styles.communityBadge}>
                    <Text style={styles.communityBadgeText}>Community</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardName} numberOfLines={2}>
                {selectedPlace.name}
              </Text>
              <Text style={styles.cardVicinity} numberOfLines={1}>
                {selectedPlace.vicinity}
              </Text>
              {selectedPlace.source === 'community' && selectedPlace.eventDate && (
                <View style={styles.eventDateRow}>
                  <Text style={styles.eventDateText}>
                    {formatEventDate(selectedPlace.eventDate)}
                    {selectedPlace.eventTime ? `  ·  ${selectedPlace.eventTime}` : ''}
                  </Text>
                  {selectedPlace.creatorName && (
                    <Text style={styles.creatorText}>by {selectedPlace.creatorName}</Text>
                  )}
                </View>
              )}
              {selectedPlace.source === 'places' && (selectedPlace.rating != null || selectedPlace.score != null) && (
                <View style={styles.ratingRow}>
                  {selectedPlace.score != null && (
                    <View style={[styles.scoreChip, { backgroundColor: CATEGORY_COLORS[selectedPlace.category] ?? CORAL }]}>
                      <Text style={styles.scoreChipText}>{selectedPlace.score}</Text>
                    </View>
                  )}
                  {selectedPlace.rating != null && (
                    <>
                      <Text style={styles.ratingStar}>★</Text>
                      <Text style={styles.ratingText}>
                        {selectedPlace.rating.toFixed(1)}
                        {selectedPlace.user_ratings_total
                          ? `  (${selectedPlace.user_ratings_total.toLocaleString()})`
                          : ''}
                      </Text>
                    </>
                  )}
                </View>
              )}
            </View>

            {/* Report (community events only) */}
            {selectedPlace.source === 'community' && userId && (
              <TouchableOpacity
                style={styles.reportBtn}
                onPress={() => setReportingPlace(selectedPlace)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.reportBtnText}>Report</Text>
              </TouchableOpacity>
            )}

            {/* Close */}
            <TouchableOpacity style={styles.closeBtn} onPress={hideCard} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>

      {userId && (
        <ReportModal
          visible={!!reportingPlace}
          onClose={() => setReportingPlace(null)}
          reporterId={userId}
          contentType="community_event"
          contentId={reportingPlace?.place_id.replace('community_', '') ?? ''}
          reportedUserId={reportingPlace?.creatorId}
          reportedUserName={reportingPlace?.creatorName}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },

  permScreen: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  permEmoji: { fontSize: 52, marginBottom: 16 },
  permTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 10 },
  permSub: { fontSize: 14, color: '#8E8E93', textAlign: 'center', lineHeight: 21 },

  pillsWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  pillsScroll: {
    paddingHorizontal: 14,
    gap: 8,
  },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  pillText: { fontSize: 13, fontWeight: '600', color: '#1A1A1A' },
  pillTextActive: { color: '#fff' },

  loadingBadge: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  loadingText: { fontSize: 12, color: '#8E8E93', fontWeight: '500' },
  countBadge: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  countText: { fontSize: 12, color: '#8E8E93', fontWeight: '600' },

  fab: {
    position: 'absolute',
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COMMUNITY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COMMUNITY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },

  bottomCard: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  cardInner: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 8,
    minHeight: CARD_HEIGHT,
  },
  cardPhoto: {
    width: 100,
    height: CARD_HEIGHT,
  },
  cardPhotoPlaceholder: {
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPhotoEmoji: { fontSize: 32 },
  cardInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
    gap: 3,
  },
  cardCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  categoryDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  communityBadge: {
    backgroundColor: COMMUNITY_COLOR,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  communityBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    lineHeight: 20,
  },
  cardVicinity: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 1,
  },
  eventDateRow: {
    marginTop: 4,
    gap: 1,
  },
  eventDateText: {
    fontSize: 12,
    color: COMMUNITY_COLOR,
    fontWeight: '600',
  },
  creatorText: {
    fontSize: 11,
    color: '#BDBDBD',
    fontWeight: '400',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  ratingStar: { fontSize: 12, color: '#F59E0B' },
  ratingText: { fontSize: 12, color: '#555', fontWeight: '500' },
  scoreChip: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
  },
  scoreChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  reportBtn: {
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  reportBtnText: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
  },
  closeBtn: {
    padding: 12,
    justifyContent: 'flex-start',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#BDBDBD',
    fontWeight: '600',
  },
});
