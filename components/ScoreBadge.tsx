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

export function ScoreBadge({ score }: { score: number }) {
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
});
