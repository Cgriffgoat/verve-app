import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ActivityCard } from '../../components/ActivityCard';
import { CitySearchModal } from '../../components/CitySearchModal';
import { SubmitEventModal } from '../../components/SubmitEventModal';
import { supabase } from '../../lib/supabase';
import { syncActivities } from '../../lib/sync';
import { useActiveLocation } from '../../context/LocationContext';
import type { Activity } from '../../lib/types';

const CORAL = '#FF5C5C';

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // miles
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
const COMPANIONS = ['Solo', 'Date', 'Friends', 'Family', '+Dog'];

const COMPANION_TO_TAG: Record<string, string> = {
  'Solo': 'solo', 'Date': 'date', 'Friends': 'friends', 'Family': 'family', '+Dog': 'dog',
};

export default function TodayScreen() {
  const { location } = useActiveLocation();
  const [cityModalVisible, setCityModalVisible] = useState(false);
  const [submitEventVisible, setSubmitEventVisible] = useState(false);

  const [activities, setActivities] = useState<Activity[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeToggle, setActiveToggle] = useState<'now' | 'planning'>('now');
  const [activeCategory, setActiveCategory] = useState('Everything');
  const [activeCompanions, setActiveCompanions] = useState<string[]>([]);

  const fetchActivities = useCallback(async (loc: typeof location) => {
    const RADIUS_MILES = 25;
    const MILES_PER_DEG = 69;
    const latDelta = RADIUS_MILES / MILES_PER_DEG;

    let query = supabase.from('activities').select('*');

    if (loc) {
      const lngDelta = latDelta / Math.cos((loc.latitude * Math.PI) / 180);
      query = query
        .gte('latitude',  loc.latitude  - latDelta)
        .lte('latitude',  loc.latitude  + latDelta)
        .gte('longitude', loc.longitude - lngDelta)
        .lte('longitude', loc.longitude + lngDelta);
    }

    const [{ data, error }, { data: { user } }] = await Promise.all([
      query.order('score', { ascending: false }),
      supabase.auth.getUser(),
    ]);

    if (error) {
      setError(error.message);
    } else {
      setError(null);
      // Haversine trim: bounding box may include corners slightly beyond radius
      const rows = (data ?? []).filter(row => {
        if (!loc || row.latitude == null || row.longitude == null) return true;
        return haversine(loc.latitude, loc.longitude, row.latitude, row.longitude) <= 25;
      });
      setActivities(
        rows.map(row => ({
          id: String(row.id),
          title: row.title,
          subtitle: row.subtitle,
          category: row.category,
          score: row.score,
          imageUrl: row.photo_url,
          distance: row.distance,
          commitment: row.commitment,
          weather: row.weather ?? undefined,
          good_for: row.good_for ?? [],
        })),
      );
    }

    if (user) {
      setUserId(user.id);
      const { data: saved } = await supabase
        .from('saved_items')
        .select('activity_id')
        .eq('user_id', user.id);
      setSavedIds(new Set((saved ?? []).map(r => String(r.activity_id))));
    }
  }, []);

  const toggleSave = useCallback(async (activityId: string) => {
    if (!userId) return;
    const isSaved = savedIds.has(activityId);
    // Optimistic update
    setSavedIds(prev => {
      const next = new Set(prev);
      if (isSaved) next.delete(activityId); else next.add(activityId);
      return next;
    });
    if (isSaved) {
      await supabase.from('saved_items').delete().match({ user_id: userId, activity_id: activityId });
    } else {
      await supabase.from('saved_items').insert({ user_id: userId, activity_id: activityId });
    }
  }, [userId, savedIds]);

  const loadFeed = useCallback(async () => {
    if (location) {
      await syncActivities(location.latitude, location.longitude).catch(() => {});
    }
    await fetchActivities(location);
  }, [fetchActivities, location]);

  useEffect(() => {
    if (location === null) return; // wait for location context to resolve
    setLoading(true);
    loadFeed().finally(() => setLoading(false));
  }, [location]); // re-run whenever active location changes

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFeed();
    setRefreshing(false);
  }, [loadFeed]);

  const toggleCompanion = (companion: string) => {
    setActiveCompanions(prev =>
      prev.includes(companion) ? prev.filter(c => c !== companion) : [...prev, companion],
    );
  };

  const router = useRouter();

  const filteredActivities = activities.filter(a => {
    if (activeCategory !== 'Everything' && a.category !== activeCategory) return false;
    if (activeCompanions.length > 0) {
      const tags = activeCompanions.map(c => COMPANION_TO_TAG[c]).filter(Boolean);
      if (!tags.some(tag => a.good_for?.includes(tag))) return false;
    }
    return true;
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <CitySearchModal visible={cityModalVisible} onClose={() => setCityModalVisible(false)} />
      <SubmitEventModal
        visible={submitEventVisible}
        onClose={() => setSubmitEventVisible(false)}
        onSubmitted={() => {}}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={CORAL}
          />
        }
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>What's good today?</Text>
          <TouchableOpacity
            style={[styles.locationPill, location?.isManual && styles.locationPillManual]}
            onPress={() => setCityModalVisible(true)}
          >
            <Text style={styles.locationText}>
              {location?.isManual ? '📌' : '📍'} {location?.city ?? '…'}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── Plan with friends ── */}
        <TouchableOpacity
          style={styles.planTogetherBtn}
          onPress={() => router.push('/hangout')}
          activeOpacity={0.8}
        >
          <Text style={styles.planTogetherEmoji}>🤝</Text>
          <View style={styles.planTogetherBody}>
            <Text style={styles.planTogetherTitle}>Plan with friends</Text>
            <Text style={styles.planTogetherSub}>Vote on what to do together</Text>
          </View>
          <Text style={styles.planTogetherChevron}>›</Text>
        </TouchableOpacity>

        {/* ── Post a local event ── */}
        <TouchableOpacity
          style={styles.postEventBtn}
          onPress={() => setSubmitEventVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.postEventEmoji}>⭐</Text>
          <View style={styles.postEventBody}>
            <Text style={styles.postEventTitle}>Know about a local event?</Text>
            <Text style={styles.postEventSub}>Share it with people nearby</Text>
          </View>
          <Text style={styles.postEventChevron}>›</Text>
        </TouchableOpacity>

        {/* ── Going now / Planning ahead toggle ── */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, activeToggle === 'now' && styles.toggleBtnActive]}
            onPress={() => setActiveToggle('now')}
          >
            <Text style={[styles.toggleText, activeToggle === 'now' && styles.toggleTextActive]}>
              Going now
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, activeToggle === 'planning' && styles.toggleBtnActive]}
            onPress={() => setActiveToggle('planning')}
          >
            <Text
              style={[styles.toggleText, activeToggle === 'planning' && styles.toggleTextActive]}
            >
              Planning ahead
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Category pills ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillRow}
        >
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.pill, activeCategory === cat && styles.pillActive]}
              onPress={() => setActiveCategory(cat)}
            >
              <Text style={[styles.pillText, activeCategory === cat && styles.pillTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── With: companion filter ── */}
        <View style={styles.companionRow}>
          <Text style={styles.withLabel}>With:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.companionPills}
          >
            {COMPANIONS.map(c => {
              const isActive = activeCompanions.includes(c);
              return (
                <TouchableOpacity
                  key={c}
                  style={[styles.pill, isActive && styles.pillActive]}
                  onPress={() => toggleCompanion(c)}
                >
                  <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Feed ── */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={CORAL} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>Couldn't load activities</Text>
            <Text style={styles.errorDetail}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={onRefresh}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.feed}>
            {filteredActivities.length > 0 ? (
              filteredActivities.map(activity => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  isSaved={savedIds.has(activity.id)}
                  onToggleSave={() => toggleSave(activity.id)}
                />
              ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🗺️</Text>
                <Text style={styles.emptyTitle}>No activities yet</Text>
                <Text style={styles.emptySubtitle}>Let's add some!</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    flex: 1,
    letterSpacing: -0.4,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F2',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 3,
  },
  locationPillManual: {
    backgroundColor: '#FFF0F0',
  },
  locationText: { fontSize: 13, fontWeight: '500', color: '#1A1A1A' },
  chevron: { fontSize: 17, color: '#8E8E93', marginTop: -1 },

  planTogetherBtn: {
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#DDE3FF',
  },
  planTogetherEmoji: { fontSize: 22 },
  planTogetherBody: { flex: 1 },
  planTogetherTitle: { fontSize: 14, fontWeight: '700', color: '#3D5AFE' },
  planTogetherSub: { fontSize: 12, color: '#6B7FCC', marginTop: 1 },
  planTogetherChevron: { fontSize: 18, color: '#8E9FDF' },

  postEventBtn: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: '#FAF5FF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E9D8FF',
  },
  postEventEmoji: { fontSize: 22 },
  postEventBody: { flex: 1 },
  postEventTitle: { fontSize: 14, fontWeight: '700', color: '#7C3AED' },
  postEventSub: { fontSize: 12, color: '#9F67D4', marginTop: 1 },
  postEventChevron: { fontSize: 18, color: '#C4A8E8' },

  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: '#F2F2F2',
    borderRadius: 12,
    padding: 3,
  },
  toggleBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10 },
  toggleBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleText: { fontSize: 14, fontWeight: '500', color: '#8E8E93' },
  toggleTextActive: { color: '#1A1A1A', fontWeight: '600' },

  pillRow: { paddingHorizontal: 20, paddingBottom: 14, gap: 8 },
  companionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    marginBottom: 22,
  },
  withLabel: { fontSize: 14, fontWeight: '600', color: '#8E8E93', marginRight: 8 },
  companionPills: { gap: 8, paddingRight: 20 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F2F2F2' },
  pillActive: { backgroundColor: CORAL },
  pillText: { fontSize: 13, fontWeight: '500', color: '#444444' },
  pillTextActive: { color: '#FFFFFF', fontWeight: '600' },

  feed: { paddingHorizontal: 20, gap: 16 },

  centered: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 32 },
  errorText: { fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginBottom: 6 },
  errorDetail: { fontSize: 13, color: '#8E8E93', textAlign: 'center', marginBottom: 20 },
  retryBtn: {
    backgroundColor: CORAL,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  emptyState: { alignItems: 'center', paddingTop: 64 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  emptySubtitle: { fontSize: 15, color: '#8E8E93' },
});
