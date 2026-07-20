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
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { fetchBlockedUsers, unblockUser, type BlockedUser } from '../../lib/moderation';
import { deleteAllUserContent, requestAccountDeletion } from '../../lib/account';

const CORAL = '#FF5C5C';
const SUPPORT_EMAIL = 'cgplayworks@gmail.com';

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
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const fetchHistory = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    setEmail(user.email ?? null);

    const [{ data }, blocked] = await Promise.all([
      supabase
        .from('reviews')
        .select('id, activity_id, score, review_text, photos, created_at, activities(title, category, photo_url)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      fetchBlockedUsers(user.id),
    ]);

    setRows((data ?? []) as unknown as HistoryRow[]);
    setBlockedUsers(blocked);
  }, []);

  const handleUnblock = useCallback(async (blocked: BlockedUser) => {
    if (!userId) return;
    setUnblockingId(blocked.blocked_id);
    try {
      await unblockUser(userId, blocked.blocked_id);
      setBlockedUsers(prev => prev.filter(b => b.blocked_id !== blocked.blocked_id));
    } catch (e: any) {
      Alert.alert('Could not unblock', e.message ?? 'Please try again.');
    } finally {
      setUnblockingId(null);
    }
  }, [userId]);

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { supabase.auth.signOut(); } },
    ]);
  }, []);

  const handleDeleteAccount = useCallback(() => {
    if (!userId) return;
    Alert.alert(
      'Delete your account?',
      "This permanently removes your reviews, saved places, boards, and hangout activity. This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true);
            try {
              await deleteAllUserContent(userId);
              await requestAccountDeletion(userId, email);
              await supabase.auth.signOut();
            } catch (e: any) {
              Alert.alert('Something went wrong', e.message ?? 'Please try again or contact support.');
              setDeletingAccount(false);
            }
          },
        },
      ],
    );
  }, [userId, email]);

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

        {/* ── Privacy & Safety ── */}
        <View style={styles.safetySection}>
          <Text style={styles.safetyHeader}>Privacy & Safety</Text>

          {blockedUsers.length > 0 && (
            <View style={styles.blockedCard}>
              <Text style={styles.blockedCardTitle}>Blocked users</Text>
              {blockedUsers.map(b => (
                <View key={b.id} style={styles.blockedRow}>
                  <Text style={styles.blockedName} numberOfLines={1}>
                    {b.blocked_display_name ?? 'Verve User'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleUnblock(b)}
                    disabled={unblockingId === b.blocked_id}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {unblockingId === b.blocked_id
                      ? <ActivityIndicator size="small" color={CORAL} />
                      : <Text style={styles.unblockText}>Unblock</Text>
                    }
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={styles.contactRow}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Verve%20support`)}
            activeOpacity={0.7}
          >
            <Text style={styles.contactRowText}>Contact support / report a problem</Text>
            <Text style={styles.contactRowChevron}>›</Text>
          </TouchableOpacity>
          <Text style={styles.contactEmail}>{SUPPORT_EMAIL}</Text>
        </View>

        {/* ── Account ── */}
        <View style={styles.safetySection}>
          <Text style={styles.safetyHeader}>Account</Text>
          <TouchableOpacity style={styles.contactRow} onPress={handleSignOut} activeOpacity={0.7}>
            <Text style={styles.contactRowText}>Sign out</Text>
            <Text style={styles.contactRowChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteAccountBtn}
            onPress={handleDeleteAccount}
            disabled={deletingAccount}
            activeOpacity={0.7}
          >
            {deletingAccount
              ? <ActivityIndicator size="small" color={CORAL} />
              : <Text style={styles.deleteAccountText}>Delete account</Text>
            }
          </TouchableOpacity>
        </View>
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

  // Privacy & Safety
  safetySection: {
    paddingHorizontal: 20,
    marginTop: 28,
    gap: 10,
  },
  safetyHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  blockedCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  blockedCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  blockedName: {
    fontSize: 14,
    color: '#1A1A1A',
    fontWeight: '500',
    flex: 1,
  },
  unblockText: {
    fontSize: 13,
    color: CORAL,
    fontWeight: '700',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  contactRowText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  contactRowChevron: {
    fontSize: 18,
    color: '#C7C7CC',
  },
  contactEmail: {
    fontSize: 12,
    color: '#BDBDBD',
    textAlign: 'center',
  },
  deleteAccountBtn: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  deleteAccountText: {
    fontSize: 14,
    fontWeight: '600',
    color: CORAL,
  },
});
