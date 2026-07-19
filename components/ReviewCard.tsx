import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { ScoreBadge } from './ScoreBadge';
import { supabase } from '../lib/supabase';
import type { Review } from '../lib/types';

const CORAL = '#FF5C5C';

interface Props {
  review: Review;
  isOwnReview: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function ReviewCard({ review, isOwnReview, onEdit, onDelete }: Props) {
  const [helpfulCount, setHelpfulCount] = useState(review.helpful_count);
  const [liked, setLiked] = useState(false);

  const name = review.reviewer_name ?? 'Verve User';
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleHelpful = async () => {
    if (liked || isOwnReview) return;
    setLiked(true);
    setHelpfulCount(c => c + 1);
    await supabase
      .from('reviews')
      .update({ helpful_count: helpfulCount + 1 })
      .eq('id', review.id);
  };

  const dateStr = new Date(review.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <View style={styles.card}>
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.initials}>{initials}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <View style={styles.beenHereBadge}>
            <Text style={styles.beenHereText}>✓ Been here</Text>
          </View>
        </View>
        <ScoreBadge score={review.score} />
      </View>

      {/* Review text */}
      {review.review_text ? (
        <Text style={styles.reviewText}>{review.review_text}</Text>
      ) : null}

      {/* Descriptor chips */}
      {review.descriptors.length > 0 && (
        <View style={styles.chips}>
          {review.descriptors.slice(0, 5).map(d => (
            <View key={d} style={styles.chip}>
              <Text style={styles.chipText}>{d}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Photos */}
      {review.photos.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.photosScroll}
          contentContainerStyle={styles.photosContent}
        >
          {review.photos.map((uri, i) => (
            <Image key={i} source={{ uri }} style={styles.photo} resizeMode="cover" />
          ))}
        </ScrollView>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.date}>{dateStr}</Text>
        {isOwnReview ? (
          <View style={styles.ownActions}>
            <TouchableOpacity
              onPress={onEdit}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.editBtn}>Edit</Text>
            </TouchableOpacity>
            <Text style={styles.actionDivider}>·</Text>
            <TouchableOpacity
              onPress={onDelete}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.deleteBtn}>Delete</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={handleHelpful} activeOpacity={0.7}>
            <Text style={[styles.helpfulBtn, liked && styles.helpfulBtnActive]}>
              👍 Helpful{helpfulCount > 0 ? ` (${helpfulCount})` : ''}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontSize: 14,
    fontWeight: '700',
    color: '#555',
  },
  headerInfo: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  beenHereBadge: {
    backgroundColor: '#E8F5E9',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  beenHereText: {
    fontSize: 11,
    color: '#4CAF50',
    fontWeight: '600',
  },
  reviewText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 21,
    marginBottom: 10,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  chip: {
    backgroundColor: '#F2F2F2',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '500',
  },
  photosScroll: {
    marginBottom: 10,
  },
  photosContent: {
    gap: 8,
  },
  photo: {
    width: 120,
    height: 90,
    borderRadius: 10,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontSize: 12,
    color: '#BDBDBD',
  },
  helpfulBtn: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },
  helpfulBtnActive: {
    color: CORAL,
    fontWeight: '600',
  },
  ownActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editBtn: {
    fontSize: 13,
    color: '#5B7FFF',
    fontWeight: '600',
  },
  actionDivider: {
    fontSize: 13,
    color: '#D0D0D0',
  },
  deleteBtn: {
    fontSize: 13,
    color: CORAL,
    fontWeight: '600',
  },
});
