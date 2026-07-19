/**
 * Standalone sync debugger — runs without Expo/React Native.
 * Usage: node scripts/test-sync.mjs <lat> <lng>
 * Example: node scripts/test-sync.mjs 40.7128 -74.0060
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Load .env ────────────────────────────────────────────────────────────────
const envPath = join(__dir, '..', '.env');
const env = {};
try {
  readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...rest] = line.split('=');
    if (k && rest.length) env[k.trim()] = rest.join('=').trim();
  });
  console.log('✅ .env loaded');
} catch {
  console.error('❌ Could not read .env');
  process.exit(1);
}

const PLACES_KEY = env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? '';
const TMDB_KEY   = env.EXPO_PUBLIC_TMDB_API_KEY ?? '';
const SUPA_URL   = env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPA_KEY   = env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

console.log(`  PLACES_KEY : ${PLACES_KEY ? PLACES_KEY.slice(0,8) + '…' : '❌ MISSING'}`);
console.log(`  TMDB_KEY   : ${TMDB_KEY   ? TMDB_KEY.slice(0,8)   + '…' : '❌ MISSING'}`);
console.log(`  SUPABASE   : ${SUPA_URL   ? SUPA_URL               : '❌ MISSING'}`);
console.log();

// ── Coordinates ──────────────────────────────────────────────────────────────
const lat = parseFloat(process.argv[2]);
const lng = parseFloat(process.argv[3]);
if (isNaN(lat) || isNaN(lng)) {
  console.error('Usage: node scripts/test-sync.mjs <lat> <lng>');
  console.error('Example: node scripts/test-sync.mjs 40.7128 -74.0060');
  process.exit(1);
}
console.log(`📍 Testing with location: ${lat}, ${lng}\n`);

// ── TMDB ─────────────────────────────────────────────────────────────────────
console.log('━━━ TMDB: now_playing ━━━');
try {
  const url = `https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_KEY}&language=en-US&page=1`;
  console.log(`  GET ${url.replace(TMDB_KEY, '<key>')}`);
  const res = await fetch(url);
  console.log(`  HTTP ${res.status}`);
  const data = await res.json();
  if (data.results) {
    console.log(`  ✅ ${data.results.length} movies returned`);
    data.results.slice(0, 3).forEach(m =>
      console.log(`     • ${m.title} (vote_avg: ${m.vote_average}, poster: ${m.poster_path ? '✅' : '❌'})`),
    );
  } else {
    console.log('  ❌ No results:', JSON.stringify(data).slice(0, 200));
  }
} catch (e) {
  console.log(`  ❌ Error: ${e.message}`);
}
console.log();

const PLACES_NEW = 'https://places.googleapis.com/v1';
const FIELD_MASK = 'places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.photos,places.shortFormattedAddress';

async function searchNearby(type, radius) {
  const res = await fetch(`${PLACES_NEW}/places:searchNearby`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes: [type],
      maxResultCount: 5,
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius },
      },
    }),
  });
  return { status: res.status, data: await res.json() };
}

// ── Google Places: movie_theater ──────────────────────────────────────────────
console.log('━━━ Places API (New): movie_theater ━━━');
try {
  const { status, data } = await searchNearby('movie_theater', 8000);
  console.log(`  HTTP ${status}`);
  if (data.places) {
    console.log(`  ✅ ${data.places.length} theaters`);
    data.places.slice(0, 3).forEach(p =>
      console.log(`     • ${p.displayName?.text} (${p.shortFormattedAddress})`),
    );
  } else {
    console.log('  ❌', JSON.stringify(data).slice(0, 200));
  }
} catch (e) { console.log(`  ❌ ${e.message}`); }
console.log();

// ── Google Places: venues ─────────────────────────────────────────────────────
const VENUE_TYPES = ['park', 'restaurant', 'bowling_alley', 'tourist_attraction'];

for (const type of VENUE_TYPES) {
  console.log(`━━━ Places API (New): ${type} ━━━`);
  try {
    const { status, data } = await searchNearby(type, 3000);
    console.log(`  HTTP ${status}`);
    if (data.places) {
      console.log(`  ✅ ${data.places.length} results`);
      data.places.slice(0, 2).forEach(p =>
        console.log(`     • ${p.displayName?.text} (rating: ${p.rating ?? 'n/a'}, photo: ${p.photos ? '✅' : '❌'})`),
      );
    } else {
      console.log('  ❌', JSON.stringify(data).slice(0, 200));
    }
  } catch (e) { console.log(`  ❌ ${e.message}`); }
  console.log();
}

// ── Supabase: check activities table ─────────────────────────────────────────
console.log('━━━ Supabase: activities table ━━━');
try {
  const url = `${SUPA_URL}/rest/v1/activities?select=id,title,source_id,source&limit=5&order=id.desc`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
    },
  });
  console.log(`  HTTP ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) {
    console.log(`  ✅ ${data.length} rows returned (most recent 5)`);
    data.forEach(r =>
      console.log(`     • [${r.source ?? 'no source'}] ${r.title} (source_id: ${r.source_id ?? 'NULL'})`),
    );
  } else {
    console.log(`  ❌ Unexpected response:`, JSON.stringify(data).slice(0, 200));
  }
} catch (e) {
  console.log(`  ❌ Error: ${e.message}`);
}
console.log();

// ── Supabase: check source_id column exists ───────────────────────────────────
console.log('━━━ Supabase: test upsert (1 dummy row) ━━━');
try {
  const url = `${SUPA_URL}/rest/v1/activities`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify([{
      source_id: '__test_probe__',
      source: 'test',
      title: '__TEST__',
      subtitle: 'probe',
      category: 'test',
      score: 0,
      photo_url: null,
      distance: '0 mi',
      commitment: '0 min',
      latitude: lat,
      longitude: lng,
    }]),
  });
  console.log(`  HTTP ${res.status}`);
  if (res.status === 201 || res.status === 200) {
    console.log('  ✅ Upsert succeeded — columns exist and RLS allows insert');
    // Clean up test row
    const del = await fetch(`${SUPA_URL}/rest/v1/activities?source_id=eq.__test_probe__`, {
      method: 'DELETE',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    });
    console.log(`  🧹 Cleanup: HTTP ${del.status}`);
  } else {
    const body = await res.text();
    console.log(`  ❌ Upsert failed: ${body.slice(0, 300)}`);
  }
} catch (e) {
  console.log(`  ❌ Error: ${e.message}`);
}

console.log('\nDone.');
