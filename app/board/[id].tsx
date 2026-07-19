import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import {
  fetchBoardActivities,
  removeFromBoard,
  type TripBoard,
} from '../../lib/boards';
import { ActivityCard } from '../../components/ActivityCard';
import type { Activity } from '../../lib/types';

const CORAL = '#FF5C5C';

export default function BoardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [board, setBoard] = useState<TripBoard | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    const [{ data: boardRow }, acts] = await Promise.all([
      supabase.from('trip_boards').select('*').eq('id', id).single(),
      fetchBoardActivities(id),
    ]);
    if (boardRow) setBoard({ ...boardRow, item_count: acts.length });
    setActivities(acts);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleRemove = useCallback(async (activityId: string) => {
    if (!id) return;
    setActivities(prev => prev.filter(a => a.id !== activityId));
    await removeFromBoard(id, activityId);
  }, [id]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {board?.name ?? '…'}
          </Text>
          {board?.location ? (
            <Text style={styles.headerSub}>{board.location}</Text>
          ) : null}
        </View>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={CORAL} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CORAL} />
          }
        >
          {activities.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🗺️</Text>
              <Text style={styles.emptyTitle}>No places yet</Text>
              <Text style={styles.emptySub}>
                Open any activity and save it to this board.
              </Text>
            </View>
          ) : (
            <View style={styles.feed}>
              <Text style={styles.countLabel}>
                {activities.length} place{activities.length === 1 ? '' : 's'}
              </Text>
              {activities.map(activity => (
                <View key={activity.id}>
                  <ActivityCard activity={activity} />
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => handleRemove(activity.id)}
                  >
                    <Text style={styles.removeBtnText}>Remove from board</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: { fontSize: 28, color: '#1A1A1A', fontWeight: '300', lineHeight: 32 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  headerSub: { fontSize: 12, color: '#8E8E93', marginTop: 1 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  scrollContent: { paddingBottom: 40 },

  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyIcon: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 10 },
  emptySub: { fontSize: 14, color: '#8E8E93', textAlign: 'center', lineHeight: 21 },

  feed: { paddingHorizontal: 20, paddingTop: 16, gap: 4 },
  countLabel: { fontSize: 13, color: '#8E8E93', fontWeight: '500', marginBottom: 12 },

  removeBtn: { alignSelf: 'flex-start', marginBottom: 16, paddingVertical: 4 },
  removeBtnText: { fontSize: 13, color: '#FF3B30', fontWeight: '500' },
});
