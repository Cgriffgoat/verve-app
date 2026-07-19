import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { submitCommunityEvent, uploadEventPhoto } from '../lib/communityEvents';
import { CitySearchModal } from './CitySearchModal';

const CORAL = '#FF5C5C';
const EVENT_COLOR = '#AF52DE';

const EVENT_CATEGORIES = [
  'Events',
  'Seasonal/Unique',
  'Arts & Culture',
  'Food & Drink',
  'Outdoors',
  'Nightlife',
  'Adventure/Thrill',
  'Games & Hobbies',
  'Family Fun',
];

type Location = { latitude: number; longitude: number; name: string };

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

export function SubmitEventModal({ visible, onClose, onSubmitted }: Props) {
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Events');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [location, setLocation] = useState<Location | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setTitle('');
      setDescription('');
      setCategory('Events');
      setEventDate('');
      setEventTime('');
      setLocation(null);
      setPhotoUri(null);
      return;
    }
    // Grab display name when modal opens
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const name =
          user.user_metadata?.full_name ??
          user.user_metadata?.name ??
          user.email?.split('@')[0] ??
          'Community member';
        setDisplayName(name);
      }
    });
  }, [visible]);

  const canSubmit = title.trim().length > 0 && eventDate.trim().length > 0 && location !== null;

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || !location) return;

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(eventDate.trim())) {
      Alert.alert('Invalid date', 'Please enter the date as YYYY-MM-DD (e.g. 2025-08-01).');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      let photoUrl: string | null = null;
      if (photoUri) {
        photoUrl = await uploadEventPhoto(photoUri, user.id);
      }

      await submitCommunityEvent({
        creator_id: user.id,
        creator_display_name: displayName,
        title: title.trim(),
        description: description.trim() || null,
        category,
        latitude: location.latitude,
        longitude: location.longitude,
        location_name: location.name,
        event_date: eventDate.trim(),
        event_time: eventTime.trim() || null,
        photo_url: photoUrl,
      });

      Alert.alert(
        'Event posted!',
        'Your event is now visible to people nearby. Thanks for helping the community.',
        [{ text: 'Done', onPress: () => { onSubmitted(); onClose(); } }],
      );
    } catch (e: any) {
      Alert.alert("Couldn't post event", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <CitySearchModal
        visible={locationModalVisible}
        title="Event location"
        onClose={() => setLocationModalVisible(false)}
        onSelect={loc => {
          setLocation({ latitude: loc.latitude, longitude: loc.longitude, name: loc.city });
          setLocationModalVisible(false);
        }}
      />

      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.cancelBtn}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Post Local Event</Text>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit || submitting}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {submitting
              ? <ActivityIndicator color={EVENT_COLOR} size="small" />
              : <Text style={[styles.postBtn, !canSubmit && styles.postBtnDisabled]}>Post</Text>
            }
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Trust intro */}
            <View style={styles.introBanner}>
              <Text style={styles.introEmoji}>🌟</Text>
              <View style={styles.introBody}>
                <Text style={styles.introTitle}>Share with your community</Text>
                <Text style={styles.introSub}>
                  Your event will appear on the map for people nearby.{'\n'}
                  Posted as <Text style={styles.introName}>{displayName ?? '…'}</Text>
                </Text>
              </View>
            </View>

            {/* Title */}
            <Text style={styles.fieldLabel}>Event name *</Text>
            <TextInput
              style={styles.input}
              placeholder="What's happening?"
              placeholderTextColor="#BDBDBD"
              value={title}
              onChangeText={setTitle}
              returnKeyType="next"
              maxLength={120}
            />

            {/* Category */}
            <Text style={styles.fieldLabel}>Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScroll}
            >
              {EVENT_CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryPill, category === cat && styles.categoryPillActive]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[styles.categoryPillText, category === cat && styles.categoryPillTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Date & Time */}
            <Text style={styles.fieldLabel}>Date *</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD  (e.g. 2025-08-15)"
              placeholderTextColor="#BDBDBD"
              value={eventDate}
              onChangeText={setEventDate}
              keyboardType="numbers-and-punctuation"
              returnKeyType="next"
              maxLength={10}
            />

            <Text style={styles.fieldLabel}>
              Time <Text style={styles.optional}>(optional)</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 7:00 PM"
              placeholderTextColor="#BDBDBD"
              value={eventTime}
              onChangeText={setEventTime}
              returnKeyType="next"
              maxLength={20}
            />

            {/* Location */}
            <Text style={styles.fieldLabel}>Location *</Text>
            <TouchableOpacity
              style={[styles.locationRow, location && styles.locationRowFilled]}
              onPress={() => setLocationModalVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.locationIcon}>{location ? '📌' : '📍'}</Text>
              <Text style={[styles.locationText, !location && styles.locationPlaceholder]}>
                {location ? location.name : 'Search neighborhood or city'}
              </Text>
              {location
                ? <TouchableOpacity
                    onPress={() => setLocation(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.locationClear}>✕</Text>
                  </TouchableOpacity>
                : <Text style={styles.locationChevron}>›</Text>
              }
            </TouchableOpacity>

            {/* Description */}
            <Text style={styles.fieldLabel}>
              Description <Text style={styles.optional}>(optional)</Text>
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Tell people what to expect — venue, tickets, what to bring…"
              placeholderTextColor="#BDBDBD"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            {/* Photo */}
            <Text style={styles.fieldLabel}>
              Photo <Text style={styles.optional}>(optional)</Text>
            </Text>
            {photoUri ? (
              <View style={styles.photoContainer}>
                <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
                <TouchableOpacity style={styles.removePhotoBtn} onPress={() => setPhotoUri(null)}>
                  <Text style={styles.removePhotoBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.addPhotoBtn} onPress={pickPhoto} activeOpacity={0.7}>
                <Text style={styles.addPhotoIcon}>＋</Text>
                <Text style={styles.addPhotoText}>Add a photo</Text>
              </TouchableOpacity>
            )}

            {/* Guidelines footer */}
            <Text style={styles.guidelines}>
              By posting you confirm this is a real local event. Events that are spam or inappropriate will be removed.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  cancelBtn: { fontSize: 16, color: '#8E8E93', fontWeight: '500' },
  postBtn: { fontSize: 16, color: EVENT_COLOR, fontWeight: '700' },
  postBtnDisabled: { opacity: 0.35 },

  scrollContent: { padding: 20, gap: 6 },

  introBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#FAF5FF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E9D8FF',
    marginBottom: 6,
  },
  introEmoji: { fontSize: 28, marginTop: 1 },
  introBody: { flex: 1 },
  introTitle: { fontSize: 15, fontWeight: '700', color: '#5B21B6', marginBottom: 4 },
  introSub: { fontSize: 13, color: '#6B4FA0', lineHeight: 18 },
  introName: { fontWeight: '700', color: '#5B21B6' },

  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 8,
  },
  optional: { fontWeight: '400', textTransform: 'none', letterSpacing: 0 },

  input: {
    backgroundColor: '#F7F7F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  textArea: { minHeight: 100, paddingTop: 13 },

  categoryScroll: { gap: 8, paddingBottom: 2 },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F2F2F2',
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  categoryPillActive: { backgroundColor: EVENT_COLOR, borderColor: EVENT_COLOR },
  categoryPillText: { fontSize: 13, fontWeight: '500', color: '#444' },
  categoryPillTextActive: { color: '#fff', fontWeight: '600' },

  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F7F7F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  locationRowFilled: { borderColor: EVENT_COLOR, backgroundColor: '#FAF5FF' },
  locationIcon: { fontSize: 17 },
  locationText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  locationPlaceholder: { fontWeight: '400', color: '#BDBDBD' },
  locationChevron: { fontSize: 18, color: '#C7C7CC' },
  locationClear: { fontSize: 14, color: '#8E8E93', fontWeight: '600', paddingHorizontal: 4 },

  photoContainer: { position: 'relative', borderRadius: 12, overflow: 'hidden' },
  photoPreview: { width: '100%', height: 180, borderRadius: 12 },
  removePhotoBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
    paddingVertical: 20,
    backgroundColor: '#FAFAFA',
  },
  addPhotoIcon: { fontSize: 20, color: '#BDBDBD' },
  addPhotoText: { fontSize: 14, color: '#BDBDBD', fontWeight: '500' },

  guidelines: {
    fontSize: 12,
    color: '#BDBDBD',
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 20,
    paddingHorizontal: 10,
  },
});
