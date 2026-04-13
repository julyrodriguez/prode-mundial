/**
 * SkeletonLoader — Loading states premium sin ActivityIndicator genérico.
 * Usa animación de pulso nativa de React Native para el efecto shimmer.
 */
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Platform } from 'react-native';
import { BG, BORDER } from '../theme/colors';
import { SPACING, RADIUS } from '../theme/spacing';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: object;
}

export function SkeletonBox({ width = '100%', height = 16, borderRadius = RADIUS.sm, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1,   duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width:        width as any,
          height,
          borderRadius,
          backgroundColor: BG.elevated,
          opacity,
        },
        style,
      ]}
    />
  );
}

// ─── Skeleton de MatchCard ────────────────────────────────────────────────────
export function MatchCardSkeleton() {
  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <SkeletonBox width={100} height={10} />
        <SkeletonBox width={50} height={10} />
      </View>
      {/* Teams */}
      <View style={styles.teamsSection}>
        {[0, 1].map(i => (
          <View key={i} style={styles.teamRow}>
            <View style={styles.teamInfo}>
              <SkeletonBox width={28} height={28} borderRadius={RADIUS.sm} />
              <SkeletonBox width={120} height={12} style={{ marginLeft: SPACING['2.5'] }} />
            </View>
            <SkeletonBox width={28} height={28} borderRadius={RADIUS.sm} />
          </View>
        ))}
      </View>
      {/* Footer */}
      <View style={styles.footer}>
        <SkeletonBox width={80} height={22} borderRadius={RADIUS.sm} />
        <SkeletonBox width={110} height={28} borderRadius={RADIUS.md} />
      </View>
    </View>
  );
}

// ─── Lista de skeletons ────────────────────────────────────────────────────────
export function MatchListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <MatchCardSkeleton key={i} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BG.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: BORDER.subtle,
    overflow: 'hidden',
    marginBottom: SPACING['2.5'],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING['3.5'],
    paddingVertical: SPACING['2.5'],
    backgroundColor: BG.elevated,
    borderBottomWidth: 1,
    borderBottomColor: BORDER.subtle,
  },
  teamsSection: {
    paddingHorizontal: SPACING['3.5'],
    paddingVertical: SPACING['3'],
    gap: SPACING['2.5'],
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING['3.5'],
    paddingVertical: SPACING['3'],
    borderTopWidth: 1,
    borderTopColor: BORDER.subtle,
    backgroundColor: BG.nav,
  },
});
