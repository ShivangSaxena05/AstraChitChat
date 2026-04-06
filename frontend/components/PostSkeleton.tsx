import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useTheme } from '@/hooks/use-theme-color';
import { ThemedView } from './themed-view';

export const PostSkeleton = () => {
  const colors = useTheme();
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [shimmerAnim]);

  const opacityStyle = {
    opacity: shimmerAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 0.7],
    }),
  };

  return (
    <Animated.View style={[styles.card, { backgroundColor: colors.card }, opacityStyle]}>
      {/* Header */}
      <View style={styles.header}>
        <View
          style={[styles.avatar, { backgroundColor: colors.backgroundSecondary }]}
        />
        <View style={styles.headerText}>
          <View
            style={[styles.line, { backgroundColor: colors.backgroundSecondary }]}
          />
          <View
            style={[styles.shortLine, { backgroundColor: colors.backgroundSecondary }]}
          />
        </View>
      </View>

      {/* Media */}
      <View style={[styles.media, { backgroundColor: colors.backgroundSecondary }]} />

      {/* Actions */}
      <View style={styles.actions}>
        <View
          style={[styles.actionLine, { backgroundColor: colors.backgroundSecondary }]}
        />
        <View
          style={[styles.actionLine, { backgroundColor: colors.backgroundSecondary }]}
        />
      </View>

      {/* Caption */}
      <View style={styles.caption}>
        <View
          style={[styles.line, { backgroundColor: colors.backgroundSecondary }]}
        />
        <View
          style={[styles.shortLine, { backgroundColor: colors.backgroundSecondary }]}
        />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  line: {
    height: 12,
    marginBottom: 8,
    borderRadius: 4,
  },
  shortLine: {
    height: 10,
    width: '60%',
    borderRadius: 4,
  },
  media: {
    height: 300,
    marginBottom: 12,
    borderRadius: 8,
  },
  actions: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 12,
  },
  actionLine: {
    height: 8,
    flex: 1,
    borderRadius: 4,
  },
  caption: {
    gap: 6,
  },
});
