import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Share,
  Alert,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import {
  castVote,
  decideActivity,
  sendMessage,
  type Hangout,
  type HangoutMessage,
  type Participant,
  type Vote,
} from '../../lib/hangouts';
import { ActivityCard } from '../../components/ActivityCard';
import { syncActivities } from '../../lib/sync';
import type { Activity } from '../../lib/types';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const CORAL = '#FF5C5C';
const INDIGO = '#5B7FFF';
const GREEN = '#34C759';
const MIN_VISIBLE = 5;

// ── Pure helpers ──────────────────────────────────────────────────────────────

// Feel → category mapping. Covers all 12 categories across 4 natural buckets.
// "food" combines eating and nightlife (both "going out"). "outdoors" and "games"
// are deliberately separate since a park and a bowling alley are very different asks.
const FEEL_CATS: Record<string, string[]> = {
  food:     ['Food & Drink', 'Nightlife'],
  outdoors: ['Outdoors'],  // strictly outdoor place types only (parks, beaches, hikes, etc.)
  games:    ['Games & Hobbies', 'Adventure/Thrill', 'Family Fun', 'Events'],
  arts:     ['Movies', 'Arts & Culture', 'Shopping', 'Wellness', 'Seasonal/Unique'],
};

// Time-of-day → which categories are realistically open then.
// Nightlife only appears evening/late-night; Outdoors drops off after dark; etc.
const TOD_CATS: Record<string, string[]> = {
  morning:    ['Outdoors', 'Wellness', 'Food & Drink', 'Arts & Culture', 'Shopping', 'Family Fun'],
  afternoon:  ['Outdoors', 'Food & Drink', 'Shopping', 'Arts & Culture', 'Family Fun',
               'Games & Hobbies', 'Adventure/Thrill', 'Events', 'Movies', 'Wellness', 'Seasonal/Unique'],
  evening:    ['Food & Drink', 'Nightlife', 'Movies', 'Arts & Culture', 'Events',
               'Games & Hobbies', 'Adventure/Thrill', 'Seasonal/Unique'],
  late_night: ['Nightlife', 'Games & Hobbies', 'Food & Drink'],
};

// Maps every commitment string used in sync.ts to its maximum duration in hours.
// Used for numeric comparison rather than fragile string matching.
const COMMITMENT_MAX_HRS: Record<string, number> = {
  '30 min-1 hr':  1,
  '30 min-2 hrs': 2,
  '~1 hr':        1,
  '1-2 hrs':      2,
  '~2 hrs':       2,
  '1-3 hrs':      3,
  '2-3 hrs':      3,
  '~3 hrs':       3,
  '2-4 hrs':      4,
  '~4 hrs':       4,
  '3-5 hrs':      5,
  '2-6 hrs':      6,
  '3-6 hrs':      6,
};
function commitmentMaxHrs(s: string): number { return COMMITMENT_MAX_HRS[s] ?? 3; }

function plurality<T extends string>(arr: (T | null | undefined)[]): T | null {
  const counts: Partial<Record<string, number>> = {};
  for (const v of arr) { if (v) counts[v] = (counts[v] ?? 0) + 1; }
  let best: T | null = null, top = 0;
  for (const [k, c] of Object.entries(counts)) {
    if ((c ?? 0) > top) { best = k as T; top = c ?? 0; }
  }
  return best;
}

function filterActivities(base: Activity[], votes: Vote[]): Activity[] {
  if (votes.length === 0 || base.length === 0) return base;

  const winFeel = plurality(votes.map(v => v.vibe));    // feel stored in vibe column
  const winTime = plurality(votes.map(v => v.budget));   // duration stored in budget column
  const winTOD  = plurality(votes.map(v => v.setting)); // time-of-day stored in setting column

  let result = base;

  // 1. Feel filter: narrow by category group
  if (winFeel && FEEL_CATS[winFeel]) {
    const f = result.filter(a => FEEL_CATS[winFeel]!.includes(a.category));
    if (f.length >= MIN_VISIBLE) result = f;
  }

  // 2. Time-of-day filter: drop categories not open at that hour
  if (winTOD && TOD_CATS[winTOD]) {
    const f = result.filter(a => TOD_CATS[winTOD]!.includes(a.category));
    if (f.length >= MIN_VISIBLE) result = f;
  }

  // 3. Duration filter: numeric comparison on max hours
  if (winTime) {
    const f = result.filter(a => {
      const h = commitmentMaxHrs(a.commitment);
      if (winTime === 'quick')  return h <= 2;
      if (winTime === 'medium') return h >= 1 && h <= 4;
      if (winTime === 'long')   return h >= 3;
      return true;
    });
    if (f.length >= MIN_VISIBLE) result = f;
  }

  return result;
}

function rowToActivity(row: any): Activity {
  return {
    id: String(row.id),
    title: row.title,
    subtitle: row.subtitle,
    category: row.category,
    score: row.score,
    imageUrl: row.photo_url,
    distance: row.distance,
    commitment: row.commitment,
    good_for: row.good_for ?? [],
  };
}

// ── Vote option definitions ───────────────────────────────────────────────────

const FEEL_OPTIONS = [
  { value: 'food',     label: 'Food & drinks',  emoji: '🍽️', desc: 'Restaurants, bars & nightlife' },
  { value: 'outdoors', label: 'Get outside',    emoji: '🌿', desc: 'Parks, hiking & adventure'     },
  { value: 'games',    label: 'Games & fun',    emoji: '🎮', desc: 'Bowling, arcades & more'       },
  { value: 'arts',     label: 'Arts & explore', emoji: '🎭', desc: 'Movies, culture & shopping'    },
] as const;
const TOD_OPTIONS = [
  { value: 'morning',    label: 'Morning',    emoji: '🌅', desc: 'Before noon'   },
  { value: 'afternoon',  label: 'Afternoon',  emoji: '☀️',  desc: 'Noon – 6 pm'  },
  { value: 'evening',    label: 'Evening',    emoji: '🌆', desc: '6 pm – 10 pm' },
  { value: 'late_night', label: 'Late night', emoji: '🌙', desc: 'After 10 pm'  },
] as const;
const TIME_OPTIONS = [
  { value: 'quick',  label: 'Quick',      emoji: '⚡', desc: 'Under 2 hours' },
  { value: 'medium', label: 'Few hours',  emoji: '🌅', desc: '2–4 hours'     },
  { value: 'long',   label: 'All day',    emoji: '🎉', desc: '4+ hours'      },
] as const;

// ── Animation value type ──────────────────────────────────────────────────────

type AnimPair = { opacity: Animated.Value; slide: Animated.Value };

// ── Component ─────────────────────────────────────────────────────────────────

export default function HangoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [hangout, setHangout] = useState<Hangout | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [myVote, setMyVote] = useState<Vote | null>(null);
  const [allVotes, setAllVotes] = useState<Vote[]>([]);
  const [baseActivities, setBaseActivities] = useState<Activity[]>([]);
  const [displayedActivities, setDisplayedActivities] = useState<Activity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [votingField, setVotingField] = useState<string | null>(null);
  const [messages, setMessages] = useState<HangoutMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [myDisplayName, setMyDisplayName] = useState<string>('');
  const chatListRef = useRef<ScrollView>(null);

  // Stable refs for animation callbacks and Realtime handlers
  const baseRef = useRef<Activity[]>([]);
  const displayedRef = useRef<Activity[]>([]);
  const lastNonEmptyRef = useRef<Activity[]>([]);
  const allVotesRef = useRef<Vote[]>([]);
  const hangoutLatRef = useRef<number | null>(null);
  const hangoutLngRef = useRef<number | null>(null);
  const animatingRef = useRef(false);
  const animMap = useRef<Map<string, AnimPair>>(new Map());
  const hasSyncedRef = useRef(false); // prevent repeat auto-syncs per screen visit
  const fetchAllRef = useRef<() => void>(() => {});

  // Keep refs in sync with state / callbacks
  useEffect(() => { baseRef.current = baseActivities; }, [baseActivities]);
  useEffect(() => { displayedRef.current = displayedActivities; }, [displayedActivities]);
  useEffect(() => { allVotesRef.current = allVotes; }, [allVotes]);

  // Auto-sync activities for the hangout location if none are found yet.
  // Uses a ref for fetchAll to avoid a circular dependency (fetchAll is declared below).
  useEffect(() => {
    const lat = hangoutLatRef.current;
    const lng = hangoutLngRef.current;
    if (loading || syncing || hasSyncedRef.current) return;
    if (baseActivities.length === 0 && lat !== null && lng !== null) {
      hasSyncedRef.current = true;
      setSyncing(true);
      syncActivities(lat, lng)
        .then(() => fetchAllRef.current())
        .catch(console.warn)
        .finally(() => setSyncing(false));
    }
  }, [baseActivities.length, loading, syncing]);

  // ── Animation helpers ─────────────────────────────────────────────────────

  const getAnim = useCallback((actId: string): AnimPair => {
    if (!animMap.current.has(actId)) {
      animMap.current.set(actId, {
        opacity: new Animated.Value(1),
        slide: new Animated.Value(0),
      });
    }
    return animMap.current.get(actId)!;
  }, []);

  // Fades out removed items, then reflows the list. After completion, re-checks
  // whether further narrowing is needed (handles votes that arrived mid-animation).
  const animateToFiltered = useCallback(async (newFiltered: Activity[]) => {
    const current = displayedRef.current;
    const newIds = new Set(newFiltered.map(a => a.id));
    const removingIds = current.map(a => a.id).filter(id => !newIds.has(id));

    if (removingIds.length === 0) return;
    if (animatingRef.current) return;
    animatingRef.current = true;

    await Promise.all(
      removingIds.map(id =>
        new Promise<void>(resolve => {
          const anim = getAnim(id);
          Animated.parallel([
            Animated.timing(anim.opacity, { toValue: 0, duration: 320, useNativeDriver: true }),
            Animated.timing(anim.slide,   { toValue: -16, duration: 320, useNativeDriver: true }),
          ]).start(() => resolve());
        }),
      ),
    );

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    displayedRef.current = newFiltered;
    setDisplayedActivities(newFiltered);
    removingIds.forEach(id => animMap.current.delete(id));

    animatingRef.current = false;

    // Re-check: if votes changed while we were animating, apply the latest filter
    const latestFiltered = filterActivities(baseRef.current, allVotesRef.current);
    const latestEffective = latestFiltered.length >= MIN_VISIBLE
      ? latestFiltered
      : lastNonEmptyRef.current;
    const currentIds = displayedRef.current.map(a => a.id);
    const latestIds = new Set(latestEffective.map(a => a.id));
    if (currentIds.some(cid => !latestIds.has(cid))) {
      await animateToFiltered(latestEffective);
    }
  }, [getAnim]);

  // Computes the effective filtered set and triggers animation if needed
  const handleVoteUpdate = useCallback((votes: Vote[]) => {
    const filtered = filterActivities(baseRef.current, votes);
    const effective = filtered.length >= MIN_VISIBLE ? filtered : lastNonEmptyRef.current;
    if (filtered.length >= MIN_VISIBLE) lastNonEmptyRef.current = filtered;
    animateToFiltered(effective); // fire-and-forget; safe to not await
  }, [animateToFiltered]);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchParticipants = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from('hangout_participants').select('*').eq('hangout_id', id);
    setParticipants((data ?? []) as Participant[]);
  }, [id]);

  const fetchVotes = useCallback(async () => {
    if (!id) return;
    const [{ data: { user } }, { data: rows }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('hangout_votes').select('*').eq('hangout_id', id),
    ]);
    const votes = (rows ?? []) as Vote[];
    setAllVotes(votes);
    allVotesRef.current = votes;
    if (user) setMyVote(votes.find(v => v.user_id === user.id) ?? null);
    handleVoteUpdate(votes);
  }, [id, handleVoteUpdate]);

  // Stable refs so the Realtime channel's callbacks never go stale
  const fetchVotesRef = useRef(fetchVotes);
  const fetchParticipantsRef = useRef(fetchParticipants);
  useEffect(() => { fetchVotesRef.current = fetchVotes; }, [fetchVotes]);
  useEffect(() => { fetchParticipantsRef.current = fetchParticipants; }, [fetchParticipants]);

  const fetchMessages = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('hangout_messages')
      .select('*')
      .eq('hangout_id', id)
      .order('created_at', { ascending: true })
      .limit(200);
    setMessages((data ?? []) as HangoutMessage[]);
  }, [id]);

  const handleSendMessage = useCallback(async () => {
    const text = chatText.trim();
    if (!text || !id || !currentUserId) return;
    const displayName = myDisplayName || 'Friend';
    setSendingMessage(true);
    setChatText('');
    try {
      await sendMessage(id, currentUserId, displayName, text);
      // Show immediately without waiting for Realtime
      fetchMessages();
    } catch (e: any) {
      setChatText(text);
      Alert.alert('Message not sent', e?.message ?? 'Check your connection and try again.');
    } finally {
      setSendingMessage(false);
    }
  }, [chatText, id, currentUserId, myDisplayName]);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch hangout first so we have its stored lat/lng before querying activities
    const { data: hangoutRow } = await supabase.from('hangouts').select('*').eq('id', id).single();
    if (!hangoutRow) return;

    const lat: number | null = hangoutRow.latitude ?? null;
    const lng: number | null = hangoutRow.longitude ?? null;
    hangoutLatRef.current = lat;
    hangoutLngRef.current = lng;

    const [{ data: participantRows }, { data: voteRows }, { data: activityRows }] =
      await Promise.all([
        supabase.from('hangout_participants').select('*').eq('hangout_id', id),
        supabase.from('hangout_votes').select('*').eq('hangout_id', id),
        (async () => {
          let q = supabase.from('activities').select('*').order('score', { ascending: false }).limit(150);
          if (lat !== null && lng !== null) {
            const latDelta = 25 / 69;
            const lngDelta = latDelta / Math.cos((lat * Math.PI) / 180);
            q = q
              .gte('latitude', lat - latDelta).lte('latitude', lat + latDelta)
              .gte('longitude', lng - lngDelta).lte('longitude', lng + lngDelta);
          }
          return q;
        })(),
      ]);

    setCurrentUserId(user.id);
    setHangout(hangoutRow as Hangout);
    setParticipants((participantRows ?? []) as Participant[]);

    const votes = (voteRows ?? []) as Vote[];
    setAllVotes(votes);
    allVotesRef.current = votes;
    setMyVote(votes.find(v => v.user_id === user.id) ?? null);

    // Capture display name for chat from participant row
    const myParticipant = (participantRows ?? []).find((p: any) => p.user_id === user.id);
    if (myParticipant?.display_name) setMyDisplayName(myParticipant.display_name);

    // Build base activity list
    const base = (activityRows ?? []).map(rowToActivity);

    // Apply existing votes without animation for initial render
    const filtered = filterActivities(base, votes);
    const initial = filtered.length >= MIN_VISIBLE ? filtered : base;

    baseRef.current = base;
    displayedRef.current = initial;
    lastNonEmptyRef.current = initial;
    setBaseActivities(base);
    setDisplayedActivities(initial);
    // Pre-warm animation values for every initially visible activity
    initial.forEach(a => getAnim(a.id));

    if (hangoutRow.status === 'decided' && hangoutRow.selected_activity_id) {
      const { data: actRow } = await supabase
        .from('activities').select('*').eq('id', hangoutRow.selected_activity_id).single();
      setSelectedActivity(actRow ? rowToActivity(actRow) : null);
    }
  }, [id, getAnim]);

  useEffect(() => { fetchAllRef.current = fetchAll; }, [fetchAll]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAll(), fetchMessages()]).finally(() => setLoading(false));
  }, [fetchAll, fetchMessages]);

  // ── Realtime ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`hangout:${id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'hangout_votes', filter: `hangout_id=eq.${id}` },
        () => { fetchVotesRef.current(); })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'hangout_participants', filter: `hangout_id=eq.${id}` },
        () => { fetchParticipantsRef.current(); })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'hangouts', filter: `id=eq.${id}` },
        async (payload) => {
          const updated = payload.new as Hangout;
          setHangout(updated);
          if (updated.status === 'decided' && updated.selected_activity_id) {
            const { data: actRow } = await supabase
              .from('activities').select('*').eq('id', updated.selected_activity_id).single();
            setSelectedActivity(actRow ? rowToActivity(actRow) : null);
          }
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'hangout_messages', filter: `hangout_id=eq.${id}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new as HangoutMessage]);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleVote = useCallback(async (field: 'vibe' | 'setting' | 'budget', value: string) => {
    if (!id) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setVotingField(field + value);

    const optimistic: Vote = {
      ...(myVote ?? { id: '', hangout_id: id, user_id: user.id, vibe: null, setting: null, budget: null }),
      [field]: value,
    };
    const newVotes = [...allVotesRef.current.filter(v => v.user_id !== user.id), optimistic];
    allVotesRef.current = newVotes;
    setMyVote(optimistic);
    setAllVotes(newVotes);

    handleVoteUpdate(newVotes); // fire-and-forget — animate immediately for the voter

    await castVote(id, user.id, field, value);
    setVotingField(null);
  }, [id, myVote, handleVoteUpdate]);

  const handleDecide = useCallback(async (activity: Activity) => {
    if (!id) return;
    Alert.alert("We're going here! 🎉", `Lock in "${activity.title}" for the whole group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: '🎉 Lock it in!',
        onPress: async () => {
          setDeciding(activity.id);
          try {
            await decideActivity(id, activity.id);

            // Optimistic update — don't rely on Realtime alone
            setHangout(prev => prev ? { ...prev, status: 'decided', selected_activity_id: activity.id } : prev);
            setSelectedActivity(activity);

            // Re-fetch to confirm DB state
            const { data: confirmed } = await supabase.from('hangouts').select('*').eq('id', id).single();
            if (confirmed) setHangout(confirmed as Hangout);

            // Auto-post address to group chat so everyone sees it
            const displayName = myDisplayName || 'Friend';
            const addressLine = [activity.subtitle, activity.distance].filter(Boolean).join(' · ');
            await sendMessage(
              id, currentUserId!, displayName,
              `🎉 We're going to ${activity.title}!\n📍 ${addressLine}`,
            ).catch(() => {});
          } catch (e: any) {
            Alert.alert('Error locking in', e.message ?? 'Something went wrong. Try again.');
            setDeciding(null);
            return;
          }
          setDeciding(null);
        },
      },
    ]);
  }, [id, myDisplayName, currentUserId]);

  const handleShare = useCallback(async () => {
    if (!hangout) return;
    const activityLine = selectedActivity
      ? `\n\n📍 We're going to: ${selectedActivity.title}\n${selectedActivity.subtitle}`
      : '';
    await Share.share({
      message: `Join my hangout on Verve! Code: ${hangout.join_code}${activityLine}\n\nOpen Verve → "Plan with friends" → "Join with a code"`,
    });
  }, [hangout, selectedActivity]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  // ── Sub-components ────────────────────────────────────────────────────────

  function VoteOptionRow<T extends string>({
    label, options, field, current,
  }: {
    label: string;
    options: readonly { value: T; label: string; emoji: string; desc: string }[];
    field: 'vibe' | 'setting' | 'budget';
    current: T | null | undefined;
  }) {
    return (
      <View style={styles.voteBlock}>
        <Text style={styles.voteBlockLabel}>{label}</Text>
        <View style={styles.voteOptionsRow}>
          {options.map(opt => {
            const selected = current === opt.value;
            const busy = votingField === field + opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.voteCard, { flex: 1 }, selected && styles.voteCardSelected]}
                onPress={() => handleVote(field, opt.value)}
                disabled={!!votingField}
                activeOpacity={0.75}
              >
                {busy
                  ? <ActivityIndicator size="small" color={selected ? '#fff' : CORAL} />
                  : <>
                      <Text style={styles.voteCardEmoji}>{opt.emoji}</Text>
                      <Text style={[styles.voteCardLabel, selected && styles.voteCardLabelSelected]}>{opt.label}</Text>
                      <Text style={[styles.voteCardDesc,  selected && styles.voteCardDescSelected]}>{opt.desc}</Text>
                    </>
                }
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  function TallyRow({
    label, votes, options,
  }: {
    label: string;
    votes: (string | null | undefined)[];
    options: readonly { value: string; label: string }[];
  }) {
    const filled = votes.filter(Boolean) as string[];
    if (filled.length === 0) return null;
    const counts: Record<string, number> = {};
    filled.forEach(v => { counts[v] = (counts[v] ?? 0) + 1; });
    const sorted = options
      .filter(o => counts[o.value] > 0)
      .sort((a, b) => (counts[b.value] ?? 0) - (counts[a.value] ?? 0));
    return (
      <View style={styles.tallyRow}>
        <Text style={styles.tallyLabel}>{label}</Text>
        <View style={styles.tallyValues}>
          {sorted.map((o, i) => (
            <View key={o.value} style={[styles.tallyChip, i === 0 && styles.tallyChipWinner]}>
              <Text style={[styles.tallyChipText, i === 0 && styles.tallyChipTextWinner]}>
                {o.label} · <Text style={styles.tallyCount}>{counts[o.value]}</Text>
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color={CORAL} /></View>
      </SafeAreaView>
    );
  }

  if (!hangout) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TouchableOpacity style={styles.backBtnNav} onPress={() => router.back()}>
          <Text style={styles.backBtnNavText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.loadingWrap}>
          <Text style={styles.errorText}>Hangout not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const decided = hangout.status === 'decided';
  const votedCount = allVotes.filter(v => v.vibe || v.setting || v.budget).length;
  const hasVotes = allVotes.length > 0;
  const narrowed = baseActivities.length > displayedActivities.length;

  return (
    <KeyboardAvoidingView
      style={styles.kavWrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.navHeader}>
        <TouchableOpacity style={styles.backBtnNav} onPress={() => router.back()}>
          <Text style={styles.backBtnNavText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>{hangout.title ?? 'Hangout'}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CORAL} />}
      >
        {/* ── Info card ── */}
        <View style={styles.card}>
          {hangout.title ? <Text style={styles.hangoutTitle}>{hangout.title}</Text> : null}
          <View style={styles.codeRow}>
            <View>
              <Text style={styles.codeLabel}>Invite code</Text>
              <Text style={styles.codeValue}>{hangout.join_code.split('').join(' ')}</Text>
              {hangout.city_name && <Text style={styles.hangoutCity}>📍 {hangout.city_name}</Text>}
            </View>
            <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.75}>
              <Text style={styles.shareBtnText}>Share 🔗</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.participantsRow}>
            {participants.map(p => (
              <View key={p.id} style={styles.participantChip}>
                <View style={styles.participantAvatar}>
                  <Text style={styles.participantAvatarText}>{(p.display_name ?? '?').charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.participantName} numberOfLines={1}>{p.display_name ?? 'Friend'}</Text>
              </View>
            ))}
          </View>
          {votedCount > 0 && (
            <View style={styles.voteProgressRow}>
              <View style={styles.voteProgressBar}>
                <View style={[styles.voteProgressFill, { width: `${(votedCount / Math.max(participants.length, 1)) * 100}%` as any }]} />
              </View>
              <Text style={styles.voteProgressText}>{votedCount} of {participants.length} voted</Text>
            </View>
          )}
        </View>

        {/* ── Decided banner ── */}
        {decided && selectedActivity && (
          <View style={styles.decidedBanner}>
            <View style={styles.decidedTop}>
              <Text style={styles.decidedEmoji}>🎉</Text>
              <View style={styles.decidedBody}>
                <Text style={styles.decidedEyebrow}>You're all going to</Text>
                <Text style={styles.decidedPlace}>{selectedActivity.title}</Text>
              </View>
            </View>
            <View style={styles.decidedAddressRow}>
              <Text style={styles.decidedAddress}>📍 {selectedActivity.subtitle}</Text>
              {selectedActivity.distance ? (
                <View style={styles.decidedDistanceBadge}>
                  <Text style={styles.decidedDistanceText}>{selectedActivity.distance}</Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity style={styles.decidedShareBtn} onPress={handleShare} activeOpacity={0.8}>
              <Text style={styles.decidedShareBtnText}>Share address with friends 🔗</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Your vote ── */}
        {!decided && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your vote</Text>
            <VoteOptionRow label="What are you feeling?" options={FEEL_OPTIONS} field="vibe"    current={myVote?.vibe} />
            <VoteOptionRow label="What time?"           options={TOD_OPTIONS}  field="setting" current={myVote?.setting} />
            <VoteOptionRow label="How long?"            options={TIME_OPTIONS} field="budget"  current={myVote?.budget} />
          </View>
        )}

        {/* ── Live tally ── */}
        {hasVotes && (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Results so far</Text>
              <View style={styles.liveDot} />
              <Text style={styles.liveLabel}>Live</Text>
            </View>
            <TallyRow label="Feeling"  votes={allVotes.map(v => v.vibe)}    options={FEEL_OPTIONS} />
            <TallyRow label="Time"     votes={allVotes.map(v => v.setting)} options={TOD_OPTIONS} />
            <TallyRow label="How long" votes={allVotes.map(v => v.budget)}  options={TIME_OPTIONS} />
          </View>
        )}

        {/* ── Syncing state for new locations ── */}
        {syncing && (
          <View style={styles.syncingBanner}>
            <ActivityIndicator size="small" color={CORAL} />
            <Text style={styles.syncingText}>Finding places near this location…</Text>
          </View>
        )}

        {/* ── Live narrowing list ── */}
        {baseActivities.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>
                {hasVotes
                  ? `${displayedActivities.length} of ${baseActivities.length} activities`
                  : 'All nearby activities'}
              </Text>
              <View style={styles.liveDot} />
              <Text style={styles.liveLabel}>{hasVotes ? 'Narrowing' : 'Live'}</Text>
            </View>
            {narrowed && (
              <Text style={styles.cardSub}>
                {baseActivities.length - displayedActivities.length} filtered out by group votes
              </Text>
            )}
            {!hasVotes && (
              <Text style={styles.cardSub}>Vote above — the list narrows as preferences emerge</Text>
            )}

            {displayedActivities.map(activity => {
              const anim = getAnim(activity.id);
              return (
                <Animated.View
                  key={activity.id}
                  style={{ opacity: anim.opacity, transform: [{ translateY: anim.slide }] }}
                >
                  <ActivityCard activity={activity} />
                  {!decided && (
                    <TouchableOpacity
                      style={[styles.decideBtn, deciding === activity.id && styles.decideBtnBusy]}
                      onPress={() => handleDecide(activity)}
                      disabled={!!deciding}
                      activeOpacity={0.85}
                    >
                      {deciding === activity.id
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.decideBtnText}>🎉 We're going here!</Text>
                      }
                    </TouchableOpacity>
                  )}
                </Animated.View>
              );
            })}
          </View>
        )}

        {baseActivities.length === 0 && (
          <View style={styles.emptyHint}>
            <Text style={styles.emptyHintText}>No activities found near this location.</Text>
          </View>
        )}

        {/* ── Group chat ── */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>Group Chat</Text>
            <View style={styles.liveDot} />
            <Text style={styles.liveLabel}>Live</Text>
          </View>

          <ScrollView
            ref={chatListRef}
            style={styles.chatList}
            contentContainerStyle={styles.chatListContent}
            onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => chatListRef.current?.scrollToEnd({ animated: false })}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {messages.length === 0
              ? <Text style={styles.chatEmptyText}>No messages yet. Say hi!</Text>
              : messages.map(item => {
                  const isMe = item.user_id === currentUserId;
                  const time = new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return (
                    <View key={item.id} style={[styles.chatBubbleWrap, isMe && styles.chatBubbleWrapMe]}>
                      <Text style={[styles.chatSenderName, isMe && styles.chatSenderNameMe]}>
                        {isMe ? 'You' : item.display_name}
                      </Text>
                      <View style={[styles.chatBubble, isMe && styles.chatBubbleMe]}>
                        <Text style={[styles.chatBubbleText, isMe && styles.chatBubbleTextMe]}>{item.content}</Text>
                      </View>
                      <Text style={[styles.chatTimestamp, isMe && styles.chatTimestampMe]}>{time}</Text>
                    </View>
                  );
                })
            }
          </ScrollView>

          <View style={styles.chatInputRow}>
            <TextInput
              style={styles.chatInput}
              value={chatText}
              onChangeText={setChatText}
              placeholder="Say something..."
              placeholderTextColor="#8E8E93"
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={handleSendMessage}
              maxLength={1000}
              editable={!sendingMessage}
            />
            <TouchableOpacity
              style={[styles.chatSendBtn, (!chatText.trim() || sendingMessage) && styles.chatSendBtnDisabled]}
              onPress={handleSendMessage}
              disabled={!chatText.trim() || sendingMessage}
              activeOpacity={0.75}
            >
              <Text style={styles.chatSendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F7F9' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 16, color: '#8E8E93', textAlign: 'center' },

  navHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  backBtnNav: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backBtnNavText: { fontSize: 28, color: '#1A1A1A', fontWeight: '300', lineHeight: 32 },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#1A1A1A' },

  scrollContent: { padding: 16, paddingBottom: 48, gap: 12 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  cardSub: { fontSize: 12, color: '#8E8E93', marginTop: -8 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN },
  liveLabel: { fontSize: 12, fontWeight: '600', color: GREEN },
  syncingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF5F5', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#FFE0E0',
  },
  syncingText: { fontSize: 14, color: CORAL, fontWeight: '500', flex: 1 },

  hangoutTitle: { fontSize: 20, fontWeight: '800', color: '#1A1A1A', letterSpacing: -0.3 },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  codeLabel: { fontSize: 11, fontWeight: '600', color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  codeValue: { fontSize: 28, fontWeight: '800', color: '#1A1A1A', letterSpacing: 4 },
  hangoutCity: { fontSize: 13, color: '#8E8E93', fontWeight: '500', marginTop: 4 },
  shareBtn: { backgroundColor: '#EEF2FF', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  shareBtnText: { fontSize: 14, fontWeight: '700', color: INDIGO },

  participantsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  participantChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F2F2F2', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 10 },
  participantAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: CORAL, alignItems: 'center', justifyContent: 'center' },
  participantAvatarText: { fontSize: 11, fontWeight: '700', color: '#fff', lineHeight: 14 },
  participantName: { fontSize: 13, fontWeight: '600', color: '#1A1A1A', maxWidth: 90 },

  voteProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  voteProgressBar: { flex: 1, height: 4, backgroundColor: '#F0F0F0', borderRadius: 2, overflow: 'hidden' },
  voteProgressFill: { height: '100%', backgroundColor: CORAL, borderRadius: 2 },
  voteProgressText: { fontSize: 12, color: '#8E8E93', fontWeight: '500' },

  decidedBanner: {
    backgroundColor: GREEN, borderRadius: 16, padding: 18, gap: 12,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 4,
  },
  decidedTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  decidedEmoji: { fontSize: 36 },
  decidedBody: { flex: 1 },
  decidedEyebrow: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)', marginBottom: 4 },
  decidedPlace: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  decidedAddressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  decidedAddress: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '500', lineHeight: 18 },
  decidedDistanceBadge: { backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  decidedDistanceText: { fontSize: 12, color: '#fff', fontWeight: '700' },
  decidedShareBtn: {
    backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  decidedShareBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  voteBlock: { gap: 8 },
  voteBlockLabel: { fontSize: 11, fontWeight: '600', color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.5 },
  voteOptionsRow: { flexDirection: 'row', gap: 8 },
  voteCard: {
    backgroundColor: '#F7F7F9', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 6,
    alignItems: 'center', gap: 4,
    borderWidth: 2, borderColor: 'transparent',
  },
  voteCardSelected: {
    backgroundColor: CORAL, borderColor: CORAL,
    shadowColor: CORAL, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 3,
  },
  voteCardEmoji: { fontSize: 20 },
  voteCardLabel: { fontSize: 12, fontWeight: '700', color: '#1A1A1A', textAlign: 'center' },
  voteCardLabelSelected: { color: '#fff' },
  voteCardDesc: { fontSize: 10, color: '#8E8E93', textAlign: 'center' },
  voteCardDescSelected: { color: 'rgba(255,255,255,0.75)' },

  tallyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tallyLabel: { fontSize: 13, fontWeight: '600', color: '#8E8E93', width: 56 },
  tallyValues: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
  tallyChip: { backgroundColor: '#F2F2F2', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  tallyChipWinner: { backgroundColor: '#FFF0F0', borderWidth: 1.5, borderColor: CORAL },
  tallyChipText: { fontSize: 13, fontWeight: '500', color: '#555' },
  tallyChipTextWinner: { color: CORAL, fontWeight: '700' },
  tallyCount: { fontWeight: '800' },

  decideBtn: {
    backgroundColor: GREEN, borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', marginTop: 4,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 3,
  },
  decideBtnBusy: { opacity: 0.6 },
  decideBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  emptyHint: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 32 },
  emptyHintText: { fontSize: 14, color: '#8E8E93', textAlign: 'center', lineHeight: 20 },

  kavWrapper: { flex: 1 },

  chatList: { height: 260 },
  chatListContent: { paddingVertical: 4, gap: 10, flexGrow: 1, justifyContent: 'flex-end' },

  chatBubbleWrap: { maxWidth: '78%', alignSelf: 'flex-start', gap: 2 },
  chatBubbleWrapMe: { alignSelf: 'flex-end' },

  chatSenderName: { fontSize: 11, fontWeight: '600', color: '#8E8E93', marginLeft: 4, marginBottom: 1 },
  chatSenderNameMe: { textAlign: 'right', marginLeft: 0, marginRight: 4 },

  chatBubble: {
    backgroundColor: '#F2F2F2', borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingVertical: 8, paddingHorizontal: 12,
  },
  chatBubbleMe: {
    backgroundColor: CORAL, borderRadius: 16,
    borderBottomRightRadius: 4,
  },
  chatBubbleText: { fontSize: 14, color: '#1A1A1A', lineHeight: 20 },
  chatBubbleTextMe: { color: '#fff' },

  chatTimestamp: { fontSize: 10, color: '#8E8E93', marginLeft: 4 },
  chatTimestampMe: { textAlign: 'right', marginLeft: 0, marginRight: 4 },

  chatEmptyText: { fontSize: 13, color: '#8E8E93', textAlign: 'center', paddingVertical: 24 },

  chatInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 10,
  },
  chatInput: {
    flex: 1, backgroundColor: '#F7F7F9', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 9,
    fontSize: 14, color: '#1A1A1A',
    borderWidth: 1, borderColor: '#E8E8E8',
  },
  chatSendBtn: {
    backgroundColor: CORAL, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 9,
  },
  chatSendBtnDisabled: { opacity: 0.4 },
  chatSendBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
