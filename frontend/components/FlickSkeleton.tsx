import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useTheme } from '@/hooks/use-theme-color';

export const FlickSkeleton = () => {
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
    <Animated.View style={[styles.flickContainer, { backgroundColor: colors.backgroundSecondary }, opacityStyle]}>
      {/* Loading indicator at bottom */}
      <View style={styles.bottomSection}>
        <View style={styles.userInfo}>
          <View style={[styles.avatar, { backgroundColor: colors.background }]} />
          <View style={styles.userDetails}>
            <View
              style={[
                styles.usernameLine,
                { backgroundColor: colors.background },
              ]}
            />
            <View
              style={[
                styles.captionLine,
                { backgroundColor: colors.background },
              ]}
            />
          </View>
        </View>

        <View style={styles.actions}>
          <View style={[styles.actionIcon, { backgroundColor: colors.background }]} />
          <View style={[styles.actionIcon, { backgroundColor: colors.background }]} />
          <View style={[styles.actionIcon, { backgroundColor: colors.background }]} />
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  flickContainer: {
    height: 600, // approximate flick height
    width: '100%',
    justifyContent: 'flex-end',
    marginBottom: 12,
    borderRadius: 8,
  },
  bottomSection: {
    padding: 20,
    gap: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  userDetails: {
    flex: 1,
    gap: 6,
  },
  usernameLine: {
    height: 12,
    width: '60%',
    borderRadius: 4,
  },
  captionLine: {
    height: 10,
    width: '80%',
    borderRadius: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
});
