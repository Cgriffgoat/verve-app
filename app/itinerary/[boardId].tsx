import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
  NestableScrollContainer,
  NestableDraggableFlatList,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../lib/supabase';
import {
  fetchItineraryItems,
  scheduleItem,
  unscheduleItem,
  reorderDay,
  updateBoardTemplate,
  type TripBoard,
  type ItineraryItem,
  type ItineraryTemplate,
} from '../../lib/boards';
import type { Activity } from '../../lib/types';

const CORAL = '#FF5C5C';
const INDIGO = '#5B7FFF';

const TEMPLATES: Record<ItineraryTemplate, { label: string; emoji: string; bg: string; card: string; text: string; accent: string }> = {
  minimal: { label: 'Minimal',   emoji: '🌿', bg: '#FFFFFF', card: '#F7F9F7', text: '#1A1A1A', accent: '#34C759' },
  sunset:  { label: 'Sunset',    emoji: '🌅', bg: '#FFF5EC', card: '#FFE8D6', text: '#3D2410', accent: '#FF8C42' },
  night:   { label: 'Night out', emoji: '🌙', bg: '#1A1128', card: '#2A1E40', text: '#FFFFFF', accent: '#B388FF' },
};

const TIME_SLOTS = [
  '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00',
  '19:00', '20:00', '21:00',
];

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function nextNDays(n: number): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ date: iso, label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) });
  }
  return out;
}

export default function ItineraryScreen() {
  const { boardId } = useLocalSearchParams<{ boardId: string }>();
  const router = useRouter();
  const viewShotRef = useRef<ViewShotRef>(null);

  const [board, setBoard] = useState<TripBoard | null>(null);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [schedulingActivity, setSchedulingActivity] = useState<Activity | null>(null);
  const [pickerDate, setPickerDate] = useState<string | null>(null);
  const [pickerTime, setPickerTime] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!boardId) return;
    const [{ data: boardRow }, itemRows] = await Promise.all([
      supabase.from('trip_boards').select('*').eq('id', boardId).single(),
      fetchItineraryItems(boardId),
    ]);
    if (boardRow) setBoard(boardRow as TripBoard);
    setItems(itemRows);
  }, [boardId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchData().finally(() => setLoading(false));
    }, [fetchData]),
  );

  const unscheduled = useMemo(() => items.filter(i => !i.scheduledDate), [items]);

  const byDate = useMemo(() => {
    const map: Record<string, ItineraryItem[]> = {};
    items.filter(i => i.scheduledDate).forEach(i => {
      const key = i.scheduledDate as string;
      (map[key] ??= []).push(i);
    });
    Object.values(map).forEach(list => list.sort((a, b) => a.sortOrder - b.sortOrder));
    return map;
  }, [items]);

  const sortedDates = useMemo(() => Object.keys(byDate).sort(), [byDate]);

  const openScheduler = (activity: Activity) => {
    setSchedulingActivity(activity);
    setPickerDate(null);
    setPickerTime(null);
  };

  const handleConfirmSchedule = async () => {
    if (!boardId || !schedulingActivity || !pickerDate) return;
    const dayCount = (byDate[pickerDate] ?? []).length;
    try {
      await scheduleItem(boardId, schedulingActivity.id, pickerDate, pickerTime, dayCount);
      setSchedulingActivity(null);
      fetchData();
    } catch (e: any) {
      Alert.alert('Could not schedule', e.message ?? 'Please try again.');
    }
  };

  const handleUnschedule = async (item: ItineraryItem) => {
    if (!boardId) return;
    try {
      await unscheduleItem(boardId, item.activity.id);
      fetchData();
    } catch (e: any) {
      Alert.alert('Could not update', e.message ?? 'Please try again.');
    }
  };

  const handleReorder = async (date: string, data: ItineraryItem[]) => {
    setItems(prev => {
      const others = prev.filter(i => i.scheduledDate !== date);
      const reindexed = data.map((it, idx) => ({ ...it, sortOrder: idx }));
      return [...others, ...reindexed];
    });
    if (!boardId) return;
    try {
      await reorderDay(boardId, data.map(i => i.activity.id));
    } catch {
      fetchData();
    }
  };

  const handleSelectTemplate = async (t: ItineraryTemplate) => {
    if (!boardId || !board) return;
    setBoard({ ...board, itinerary_template: t });
    try {
      await updateBoardTemplate(boardId, t);
    } catch {}
  };

  const handleDownload = async () => {
    if (!viewShotRef.current?.capture) return;
    setDownloading(true);
    try {
      const uri = await viewShotRef.current.capture();
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: board?.name ?? 'Itinerary' });
      } else {
        Alert.alert('Sharing not available', "Your device doesn't support sharing right now.");
      }
    } catch (e: any) {
      Alert.alert('Could not create image', e.message ?? 'Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const theme = TEMPLATES[board?.itinerary_template ?? 'minimal'];

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}><ActivityIndicator size="large" color={CORAL} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{board?.name ?? 'Itinerary'}</Text>
        <TouchableOpacity
          style={[styles.downloadBtn, downloading && styles.btnDisabled]}
          onPress={handleDownload}
          disabled={downloading || sortedDates.length === 0}
        >
          {downloading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.downloadBtnText}>Download</Text>
          }
        </TouchableOpacity>
      </View>

      <NestableScrollContainer contentContainerStyle={styles.scrollContent}>
        {/* Template picker */}
        <Text style={styles.sectionLabel}>Look</Text>
        <View style={styles.templateRow}>
          {(Object.keys(TEMPLATES) as ItineraryTemplate[]).map(key => {
            const t = TEMPLATES[key];
            const active = (board?.itinerary_template ?? 'minimal') === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.templateChip, { backgroundColor: t.card }, active && styles.templateChipActive]}
                onPress={() => handleSelectTemplate(key)}
              >
                <Text style={styles.templateEmoji}>{t.emoji}</Text>
                <Text style={[styles.templateLabel, { color: t.text }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Unscheduled */}
        {unscheduled.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Not scheduled yet</Text>
            <View style={styles.unscheduledList}>
              {unscheduled.map(item => (
                <TouchableOpacity
                  key={item.activity.id}
                  style={styles.unscheduledRow}
                  onPress={() => openScheduler(item.activity)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.unscheduledTitle} numberOfLines={1}>{item.activity.title}</Text>
                  <Text style={styles.unscheduledAdd}>+ Schedule</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Scheduled, by day */}
        {sortedDates.length === 0 && unscheduled.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🗓️</Text>
            <Text style={styles.emptyTitle}>Nothing saved to this board yet</Text>
            <Text style={styles.emptySub}>Save places to this trip board first, then build your itinerary here.</Text>
          </View>
        )}

        {sortedDates.map(date => (
          <View key={date} style={styles.daySection}>
            <Text style={styles.dayLabel}>{formatDateLabel(date)}</Text>
            <NestableDraggableFlatList
              data={byDate[date]}
              keyExtractor={(i: ItineraryItem) => i.activity.id}
              renderItem={({ item, drag, isActive }: RenderItemParams<ItineraryItem>) => (
                <TouchableOpacity
                  style={[styles.dayItem, isActive && styles.dayItemActive]}
                  onLongPress={drag}
                  delayLongPress={150}
                  activeOpacity={0.85}
                >
                  <View style={styles.dragHandle}><Text style={styles.dragHandleText}>⠿</Text></View>
                  <View style={styles.dayItemBody}>
                    <Text style={styles.dayItemTitle} numberOfLines={1}>{item.activity.title}</Text>
                    {item.scheduledTime && (
                      <Text style={styles.dayItemTime}>{formatTime(item.scheduledTime)}</Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => handleUnschedule(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
              onDragEnd={({ data }) => handleReorder(date, data)}
            />
          </View>
        ))}

        <Text style={styles.dragHint}>Long-press ⠿ to drag and reorder within a day</Text>
      </NestableScrollContainer>

      {/* Scheduling picker */}
      {schedulingActivity && (
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle} numberOfLines={1}>{schedulingActivity.title}</Text>

            <Text style={styles.pickerLabel}>Day</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerChipsRow}>
              {nextNDays(30).map(d => (
                <TouchableOpacity
                  key={d.date}
                  style={[styles.pickerChip, pickerDate === d.date && styles.pickerChipActive]}
                  onPress={() => setPickerDate(d.date)}
                >
                  <Text style={[styles.pickerChipText, pickerDate === d.date && styles.pickerChipTextActive]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.pickerLabel}>Time (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerChipsRow}>
              {TIME_SLOTS.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.pickerChip, pickerTime === t && styles.pickerChipActive]}
                  onPress={() => setPickerTime(pickerTime === t ? null : t)}
                >
                  <Text style={[styles.pickerChipText, pickerTime === t && styles.pickerChipTextActive]}>{formatTime(t)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.pickerActions}>
              <TouchableOpacity style={styles.pickerCancelBtn} onPress={() => setSchedulingActivity(null)}>
                <Text style={styles.pickerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerConfirmBtn, !pickerDate && styles.btnDisabled]}
                onPress={handleConfirmSchedule}
                disabled={!pickerDate}
              >
                <Text style={styles.pickerConfirmText}>Add to day</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Off-screen shareable card, captured by ViewShot */}
      <View style={styles.offscreen} pointerEvents="none">
        <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }}>
          <View style={[styles.shareCard, { backgroundColor: theme.bg }]}>
            <Text style={[styles.shareCardTitle, { color: theme.text }]}>{board?.name}</Text>
            {board?.location && <Text style={[styles.shareCardSub, { color: theme.text }]}>{board.location}</Text>}
            {sortedDates.map(date => (
              <View key={date} style={[styles.shareDayCard, { backgroundColor: theme.card }]}>
                <Text style={[styles.shareDayLabel, { color: theme.accent }]}>{formatDateLabel(date)}</Text>
                {byDate[date].map(item => (
                  <View key={item.activity.id} style={styles.shareItemRow}>
                    {item.scheduledTime && (
                      <Text style={[styles.shareItemTime, { color: theme.text }]}>{formatTime(item.scheduledTime)}</Text>
                    )}
                    <Text style={[styles.shareItemTitle, { color: theme.text }]} numberOfLines={1}>{item.activity.title}</Text>
                  </View>
                ))}
              </View>
            ))}
            <Text style={[styles.shareFooter, { color: theme.accent }]}>Planned with Vervi</Text>
          </View>
        </ViewShot>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 8,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 28, color: '#1A1A1A', fontWeight: '300', lineHeight: 32 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  downloadBtn: { backgroundColor: CORAL, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  downloadBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  btnDisabled: { opacity: 0.5 },

  scrollContent: { padding: 20, paddingBottom: 60, gap: 8 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#8E8E93',
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 4,
  },

  templateRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  templateChip: {
    flex: 1, alignItems: 'center', borderRadius: 14, paddingVertical: 12,
    borderWidth: 2, borderColor: 'transparent',
  },
  templateChipActive: { borderColor: CORAL },
  templateEmoji: { fontSize: 20, marginBottom: 4 },
  templateLabel: { fontSize: 12, fontWeight: '700' },

  unscheduledList: { gap: 8, marginBottom: 8 },
  unscheduledRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F7F7F9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
  },
  unscheduledTitle: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', flex: 1, marginRight: 10 },
  unscheduledAdd: { fontSize: 13, fontWeight: '700', color: INDIGO },

  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 },
  emptyEmoji: { fontSize: 44, marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 6, textAlign: 'center' },
  emptySub: { fontSize: 13, color: '#8E8E93', textAlign: 'center', lineHeight: 19 },

  daySection: { marginTop: 14 },
  dayLabel: { fontSize: 15, fontWeight: '800', color: '#1A1A1A', marginBottom: 8 },
  dayItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#F0F0F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  dayItemActive: { borderColor: CORAL, shadowOpacity: 0.15 },
  dragHandle: { width: 24, alignItems: 'center' },
  dragHandleText: { fontSize: 18, color: '#C7C7CC' },
  dayItemBody: { flex: 1 },
  dayItemTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  dayItemTime: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  removeText: { fontSize: 12, fontWeight: '600', color: CORAL },
  dragHint: { fontSize: 12, color: '#BDBDBD', textAlign: 'center', marginTop: 20 },

  pickerOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32, gap: 6,
  },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  pickerLabel: { fontSize: 12, fontWeight: '700', color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 6 },
  pickerChipsRow: { gap: 8, paddingRight: 20 },
  pickerChip: { backgroundColor: '#F2F2F2', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  pickerChipActive: { backgroundColor: CORAL },
  pickerChipText: { fontSize: 13, fontWeight: '600', color: '#1A1A1A' },
  pickerChipTextActive: { color: '#fff' },
  pickerActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  pickerCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#F2F2F2', alignItems: 'center' },
  pickerCancelText: { fontSize: 14, fontWeight: '600', color: '#555' },
  pickerConfirmBtn: { flex: 2, paddingVertical: 13, borderRadius: 12, backgroundColor: CORAL, alignItems: 'center' },
  pickerConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  offscreen: { position: 'absolute', top: 0, left: -9999, width: 375 },
  shareCard: { width: 375, padding: 24, gap: 12 },
  shareCardTitle: { fontSize: 24, fontWeight: '800' },
  shareCardSub: { fontSize: 13, opacity: 0.7, marginTop: -8 },
  shareDayCard: { borderRadius: 16, padding: 16, gap: 8 },
  shareDayLabel: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  shareItemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shareItemTime: { fontSize: 12, fontWeight: '700', width: 68 },
  shareItemTitle: { fontSize: 14, fontWeight: '600', flex: 1 },
  shareFooter: { fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 8 },
});
