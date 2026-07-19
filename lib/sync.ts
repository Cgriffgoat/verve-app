import { supabase } from './supabase';

const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? '';
const TMDB_KEY   = process.env.EXPO_PUBLIC_TMDB_API_KEY ?? '';
const PLACES_NEW = 'https://places.googleapis.com/v1';
const TMDB_IMG   = 'https://image.tmdb.org/t/p/w500';

// searchText returns nextPageToken at the top level, not nested under places
const TEXT_FIELD_MASK = [
  'nextPageToken',
  'places.id',
  'places.displayName',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.photos',
  'places.priceLevel',
  'places.shortFormattedAddress',
].join(',');

type ActivityRow = {
  source_id: string;
  source: string;
  title: string;
  subtitle: string;
  category: string;
  score: number;
  photo_url: string | null;
  distance: string;
  commitment: string;
  latitude: number;
  longitude: number;
  good_for: string[];
};

const CATEGORY_GOOD_FOR: Record<string, string[]> = {
  'Movies':           ['date', 'friends', 'family'],
  'Outdoors':         ['solo', 'family', 'friends', 'dog'],
  'Food & Drink':     ['date', 'friends', 'family'],
  'Nightlife':        ['friends', 'date'],
  'Shopping':         ['solo', 'friends'],
  'Arts & Culture':   ['family', 'friends', 'date'],
  'Wellness':         ['solo'],
  'Events':           ['friends', 'family', 'date'],
  'Adventure/Thrill': ['friends', 'family'],
  'Games & Hobbies':  ['friends', 'family'],
  'Family Fun':       ['family', 'friends'],
  'Seasonal/Unique':  ['friends', 'family', 'date'],
};

// ── Helpers ────────────────────────────────────────────────────────────────

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDist(miles: number): string {
  if (miles < 0.1) return 'Nearby';
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

function photoUrl(photoName: string): string {
  return `${PLACES_NEW}/${photoName}/media?maxWidthPx=800&key=${PLACES_KEY}`;
}

// searchNearby uses includedTypes for precise type filtering and ranks by proximity within the circle.
// Used for movie theaters where we specifically need the nearest match.
const NEARBY_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.photos',
  'places.priceLevel',
  'places.shortFormattedAddress',
].join(',');

async function searchNearby(
  lat: number,
  lng: number,
  types: string[],
  radius: number,
): Promise<any[]> {
  const res = await fetch(`${PLACES_NEW}/places:searchNearby`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_KEY,
      'X-Goog-FieldMask': NEARBY_FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes: types,
      maxResultCount: 20,
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius },
      },
    }),
  });
  if (!res.ok) throw new Error(`Places searchNearby ${res.status}`);
  const data = await res.json();
  return data.places ?? [];
}

function priceLevelStr(level: string | undefined): string {
  const map: Record<string, string> = {
    PRICE_LEVEL_FREE: 'Free',
    PRICE_LEVEL_INEXPENSIVE: '$',
    PRICE_LEVEL_MODERATE: '$$',
    PRICE_LEVEL_EXPENSIVE: '$$$',
    PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
  };
  return level ? (map[level] ?? '') : '';
}

// Paginated searchText — deduplicates by place id, up to 60 results (3 pages × 20)
async function searchTextPaginated(
  lat: number,
  lng: number,
  textQuery: string,
  radius: number,
  maxPages = 3,
  options?: { includedType?: string; rankPreference?: 'DISTANCE' | 'RELEVANCE' },
): Promise<any[]> {
  const all: any[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const body: Record<string, any> = {
      textQuery,
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius },
      },
      pageSize: 20,
    };
    if (options?.includedType) body.includedType = options.includedType;
    if (options?.rankPreference) body.rankPreference = options.rankPreference;
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(`${PLACES_NEW}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': PLACES_KEY,
        'X-Goog-FieldMask': TEXT_FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn('[sync] searchText error:', res.status, await res.text().catch(() => ''));
      break;
    }

    const data = await res.json();

    for (const p of data.places ?? []) {
      if (p.id && !seen.has(p.id)) {
        seen.add(p.id);
        all.push(p);
      }
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return all;
}

async function upsert(rows: ActivityRow[], ignoreDuplicates = true): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('activities')
    .upsert(rows, { onConflict: 'source_id', ignoreDuplicates });
  if (error) console.warn('[sync] upsert error:', error.message);
}

// ── Movies ─────────────────────────────────────────────────────────────────

async function findNearestTheater(lat: number, lng: number): Promise<any | null> {
  for (const radius of [8000, 25000, 80000]) {
    const results = await searchNearby(lat, lng, ['movie_theater'], radius).catch(() => []);
    if (results.length > 0) return results[0];
  }
  return null;
}

async function syncMovies(lat: number, lng: number): Promise<void> {
  if (!TMDB_KEY || !PLACES_KEY) return;

  const [theater, moviesData] = await Promise.all([
    findNearestTheater(lat, lng),
    fetch(
      `https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_KEY}&language=en-US&page=1`,
    ).then(r => r.json()),
  ]);

  const movies: any[] = moviesData.results ?? [];
  if (!theater || movies.length === 0) return;

  const tLat: number = theater.location.latitude;
  const tLng: number = theater.location.longitude;
  const theaterName: string = theater.displayName?.text ?? 'nearby theater';

  const rows: ActivityRow[] = movies.slice(0, 10).map((m: any) => ({
    source_id: `tmdb_${m.id}`,
    source: 'tmdb',
    title: m.title,
    subtitle: `Now playing at ${theaterName}`,
    category: 'Movies',
    score: Math.max(50, Math.min(100, Math.round((m.vote_average ?? 6) * 10))),
    photo_url: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : null,
    distance: fmtDist(haversine(lat, lng, tLat, tLng)),
    commitment: '~2 hrs',
    latitude: tLat,
    longitude: tLng,
    good_for: CATEGORY_GOOD_FOR['Movies'],
  }));

  await upsert(rows, false);
}

// ── Venues ─────────────────────────────────────────────────────────────────

// One entry per Google place type so every type gets its own searchNearby call and full 20-result
// allocation. Broad text queries caused dominant types (restaurant) to crowd out others (cafe, bakery).
const VENUE_TYPES: Array<{ placeType: string; category: string; commitment: string }> = [
  // Outdoors
  { placeType: 'park',               category: 'Outdoors',          commitment: '1-3 hrs' },
  { placeType: 'beach',              category: 'Outdoors',          commitment: '1-3 hrs' },
  { placeType: 'hiking_area',        category: 'Outdoors',          commitment: '2-4 hrs' },
  { placeType: 'campground',         category: 'Outdoors',          commitment: '3-6 hrs' },
  { placeType: 'national_park',      category: 'Outdoors',          commitment: '2-6 hrs' },
  { placeType: 'botanical_garden',   category: 'Outdoors',          commitment: '1-2 hrs' },
  { placeType: 'marina',             category: 'Outdoors',          commitment: '1-3 hrs' },
  { placeType: 'dog_park',           category: 'Outdoors',          commitment: '30 min-1 hr' },
  // Food & Drink
  { placeType: 'restaurant',         category: 'Food & Drink',      commitment: '1-2 hrs' },
  { placeType: 'cafe',               category: 'Food & Drink',      commitment: '30 min-1 hr' },
  { placeType: 'bakery',             category: 'Food & Drink',      commitment: '30 min-1 hr' },
  { placeType: 'food_court',         category: 'Food & Drink',      commitment: '30 min-1 hr' },
  // Nightlife
  { placeType: 'bar',                category: 'Nightlife',         commitment: '2-4 hrs' },
  { placeType: 'night_club',         category: 'Nightlife',         commitment: '3-5 hrs' },
  { placeType: 'brewery',            category: 'Nightlife',         commitment: '1-3 hrs' },
  { placeType: 'wine_bar',           category: 'Nightlife',         commitment: '1-3 hrs' },
  // Shopping
  { placeType: 'shopping_mall',      category: 'Shopping',          commitment: '1-3 hrs' },
  { placeType: 'clothing_store',     category: 'Shopping',          commitment: '30 min-2 hrs' },
  { placeType: 'book_store',         category: 'Shopping',          commitment: '30 min-1 hr' },
  { placeType: 'market',             category: 'Shopping',          commitment: '30 min-2 hrs' },
  { placeType: 'gift_shop',          category: 'Shopping',          commitment: '30 min-1 hr' },
  // Arts & Culture
  { placeType: 'museum',             category: 'Arts & Culture',    commitment: '1-3 hrs' },
  { placeType: 'art_gallery',        category: 'Arts & Culture',    commitment: '1-2 hrs' },
  { placeType: 'performing_arts_theater', category: 'Arts & Culture', commitment: '2-4 hrs' },
  { placeType: 'historical_landmark', category: 'Arts & Culture',   commitment: '30 min-2 hrs' },
  { placeType: 'library',            category: 'Arts & Culture',    commitment: '1-2 hrs' },
  // Wellness
  { placeType: 'spa',                category: 'Wellness',          commitment: '1-3 hrs' },
  { placeType: 'yoga_studio',        category: 'Wellness',          commitment: '1-2 hrs' },
  { placeType: 'gym',                category: 'Wellness',          commitment: '1-2 hrs' },
  { placeType: 'fitness_center',     category: 'Wellness',          commitment: '1-2 hrs' },
  { placeType: 'sports_complex',     category: 'Wellness',          commitment: '1-3 hrs' },
  { placeType: 'climbing_gym',       category: 'Wellness',          commitment: '1-3 hrs' },
  // Events
  { placeType: 'tourist_attraction', category: 'Events',            commitment: '1-3 hrs' },
  { placeType: 'stadium',            category: 'Events',            commitment: '2-4 hrs' },
  // Adventure/Thrill
  { placeType: 'amusement_center',      category: 'Adventure/Thrill', commitment: '1-3 hrs' },
  { placeType: 'amusement_park',        category: 'Adventure/Thrill', commitment: '3-6 hrs' },
  { placeType: 'go_kart_track',         category: 'Adventure/Thrill', commitment: '1-2 hrs' },
  { placeType: 'escape_room',           category: 'Adventure/Thrill', commitment: '1-2 hrs' },
  { placeType: 'miniature_golf_course', category: 'Adventure/Thrill', commitment: '1-2 hrs' },
  // Games & Hobbies
  { placeType: 'bowling_alley',      category: 'Games & Hobbies',   commitment: '2-3 hrs' },
  // Family Fun
  { placeType: 'zoo',                category: 'Family Fun',        commitment: '2-4 hrs' },
  { placeType: 'aquarium',           category: 'Family Fun',        commitment: '1-3 hrs' },
  { placeType: 'trampoline_park',    category: 'Family Fun',        commitment: '1-2 hrs' },
  { placeType: 'water_park',         category: 'Family Fun',        commitment: '3-5 hrs' },
  { placeType: 'playground',         category: 'Family Fun',        commitment: '30 min-2 hrs' },
];

function placesToRows(
  places: any[],
  lat: number,
  lng: number,
  category: string,
  commitment: string,
): ActivityRow[] {
  return places.map((p: any) => {
    const pLat: number = p.location?.latitude ?? lat;
    const pLng: number = p.location?.longitude ?? lng;
    const rating: number | undefined = p.rating;
    const price = priceLevelStr(p.priceLevel);
    const addressParts = [p.shortFormattedAddress, price].filter(Boolean);
    return {
      source_id: p.id as string,
      source: 'google',
      title: (p.displayName?.text ?? '') as string,
      subtitle: addressParts.join('  ·  ') || category,
      category,
      score: rating
        ? Math.max(55, Math.min(100, Math.round((rating / 5) * 100)))
        : 65,
      photo_url: p.photos?.[0]?.name ? photoUrl(p.photos[0].name) : null,
      distance: fmtDist(haversine(lat, lng, pLat, pLng)),
      commitment,
      latitude: pLat,
      longitude: pLng,
      good_for: CATEGORY_GOOD_FOR[category] ?? [],
    };
  });
}

async function syncVenues(lat: number, lng: number): Promise<void> {
  if (!PLACES_KEY) return;
  await Promise.all(
    VENUE_TYPES.map(({ placeType, category, commitment }) =>
      searchNearby(lat, lng, [placeType], 10000)
        .then(places => upsert(placesToRows(places, lat, lng, category, commitment)))
        .catch(e => console.warn(`[sync] ${placeType}:`, e.message)),
    ),
  );
}

// ── Public entry point ─────────────────────────────────────────────────────

export async function syncActivities(latitude: number, longitude: number): Promise<void> {
  await Promise.all([
    syncMovies(latitude, longitude).catch(e =>
      console.warn('[sync] movies failed:', e.message),
    ),
    syncVenues(latitude, longitude).catch(e =>
      console.warn('[sync] venues failed:', e.message),
    ),
  ]);
}
