import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { fetchUserBoards, createBoard, type TripBoard } from '../../lib/boards';
import { ActivityCard } from '../../components/ActivityCard';
import type { Activity } from '../../lib/types';

const CORAL = '#FF5C5C';

type Tab = 'saved' | 'boards';

export default function SavedScreen() {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('saved');
  const [userId, setUserId] = useState<string | null>(null);

  // Saved tab state
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [refreshingSaved, setRefreshingSaved] = useState(false);

  // Boards tab state
  const [boards, setBoards] = useState<TripBoard[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [refreshingBoards, setRefreshingBoards] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [creating, setCreating] = useState(false);

  // ── Fetch saved activities ─────────────────────────────────────────────────

  const fetchSaved = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data } = await supabase
      .from('saved_items')
      .select('activity_id, activities(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    setActivities(
      (data ?? [])
        .filter(r => r.activities)
        .map(r => {
          const a = r.activities as any;
          return {
            id: String(a.id),
            title: a.title,
            subtitle: a.subtitle,
            category: a.category,
            score: a.score,
            imageUrl: a.photo_url,
            distance: a.distance,
            commitment: a.commitment,
            good_for: a.good_for ?? [],
          };
        }),
    );
  }, []);

  // ── Fetch boards ───────────────────────────────────────────────────────────

  const fetchBoards = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const list = await fetchUserBoards(user.id);
    setBoards(list);
  }, []);

  // ── Refetch on focus ───────────────────────────────────────────────────────

  useFocusEffect(
    useCallback(() => {
      setLoadingSaved(true);
      fetchSaved().finally(() => setLoadingSaved(false));
      setLoadingBoards(true);
      fetchBoards().finally(() => setLoadingBoards(false));
    }, [fetchSaved, fetchBoards]),
  );

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleUnsave = useCallback(async (activityId: string) => {
    if (!userId) return;
    setActivities(prev => prev.filter(a => a.id !== activityId));
    await supabase.from('saved_items').delete().match({ user_id: userId, activity_id: activityId });
  }, [userId]);

  const handleCreateBoard = async () => {
    if (!userId || !newName.trim()) return;
    setCreating(true);
    try {
      const board = await createBoard(userId, newName, newLocation);
      setBoards(prev => [board, ...prev]);
      setNewName('');
      setNewLocation('');
      setShowCreateForm(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setCreating(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Saved</Text>
        {tab === 'boards' && (
          <TouchableOpacity
            style={styles.newBoardBtn}
            onPress={() => { setShowCreateForm(v => !v); }}
          >
            <Text style={styles.newBoardBtnText}>+ New board</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tab toggle */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'saved' && styles.tabBtnActive]}
          onPress={() => setTab('saved')}
        >
          <Text style={[styles.tabText, tab === 'saved' && styles.tabTextActive]}>Saved</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'boards' && styles.tabBtnActive]}
          onPress={() => setTab('boards')}
        >
          <Text style={[styles.tabText, tab === 'boards' && styles.tabTextActive]}>Trip boards</Text>
        </TouchableOpacity>
      </View>

      {tab === 'saved' ? (
        // ── Saved tab ────────────────────────────────────────────────────────
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshingSaved}
              onRefresh={async () => { setRefreshingSaved(true); await fetchSaved(); setRefreshingSaved(false); }}
              tintColor={CORAL}
            />
          }
        >
          {loadingSaved ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={CORAL} />
            </View>
          ) : activities.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔖</Text>
              <Text style={styles.emptyTitle}>Nothing saved yet</Text>
              <Text style={styles.emptySub}>
                Tap the bookmark icon on anything you want to come back to.
              </Text>
            </View>
          ) : (
            <View style={styles.feed}>
              {activities.map(activity => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  isSaved
                  onToggleSave={() => handleUnsave(activity.id)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        // ── Boards tab ───────────────────────────────────────────────────────
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshingBoards}
              onRefresh={async () => { setRefreshingBoards(true); await fetchBoards(); setRefreshingBoards(false); }}
              tintColor={CORAL}
            />
          }
        >
          {/* Create form */}
          {showCreateForm && (
            <View style={styles.createForm}>
              <TextInput
                style={styles.input}
                placeholder="Board name (e.g. Miami June 2026)"
                placeholderTextColor="#BDBDBD"
                value={newName}
                onChangeText={setNewName}
                autoFocus
              />
              <TextInput
                style={styles.input}
                placeholder="Location (optional)"
                placeholderTextColor="#BDBDBD"
                value={newLocation}
                onChangeText={setNewLocation}
              />
              <View style={styles.createActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => { setShowCreateForm(false); setNewName(''); setNewLocation(''); }}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.createBtn, (!newName.trim() || creating) && styles.createBtnDisabled]}
                  onPress={handleCreateBoard}
                  disabled={!newName.trim() || creating}
                >
                  {creating
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.createBtnText}>Create board</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}

          {loadingBoards ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={CORAL} />
            </View>
          ) : boards.length === 0 && !showCreateForm ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🗺️</Text>
              <Text style={styles.emptyTitle}>No trip boards yet</Text>
              <Text style={styles.emptySub}>
                Create a board to plan a trip and save places to it.
              </Text>
              <TouchableOpacity
                style={styles.createFirstBtn}
                onPress={() => setShowCreateForm(true)}
              >
                <Text style={styles.createFirstBtnText}>+ Create your first board</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.boardList}>
              {boards.map(board => (
                <TouchableOpacity
                  key={board.id}
                  style={styles.boardCard}
                  onPress={() => router.push(`/board/${board.id}`)}
                  activeOpacity={0.85}
                >
                  <View style={styles.boardIconCircle}>
                    <Text style={styles.boardIcon}>🗺️</Text>
                  </View>
                  <View style={styles.boardBody}>
                    <Text style={styles.boardName}>{board.name}</Text>
                    <Text style={styles.boardMeta}>
                      {[board.location, `${board.item_count} place${board.item_count === 1 ? '' : 's'}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Text style={styles.boardChevron}>›</Text>
                </TouchableOpacity>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#1A1A1A', letterSpacing: -0.5 },
  newBoardBtn: {
    backgroundColor: CORAL,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  newBoardBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: '#F2F2F2',
    borderRadius: 12,
    padding: 3,
  },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  tabBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: { fontSize: 14, fontWeight: '500', color: '#8E8E93' },
  tabTextActive: { color: '#1A1A1A', fontWeight: '600' },

  scrollContent: { paddingBottom: 40 },
  centered: { paddingTop: 80, alignItems: 'center' },

  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 10 },
  emptySub: { fontSize: 14, color: '#8E8E93', textAlign: 'center', lineHeight: 21 },
  createFirstBtn: {
    marginTop: 24,
    backgroundColor: CORAL,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  createFirstBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  feed: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },

  // Board list
  boardList: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  boardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  boardIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardIcon: { fontSize: 22 },
  boardBody: { flex: 1 },
  boardName: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 3 },
  boardMeta: { fontSize: 13, color: '#8E8E93' },
  boardChevron: { fontSize: 20, color: '#C7C7CC', fontWeight: '300' },

  // Create form
  createForm: {
    margin: 20,
    backgroundColor: '#F7F7F7',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  createActions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#E8E8E8',
    alignItems: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#555' },
  createBtn: {
    flex: 2,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: CORAL,
    alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
