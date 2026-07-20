import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { REPORT_REASONS, reportContent, blockUser, type ContentType } from '../lib/moderation';

const CORAL = '#FF5C5C';

interface Props {
  visible: boolean;
  onClose: () => void;
  reporterId: string;
  contentType: ContentType;
  contentId: string;
  reportedUserId?: string | null;
  reportedUserName?: string | null;
  onReported?: () => void;
  onBlocked?: () => void;
}

export function ReportModal({
  visible,
  onClose,
  reporterId,
  contentType,
  contentId,
  reportedUserId = null,
  reportedUserName,
  onReported,
  onBlocked,
}: Props) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [blocking, setBlocking] = useState(false);

  const reset = () => {
    setReason(null);
    setNote('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      await reportContent(reporterId, contentType, contentId, reason, note, reportedUserId);
      Alert.alert('Report submitted', "Thanks — we'll take a look.");
      onReported?.();
      handleClose();
    } catch (e: any) {
      Alert.alert('Could not submit report', e.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBlock = async () => {
    if (!reportedUserId) return;
    setBlocking(true);
    try {
      await blockUser(reporterId, reportedUserId, reportedUserName ?? null);
      onBlocked?.();
      Alert.alert('Blocked', `You won't see content from ${reportedUserName ?? 'this user'} anymore.`);
      handleClose();
    } catch (e: any) {
      Alert.alert('Could not block user', e.message ?? 'Please try again.');
    } finally {
      setBlocking(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrapper}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Report content</Text>
          <Text style={styles.sub}>Why are you reporting this?</Text>

          <View style={styles.reasons}>
            {REPORT_REASONS.map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.reasonRow, reason === r && styles.reasonRowActive]}
                onPress={() => setReason(r)}
                activeOpacity={0.7}
              >
                <Text style={[styles.reasonText, reason === r && styles.reasonTextActive]}>{r}</Text>
                {reason === r && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.note}
            placeholder="Add details (optional)"
            placeholderTextColor="#BDBDBD"
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={500}
          />

          <TouchableOpacity
            style={[styles.submitBtn, (!reason || submitting) && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={!reason || submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>Submit report</Text>
            }
          </TouchableOpacity>

          {reportedUserId && (
            <TouchableOpacity
              style={[styles.blockBtn, blocking && styles.btnDisabled]}
              onPress={handleBlock}
              disabled={blocking}
              activeOpacity={0.85}
            >
              {blocking
                ? <ActivityIndicator color={CORAL} />
                : <Text style={styles.blockBtnText}>
                    🚫 Block {reportedUserName ?? 'this user'}
                  </Text>
              }
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  handle: { width: 36, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '700', color: '#1A1A1A', textAlign: 'center' },
  sub: { fontSize: 13, color: '#8E8E93', textAlign: 'center', marginTop: 4, marginBottom: 16 },

  reasons: { gap: 8, marginBottom: 14 },
  reasonRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F7F7F9', borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 14,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  reasonRowActive: { borderColor: CORAL, backgroundColor: '#FFF5F5' },
  reasonText: { fontSize: 14, fontWeight: '500', color: '#1A1A1A' },
  reasonTextActive: { color: CORAL, fontWeight: '700' },
  check: { fontSize: 15, fontWeight: '700', color: CORAL },

  note: {
    backgroundColor: '#F7F7F9', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#1A1A1A',
    minHeight: 64, textAlignVertical: 'top',
    borderWidth: 1, borderColor: '#E8E8E8',
    marginBottom: 14,
  },

  submitBtn: {
    backgroundColor: CORAL, borderRadius: 14, height: 50,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  blockBtn: {
    borderRadius: 14, height: 46,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
    borderWidth: 1, borderColor: '#FFD0D0',
  },
  blockBtnText: { color: CORAL, fontSize: 14, fontWeight: '700' },

  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { color: '#8E8E93', fontSize: 14, fontWeight: '600' },
});
