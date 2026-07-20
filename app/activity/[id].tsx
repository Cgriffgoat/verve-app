import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import { ScoreBadge } from '../../components/ScoreBadge';
import { ReviewComposer } from '../../components/ReviewComposer';
import { ReviewCard } from '../../components/ReviewCard';
import { BoardPickerModal } from '../../components/BoardPickerModal';
import { ReportModal } from '../../components/ReportModal';
import { fetchBlockedUserIds } from '../../lib/moderation';
import type { Activity, Review } from '../../lib/types';

const COMPOSER_LAYOUT_Y_APPROX = 440; // pixels from top — enough to scroll past hero+photos

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CORAL = '#FF5C5C';
const HERO_HEIGHT = 280;

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const scrollRef = useRef<ScrollView>(null);

  const [activity, setActivity] = useState<Activity | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [reviewerName, setReviewerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [boardPickerVisible, setBoardPickerVisible] = useState(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [reportTarget, setReportTarget] = useState<Review | null>(null);

  const userReview = reviews.find(r => r.user_id === userId) ?? null;

  const handleEdit = (review: Review) => {
    setEditingReview(review);
    scrollRef.current?.scrollTo({ y: COMPOSER_LAYOUT_Y_APPROX, animated: true });
  };

  const handleDelete = (review: Review) => {
    Alert.alert(
      'Delete this review?',
      "This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('reviews').delete().eq('id', review.id);
            fetchData();
          },
        },
      ],
    );
  };

  const allPhotos = useMemo(() => {
    const urls: string[] = [];
    if (activity?.imageUrl) urls.push(activity.imageUrl);
    reviews.forEach(r => r.photos.forEach(p => urls.push(p)));
    return urls;
  }, [activity, reviews]);

  const scoreBreakdown = useMemo(() => {
    if (reviews.length === 0) {
      const s = activity?.score ?? 70;
      return { vibe: Math.min(100, s + 3), value: Math.max(0, s - 5), wouldReturn: Math.min(100, s + 7), crowdLevel: 62 };
    }
    const avg = (nums: number[]) => Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
    return {
      vibe: avg(reviews.map(r => r.vibe)),
      value: avg(reviews.map(r => r.value_score)),
      wouldReturn: avg(reviews.map(r => r.would_return)),
      crowdLevel: avg(reviews.map(r => r.crowd_level)),
    };
  }, [reviews, activity]);

  const topDescriptors = useMemo(() => {
    const counts: Record<string, number> = {};
    reviews.forEach(r => r.descriptors.forEach(d => { counts[d] = (counts[d] ?? 0) + 1; }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([d]) => d);
  }, [reviews]);

  const fetchData = useCallback(async () => {
    if (!id) return;

    const [
      { data: activityRow },
      { data: reviewRows },
      { data: { user } },
    ] = await Promise.all([
      supabase.from('activities').select('*').eq('id', id).single(),
      supabase.from('reviews').select('*').eq('activity_id', id).order('created_at', { ascending: false }),
      supabase.auth.getUser(),
    ]);

    if (activityRow) {
      setActivity({
        id: String(activityRow.id),
        title: activityRow.title,
        subtitle: activityRow.subtitle,
        category: activityRow.category,
        score: activityRow.score,
        imageUrl: activityRow.photo_url,
        distance: activityRow.distance,
        commitment: activityRow.commitment,
        weather: activityRow.weather ?? undefined,
      });
    }

    setReviews((reviewRows ?? []) as Review[]);
    setUserId(user?.id ?? null);
    setReviewerName(user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? null);
    if (user) fetchBlockedUserIds(user.id).then(setBlockedIds).catch(() => {});

    if (user && id) {
      const { data: saved } = await supabase
        .from('saved_items')
        .select('id')
        .match({ user_id: user.id, activity_id: id })
        .maybeSingle();
      setIsSaved(!!saved);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={CORAL} />
      </View>
    );
  }

  if (!activity) {
    return (
      <View style={styles.centered}>
        <TouchableOpacity style={[styles.backBtn, { top: insets.top + 12 }]} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={{ color: '#8E8E93' }}>Activity not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ── Hero ── */}
        <View style={styles.hero}>
          <Image source={{ uri: activity.imageUrl }} style={styles.heroImage} resizeMode="cover" />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.78)']}
            style={styles.heroGradient}
          >
            <View style={styles.heroBottom}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>{activity.title}</Text>
                <Text style={styles.heroSubtitle} numberOfLines={2}>{activity.subtitle}</Text>
              </View>
              <ScoreBadge score={activity.score} />
            </View>
          </LinearGradient>
          <TouchableOpacity
            style={[styles.backBtn, { top: insets.top + 12 }]}
            onPress={() => router.back()}
          >
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>
          {userId && (
            <TouchableOpacity
              style={[styles.saveBtn, { top: insets.top + 12 }]}
              onPress={() => setBoardPickerVisible(true)}
            >
              <Text style={styles.saveBtnText}>{isSaved ? '🔖' : '🏷️'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {userId && (
          <BoardPickerModal
            visible={boardPickerVisible}
            activityId={id ?? ''}
            userId={userId}
            isSaved={isSaved}
            onSaveToggle={async () => {
              if (isSaved) {
                await supabase.from('saved_items').delete().match({ user_id: userId, activity_id: id });
              } else {
                await supabase.from('saved_items').insert({ user_id: userId, activity_id: id });
              }
              setIsSaved(v => !v);
            }}
            onClose={() => setBoardPickerVisible(false)}
          />
        )}

        {/* ── Photo strip ── */}
        {allPhotos.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoStrip}
          >
            {allPhotos.map((uri, i) => (
              <Image key={i} source={{ uri }} style={styles.stripPhoto} resizeMode="cover" />
            ))}
          </ScrollView>
        )}

        {/* ── Content ── */}
        <View style={styles.content}>

          {/* ── Why this score ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Why this score</Text>
            <ScoreBar label="Vibe" value={scoreBreakdown.vibe} />
            <ScoreBar label="Value" value={scoreBreakdown.value} />
            <ScoreBar label="Would Return" value={scoreBreakdown.wouldReturn} />
            <ScoreBar label="Crowd Level" value={scoreBreakdown.crowdLevel} />
            {reviews.length === 0 && (
              <Text style={styles.noReviewsNote}>
                Based on initial score — be the first to review!
              </Text>
            )}
          </View>

          {/* ── What people liked ── */}
          {topDescriptors.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>What people liked</Text>
              <View style={styles.pillRow}>
                {topDescriptors.map(d => (
                  <View key={d} style={styles.pill}>
                    <Text style={styles.pillText}>{d}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── Rate it / Edit review ── */}
          {userId && (!userReview || editingReview) && (
            <ReviewComposer
              activityId={activity.id}
              userId={userId}
              category={activity.category}
              reviewerName={reviewerName}
              editingReview={editingReview ?? undefined}
              onCancelEdit={editingReview ? () => setEditingReview(null) : undefined}
              onSubmitted={() => { setEditingReview(null); fetchData(); }}
            />
          )}

          {/* ── Reviews ── */}
          {(() => {
            const visibleReviews = reviews.filter(r => !blockedIds.has(r.user_id));
            return visibleReviews.length > 0 ? (
              <>
                <Text style={styles.reviewsHeader}>
                  {visibleReviews.length} {visibleReviews.length === 1 ? 'review' : 'reviews'}
                </Text>
                {visibleReviews.map(review => (
                  <ReviewCard
                    key={review.id}
                    review={review}
                    isOwnReview={review.user_id === userId}
                    onEdit={() => handleEdit(review)}
                    onDelete={() => handleDelete(review)}
                    onReport={review.user_id === userId ? undefined : () => setReportTarget(review)}
                  />
                ))}
              </>
            ) : null;
          })()}
          {reviews.filter(r => !blockedIds.has(r.user_id)).length === 0 && (
            <View style={styles.noReviews}>
              <Text style={styles.noReviewsEmoji}>💬</Text>
              <Text style={styles.noReviewsTitle}>No reviews yet</Text>
              <Text style={styles.noReviewsSub}>Be the first to rate this place!</Text>
            </View>
          )}

        </View>
      </ScrollView>

      {userId && (
        <ReportModal
          visible={!!reportTarget}
          onClose={() => setReportTarget(null)}
          reporterId={userId}
          contentType="review"
          contentId={reportTarget?.id ?? ''}
          reportedUserId={reportTarget?.user_id}
          reportedUserName={reportTarget?.reviewer_name}
          onBlocked={() => {
            if (reportTarget) setBlockedIds(prev => new Set(prev).add(reportTarget.user_id));
          }}
        />
      )}
    </View>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? '#4CAF50' : value >= 60 ? '#F59E0B' : CORAL;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${value}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={[styles.barValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  scrollContent: { paddingBottom: 48 },

  // Hero
  hero: { height: HERO_HEIGHT, position: 'relative' },
  heroImage: { width: SCREEN_WIDTH, height: HERO_HEIGHT },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 160,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  heroBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  heroText: { flex: 1 },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 18,
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
    marginTop: -2,
  },
  saveBtn: {
    position: 'absolute',
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontSize: 18, lineHeight: 22 },

  // Photo strip
  photoStrip: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  stripPhoto: {
    width: 110,
    height: 78,
    borderRadius: 10,
  },

  // Content
  content: { paddingHorizontal: 16, gap: 16 },

  // Cards
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 14,
  },

  // Score bars
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  barLabel: {
    width: 96,
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#F0F0F0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  barValue: {
    width: 28,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  noReviewsNote: {
    fontSize: 12,
    color: '#BDBDBD',
    marginTop: 8,
    fontStyle: 'italic',
  },

  // Pills
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    backgroundColor: '#F2F2F2',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: { fontSize: 13, color: '#444', fontWeight: '500' },

  // Reviews section
  reviewsHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  noReviews: { alignItems: 'center', paddingVertical: 40 },
  noReviewsEmoji: { fontSize: 40, marginBottom: 12 },
  noReviewsTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  noReviewsSub: { fontSize: 14, color: '#8E8E93' },
});
