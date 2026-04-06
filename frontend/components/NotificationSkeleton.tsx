import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useTheme } from '@/hooks/use-theme-color';

export const NotificationSkeleton = () => {
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
      style={[styles.notificationItem, { backgroundColor: colors.card }, opacityStyle]}
    >
      {/* Avatar */}
      <View
        style={[styles.avatar, { backgroundColor: colors.backgroundSecondary }]}
      />

      {/* Notification content */}
      <View style={styles.content}>
        {/* Message line 1 */}
        <View
          style={[styles.messageLine, { backgroundColor: colors.backgroundSecondary }]}
        />

        {/* Message line 2 (optional) */}
        <View
          style={[
            styles.messageLineShort,
            { backgroundColor: colors.backgroundSecondary },
          ]}
        />

        {/* Time text */}
        <View
          style={[styles.timeLine, { backgroundColor: colors.backgroundSecondary }]}
        />
      </View>

      {/* Thumbnail */}
      <View
        style={[styles.thumbnail, { backgroundColor: colors.backgroundSecondary }]}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  content: {
    flex: 1,
    gap: 6,
  },
  messageLine: {
    height: 14,
    width: '85%',
    borderRadius: 4,
  },
  messageLineShort: {
    height: 12,
    width: '60%',
    borderRadius: 4,
  },
  timeLine: {
    height: 10,
    width: '40%',
    borderRadius: 4,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginLeft: 8,
  },
});
