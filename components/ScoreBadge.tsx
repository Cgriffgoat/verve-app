import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const RADIUS = 22;
const STROKE_WIDTH = 4;
const SIZE = (RADIUS + STROKE_WIDTH) * 2; // 52px
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function scoreColor(score: number): string {
  if (score >= 80) return '#4CAF50';
  if (score >= 60) return '#F59E0B';
  return '#FF5C5C';
}

interface Props {
  score: number;
  // When provided and 0, shows a "be the first to rate" state instead of a
  // number — otherwise every unreviewed place shows the same flat starter
  // score, which makes the whole feed look uniformly ranked.
  reviewCount?: number;
}

export function ScoreBadge({ score, reviewCount }: Props) {
  if (reviewCount === 0) {
    return (
      <View style={styles.container}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="rgba(0,0,0,0.55)"
            stroke="#FFD700"
            strokeWidth={STROKE_WIDTH}
            strokeDasharray="3 5"
            strokeLinecap="round"
          />
        </Svg>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.textWrapper}>
            <Text style={styles.unrankedEmoji}>⭐</Text>
          </View>
        </View>
      </View>
    );
  }

  const color = scoreColor(score);
  const dashOffset = CIRCUMFERENCE * (1 - score / 100);

  return (
    <View style={styles.container}>
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="rgba(0,0,0,0.55)"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={STROKE_WIDTH}
        />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={String(CIRCUMFERENCE)}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.textWrapper}>
          <Text style={[styles.scoreText, { color }]}>{score}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIZE,
    height: SIZE,
  },
  textWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  unrankedEmoji: {
    fontSize: 18,
  },
});
