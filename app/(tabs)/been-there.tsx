import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';

const CORAL = '#FF5C5C';

type HistoryRow = {
  id: string;
  activity_id: string;
  score: number;
  review_text: string;
  photos: string[];
  created_at: string;
  activities: {
    title: string;
    category: string;
    photo_url: string;
  };
};

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function scoreColor(score: number): string {
  if (score >= 80) return '#4CAF50';
  if (score >= 60) return '#F59E0B';
  return CORAL;
}

export default function BeenThereScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('reviews')
      .select('id, activity_id, score, review_text, photos, created_at, activities(title, category, photo_url)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    setRows((data ?? []) as unknown as HistoryRow[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchHistory().finally(() => setLoading(false));
    }, [fetchHistory]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchHistory();
    setRefreshing(false);
  }, [fetchHistory]);

  const now = new Date();
  const thisMonthCount = rows.filter(r => {
    const d = new Date(r.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CORAL} />}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Been there</Text>
          <Text style={styles.headerSub}>Your history</Text>
        </View>

        {/* ── Streak banner ── */}
        {rows.length > 0 && (
          <View style={styles.streakBanner}>
            <Text style={styles.streakFlame}>🔥</Text>
            <View>
              <Text style={styles.streakCount}>{thisMonthCount} new {thisMonthCount === 1 ? 'thing' : 'things'} this month</Text>
              <Text style={styles.streakTotal}>{rows.length} total place{rows.length === 1 ? '' : 's'} logged</Text>
            </View>
          </View>
        )}

        {/* ── Content ── */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={CORAL} />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📍</Text>
            <Text style={styles.emptyTitle}>Nothing logged yet</Text>
            <Text style={styles.emptySub}>Rate something to start building your list.</Text>
            <TouchableOpacity style={styles.exploreBtn} onPress={() => router.push('/(tabs)')}>
              <Text style={styles.exploreBtnText}>Browse today's picks</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.list}>
            {rows.map(row => {
              const photo = row.photos?.[0] ?? row.activities?.photo_url;
              const color = scoreColor(row.score);
              return (
                <TouchableOpacity
                  key={row.id}
                  style={styles.row}
                  onPress={() => router.push(`/activity/${row.activity_id}`)}
                  activeOpacity={0.85}
                >
                  {/* Photo */}
                  <View style={styles.photoWrap}>
                    {photo ? (
                      <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" />
                    ) : (
                      <View style={[styles.photo, styles.photoPlaceholder]} />
                    )}
                  </View>

                  {/* Info */}
                  <View style={styles.info}>
                    <View style={styles.titleRow}>
                      <Text style={styles.activityTitle} numberOfLines={1}>
                        {row.activities?.title ?? 'Activity'}
                      </Text>
                    </View>
                    <Text style={styles.categoryTag}>{row.activities?.category}</Text>
                    <Text style={styles.timestamp}>{relativeTime(row.created_at)}</Text>
                    {row.review_text ? (
                      <Text style={styles.reviewSnippet} numberOfLines={2}>
                        {row.review_text}
                      </Text>
                    ) : null}
                  </View>

                  {/* Score */}
                  <View style={[styles.scoreBadge, { borderColor: color }]}>
                    <Text style={[styles.scoreText, { color }]}>{row.score}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { paddingBottom: 40 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A1A1A',
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },

  // Streak
  streakBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginVertical: 14,
    backgroundColor: '#FFF5F5',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    borderWidth: 1,
    borderColor: '#FFE0E0',
  },
  streakFlame: { fontSize: 32 },
  streakCount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  streakTotal: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },

  // States
  centered: { paddingTop: 80, alignItems: 'center' },
  emptyState: {
    alignItems: 'center',
    paddingTop: 72,
    paddingHorizontal: 40,
  },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  exploreBtn: {
    backgroundColor: CORAL,
    borderRadius: 22,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  exploreBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },

  // List
  list: {
    paddingHorizontal: 20,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  photoWrap: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  photo: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  photoPlaceholder: {
    backgroundColor: '#F2F2F2',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    flex: 1,
  },
  categoryTag: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '500',
  },
  timestamp: {
    fontSize: 11,
    color: '#BDBDBD',
    marginTop: 1,
  },
  reviewSnippet: {
    fontSize: 12,
    color: '#666',
    lineHeight: 17,
    marginTop: 3,
  },
  scoreBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
