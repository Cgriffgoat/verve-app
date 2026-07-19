import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Slider from '@react-native-community/slider';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { uploadReviewPhoto } from '../lib/storage';
import type { Review } from '../lib/types';

const CORAL = '#FF5C5C';

const CATEGORY_DESCRIPTORS: Record<string, string[]> = {
  'Movies':         ['Great sound', 'Comfy seats', 'IMAX/premium screen', 'Good for a date', 'Worth full price', 'Wait for streaming'],
  'Food & Drink':   ['Great for groups', 'Good value', 'Romantic', 'Fast service', 'Kid-friendly', 'Loud/lively'],
  'Outdoors':       ['Good for dogs', 'Shaded', 'Easy parking', 'Crowded on weekends', 'Great views', 'Family friendly'],
  'Events':         ['Worth the ticket price', 'Good for groups', 'Family friendly', 'Long lines', 'Great photo ops'],
  'Indoor Fun':     ['Good for groups', 'Budget friendly', 'Good for kids', 'Date night option'],
  'Active':         ['Good equipment', 'Clean facilities', 'Beginner friendly', 'Crowded at peak hours'],
  'Nightlife':      ['Good drink prices', 'Great atmosphere', 'Live music', 'Long wait'],
  'Shopping':       ['Good selection', 'Good deals', 'Unique finds', 'Crowded'],
  'Arts & Culture': ['Worth the visit', 'Good for all ages', 'Quiet/peaceful', 'Needs more time'],
  'Wellness':       ['Relaxing', 'Clean facilities', 'Good instructors', 'Pricey but worth it'],
};

const DEFAULT_DESCRIPTORS = [
  'Great vibe', 'Worth the price', 'Would return', 'Hidden gem',
  'Great for groups', 'Unique experience',
];

const GOOD_FOR_TAG_MAP: Record<string, string> = {
  'Good for a date':   'date',
  'Romantic':          'date',
  'Date night option': 'date',
  'Family friendly':   'family',
  'Kid-friendly':      'family',
  'Good for kids':     'family',
  'Good for dogs':     'dog',
};

interface Props {
  activityId: string;
  userId: string;
  category: string;
  reviewerName: string | null;
  onSubmitted: () => void;
  editingReview?: Review;
  onCancelEdit?: () => void;
}

export function ReviewComposer({
  activityId,
  userId,
  category,
  reviewerName,
  onSubmitted,
  editingReview,
  onCancelEdit,
}: Props) {
  const descriptors = CATEGORY_DESCRIPTORS[category] ?? DEFAULT_DESCRIPTORS;
  const isEditing = editingReview != null;

  const [score, setScore] = useState(editingReview?.score ?? 75);
  const [selectedDescriptors, setSelectedDescriptors] = useState<string[]>(
    editingReview?.descriptors ?? [],
  );
  const [reviewText, setReviewText] = useState(editingReview?.review_text ?? '');
  // Unified photo list — may be remote https:// URLs (existing) or local file:// URIs (new picks)
  const [photos, setPhotos] = useState<string[]>(editingReview?.photos ?? []);
  const [submitting, setSubmitting] = useState(false);

  const scoreColor = score >= 80 ? '#4CAF50' : score >= 60 ? '#F59E0B' : CORAL;

  const toggleDescriptor = (d: string) => {
    setSelectedDescriptors(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d],
    );
  };

  const pickPhoto = async () => {
    if (photos.length >= 3) {
      Alert.alert('Max 3 photos', 'Remove one before adding another.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      setPhotos(prev => [...prev, result.assets[0].uri]);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      // Upload only new (local) photos; keep existing remote URLs as-is
      const finalPhotoUrls: string[] = [];
      for (const photo of photos) {
        if (photo.startsWith('http')) {
          finalPhotoUrls.push(photo);
        } else {
          finalPhotoUrls.push(await uploadReviewPhoto(photo, userId));
        }
      }

      const payload = {
        score,
        review_text: reviewText.trim(),
        photos: finalPhotoUrls,
        vibe: score,
        value_score: Math.max(0, score - 5),
        would_return: Math.min(100, score + 5),
        crowd_level: 65,
        descriptors: selectedDescriptors,
      };

      if (isEditing) {
        const { error } = await supabase
          .from('reviews')
          .update(payload)
          .eq('id', editingReview.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('reviews').insert({
          activity_id: activityId,
          user_id: userId,
          reviewer_name: reviewerName,
          ...payload,
        });
        if (error) throw error;
      }

      // Merge good_for tags into the activity
      const newTags = selectedDescriptors
        .map(d => GOOD_FOR_TAG_MAP[d])
        .filter((t): t is string => Boolean(t));
      if (newTags.length > 0) {
        const { data: act } = await supabase
          .from('activities')
          .select('good_for')
          .eq('id', activityId)
          .single();
        const merged = Array.from(new Set([...(act?.good_for ?? []), ...newTags]));
        await supabase.from('activities').update({ good_for: merged }).eq('id', activityId);
      }

      onSubmitted();
    } catch (e: any) {
      Alert.alert("Couldn't submit", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Title row */}
      <View style={styles.titleRow}>
        <Text style={styles.title}>{isEditing ? 'Edit your review' : 'Rate it'}</Text>
        {isEditing && onCancelEdit && (
          <TouchableOpacity
            onPress={onCancelEdit}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.cancelEdit}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Score slider */}
      <View style={styles.scoreRow}>
        <Text style={[styles.scoreBig, { color: scoreColor }]}>{score}</Text>
        <Text style={styles.scoreOf}>/100</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={100}
        step={1}
        value={score}
        onValueChange={v => setScore(Math.round(v))}
        minimumTrackTintColor={scoreColor}
        maximumTrackTintColor="#E5E5E5"
        thumbTintColor={scoreColor}
      />

      {/* Descriptor chips */}
      <Text style={styles.label}>What stood out?</Text>
      <View style={styles.chipGrid}>
        {descriptors.map(d => {
          const active = selectedDescriptors.includes(d);
          return (
            <TouchableOpacity
              key={d}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => toggleDescriptor(d)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{d}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Review text */}
      <Text style={styles.label}>Write a review (optional)</Text>
      <TextInput
        style={styles.textArea}
        placeholder="What was it like? Share the details..."
        placeholderTextColor="#BDBDBD"
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        value={reviewText}
        onChangeText={setReviewText}
      />

      {/* Photos */}
      <Text style={styles.label}>Add photos (up to 3)</Text>
      <View style={styles.photoRow}>
        {photos.map((uri, i) => (
          <View key={i} style={styles.thumbContainer}>
            <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
            >
              <Text style={styles.removeBtnText}>×</Text>
            </TouchableOpacity>
          </View>
        ))}
        {photos.length < 3 && (
          <TouchableOpacity style={styles.addPhotoBtn} onPress={pickPhoto}>
            <Text style={styles.addPhotoIcon}>＋</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        onPress={submit}
        disabled={submitting}
        activeOpacity={0.85}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.submitBtnText}>
            {isEditing ? 'Save changes' : 'Submit Review'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  cancelEdit: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginBottom: 4,
  },
  scoreBig: {
    fontSize: 52,
    fontWeight: '800',
    letterSpacing: -2,
    lineHeight: 56,
  },
  scoreOf: {
    fontSize: 20,
    color: '#BDBDBD',
    fontWeight: '500',
    marginBottom: 8,
    marginLeft: 4,
  },
  slider: {
    width: '100%',
    height: 40,
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 10,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F2F2F2',
  },
  chipActive: {
    backgroundColor: CORAL,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#444',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  textArea: {
    backgroundColor: '#F7F7F7',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#1A1A1A',
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    marginBottom: 20,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  thumbContainer: {
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  addPhotoBtn: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  addPhotoIcon: {
    fontSize: 24,
    color: '#BDBDBD',
  },
  submitBtn: {
    backgroundColor: CORAL,
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: CORAL,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
