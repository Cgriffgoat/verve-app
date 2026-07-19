import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import {
  fetchUserBoards,
  createBoard,
  addToBoard,
  removeFromBoard,
  fetchBoardIdsForActivity,
  type TripBoard,
} from '../lib/boards';

const CORAL = '#FF5C5C';

interface Props {
  visible: boolean;
  activityId: string;
  userId: string;
  isSaved: boolean;
  onSaveToggle: () => void;
  onClose: () => void;
}

export function BoardPickerModal({
  visible,
  activityId,
  userId,
  isSaved,
  onSaveToggle,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();

  const [boards, setBoards] = useState<TripBoard[]>([]);
  const [boardIds, setBoardIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardLocation, setNewBoardLocation] = useState('');
  const [saving, setSaving] = useState<string | null>(null); // boardId being toggled

  const load = useCallback(async () => {
    setLoading(true);
    const [boardList, ids] = await Promise.all([
      fetchUserBoards(userId),
      fetchBoardIdsForActivity(activityId),
    ]);
    setBoards(boardList);
    setBoardIds(new Set(ids));
    setLoading(false);
  }, [userId, activityId]);

  useEffect(() => {
    if (visible) {
      setCreatingBoard(false);
      setNewBoardName('');
      setNewBoardLocation('');
      load();
    }
  }, [visible, load]);

  const toggleBoard = async (board: TripBoard) => {
    setSaving(board.id);
    const inBoard = boardIds.has(board.id);
    if (inBoard) {
      await removeFromBoard(board.id, activityId);
      setBoardIds(prev => { const s = new Set(prev); s.delete(board.id); return s; });
    } else {
      await addToBoard(board.id, activityId);
      setBoardIds(prev => new Set([...prev, board.id]));
    }
    setSaving(null);
  };

  const handleCreateBoard = async () => {
    if (!newBoardName.trim()) return;
    setSaving('new');
    try {
      const board = await createBoard(userId, newBoardName, newBoardLocation);
      await addToBoard(board.id, activityId);
      setBoards(prev => [{ ...board, item_count: 1 }, ...prev]);
      setBoardIds(prev => new Set([...prev, board.id]));
      setCreatingBoard(false);
      setNewBoardName('');
      setNewBoardLocation('');
    } catch {}
    setSaving(null);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrapper}
      >
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
          {/* Handle */}
          <View style={styles.handle} />

          <Text style={styles.title}>Save to…</Text>

          {/* General list */}
          <TouchableOpacity style={styles.row} onPress={onSaveToggle}>
            <View style={[styles.rowIcon, { backgroundColor: '#F2F2F2' }]}>
              <Text style={styles.rowEmoji}>🔖</Text>
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>General saved list</Text>
              <Text style={styles.rowSub}>Quick saves, no trip attached</Text>
            </View>
            {isSaved && <Text style={styles.check}>✓</Text>}
          </TouchableOpacity>

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Trip boards</Text>

          {loading ? (
            <ActivityIndicator color={CORAL} style={{ marginVertical: 24 }} />
          ) : (
            <FlatList
              data={boards}
              keyExtractor={b => b.id}
              scrollEnabled={boards.length > 4}
              style={{ maxHeight: 240 }}
              renderItem={({ item }) => {
                const inBoard = boardIds.has(item.id);
                const busy = saving === item.id;
                return (
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => toggleBoard(item)}
                    disabled={busy}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: '#EEF2FF' }]}>
                      <Text style={styles.rowEmoji}>🗺️</Text>
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowLabel}>{item.name}</Text>
                      <Text style={styles.rowSub}>
                        {item.location ? `${item.location} · ` : ''}
                        {item.item_count} place{item.item_count === 1 ? '' : 's'}
                      </Text>
                    </View>
                    {busy ? (
                      <ActivityIndicator size="small" color={CORAL} />
                    ) : inBoard ? (
                      <Text style={styles.check}>✓</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyBoards}>No boards yet — create one below</Text>
              }
            />
          )}

          {/* Create new board */}
          {creatingBoard ? (
            <View style={styles.createForm}>
              <TextInput
                style={styles.input}
                placeholder="Board name (e.g. Miami June 2026)"
                placeholderTextColor="#BDBDBD"
                value={newBoardName}
                onChangeText={setNewBoardName}
                autoFocus
              />
              <TextInput
                style={styles.input}
                placeholder="Location (optional)"
                placeholderTextColor="#BDBDBD"
                value={newBoardLocation}
                onChangeText={setNewBoardLocation}
              />
              <View style={styles.createActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setCreatingBoard(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.createBtn, !newBoardName.trim() && styles.createBtnDisabled]}
                  onPress={handleCreateBoard}
                  disabled={!newBoardName.trim() || saving === 'new'}
                >
                  {saving === 'new' ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.createBtnText}>Create & add</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.newBoardBtn} onPress={() => setCreatingBoard(true)}>
              <Text style={styles.newBoardPlus}>+</Text>
              <Text style={styles.newBoardLabel}>New trip board</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 0,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 8 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 4,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowEmoji: { fontSize: 18 },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  rowSub: { fontSize: 12, color: '#8E8E93', marginTop: 1 },
  check: { fontSize: 18, color: CORAL, fontWeight: '700' },

  emptyBoards: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },

  newBoardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    marginTop: 4,
  },
  newBoardPlus: { fontSize: 22, color: CORAL, fontWeight: '300', width: 40, textAlign: 'center' },
  newBoardLabel: { fontSize: 15, fontWeight: '600', color: CORAL },

  createForm: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    marginTop: 4,
    gap: 10,
  },
  input: {
    backgroundColor: '#F7F7F7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  createActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#555' },
  createBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: CORAL,
    alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
