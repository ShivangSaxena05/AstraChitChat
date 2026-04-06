import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useTheme } from '@/hooks/use-theme-color';

export const ChatSkeleton = () => {
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
    <Animated.View
      style={[styles.chatItem, { backgroundColor: colors.card }, opacityStyle]}
    >
      {/* Avatar */}
      <View
        style={[styles.avatar, { backgroundColor: colors.backgroundSecondary }]}
      />

      {/* Chat info */}
      <View style={styles.chatInfo}>
        {/* Title line */}
        <View
          style={[styles.titleLine, { backgroundColor: colors.backgroundSecondary }]}
        />

        {/* Preview line */}
        <View
          style={[
            styles.previewLine,
            { backgroundColor: colors.backgroundSecondary },
          ]}
        />
      </View>

      {/* Time badge */}
      <View
        style={[styles.timeBadge, { backgroundColor: colors.backgroundSecondary }]}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  chatInfo: {
    flex: 1,
    gap: 8,
  },
  titleLine: {
    height: 14,
    width: '70%',
    borderRadius: 4,
  },
  previewLine: {
    height: 12,
    width: '90%',
    borderRadius: 4,
  },
  timeBadge: {
    width: 40,
    height: 16,
    borderRadius: 8,
    marginLeft: 8,
  },
});
