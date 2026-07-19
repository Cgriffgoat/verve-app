import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScoreBadge } from './ScoreBadge';
import type { Activity } from '../lib/types';

const CATEGORY_BG: Record<string, string> = {
  'Movies':           '#1C1C2E',
  'Food & Drink':     '#6B2000',
  'Outdoors':         '#1A3D2B',
  'Nightlife':        '#1A0A3D',
  'Shopping':         '#5C3000',
  'Arts & Culture':   '#3D1A00',
  'Wellness':         '#0D3D30',
  'Events':           '#2D0A55',
  'Adventure/Thrill': '#5C0A10',
  'Games & Hobbies':  '#0A1F5C',
  'Family Fun':       '#5C0A35',
  'Seasonal/Unique':  '#003D30',
};

const CATEGORY_EMOJI: Record<string, string> = {
  'Movies':           '🎬',
  'Food & Drink':     '🍽️',
  'Outdoors':         '🌿',
  'Nightlife':        '🎉',
  'Shopping':         '🛍️',
  'Arts & Culture':   '🎨',
  'Wellness':         '🧘',
  'Events':           '📅',
  'Adventure/Thrill': '⚡',
  'Games & Hobbies':  '🎮',
  'Family Fun':       '👨‍👩‍👧',
  'Seasonal/Unique':  '✨',
};

interface Props {
  activity: Activity;
  onPress?: () => void;
  isSaved?: boolean;
  onToggleSave?: () => void;
}

export function ActivityCard({ activity, onPress, isSaved = false, onToggleSave }: Props) {
  const router = useRouter();
  const [imgErr, setImgErr] = useState(false);
  const showPlaceholder = !activity.imageUrl || imgErr;
  const tags = [activity.distance, activity.commitment, activity.weather].filter(
    (t): t is string => Boolean(t),
  );

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress ?? (() => router.push(`/activity/${activity.id}`))}
      activeOpacity={0.95}
    >
      <View style={styles.imageContainer}>
        {showPlaceholder ? (
          <View
            style={[
              styles.image,
              styles.placeholder,
              { backgroundColor: CATEGORY_BG[activity.category] ?? '#2A2A2A' },
            ]}
          >
            <Text style={styles.placeholderEmoji}>
              {CATEGORY_EMOJI[activity.category] ?? '📍'}
            </Text>
          </View>
        ) : (
          <Image
            source={{ uri: activity.imageUrl }}
            style={styles.image}
            resizeMode="cover"
            onError={() => setImgErr(true)}
          />
        )}

        {/* Score badge — top right */}
        <View style={styles.badge}>
          <ScoreBadge score={activity.score} />
        </View>

        {/* Bookmark — top left */}
        {onToggleSave && (
          <TouchableOpacity
            style={styles.bookmarkBtn}
            onPress={e => { e.stopPropagation(); onToggleSave(); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={18}
              color={isSaved ? '#FFD700' : '#fff'}
            />
          </TouchableOpacity>
        )}

        {/* Title overlay — bottom of image */}
        <View style={styles.titleOverlay}>
          <Text style={styles.title} numberOfLines={1}>
            {activity.title}
          </Text>
          <Text style={styles.categoryLabel}>{activity.category}</Text>
        </View>
      </View>

      {/* Below the image */}
      <View style={styles.body}>
        <Text style={styles.subtitle} numberOfLines={2}>
          {activity.subtitle}
        </Text>
        <View style={styles.tags}>
          {tags.map(tag => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 14,
    elevation: 4,
  },
  imageContainer: {
    height: 220,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderEmoji: {
    fontSize: 56,
  },
  badge: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  bookmarkBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.40)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.52)',
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 12,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  categoryLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '500',
    marginTop: 2,
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
  },
  subtitle: {
    fontSize: 14,
    color: '#555555',
    lineHeight: 20,
    marginBottom: 10,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    backgroundColor: '#F2F2F2',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#555555',
  },
});
