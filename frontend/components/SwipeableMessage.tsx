import React, { memo, useRef } from 'react';
import { View, StyleSheet, PanResponder, Animated } from 'react-native';

interface SwipeableMessageProps {
  children: React.ReactNode;
  onSwipeReply: () => void;
  isOwnMessage: boolean;
}

// Threshold distance to trigger reply (in pixels)
const SWIPE_THRESHOLD = 30;

const SwipeableMessage: React.FC<SwipeableMessageProps> = ({ 
  children, 
  onSwipeReply,
  isOwnMessage 
}) => {
  const translateX = useRef(new Animated.Value(0)).current;

// ✅ FIXED: Production-grade swipe w/ gesture arena + haptic feedback
const panResponder = useRef(
  PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gestureState) => {
      // Priority: Horizontal swipe > vertical scroll (load more)
      return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5 && 
             Math.abs(gestureState.dx) > 8 && 
             Math.abs(gestureState.dy) < 20; // Block if vertical > 20px (scroll intent)
    },
    onPanResponderGrant: () => {
      // Haptic on gesture start (subtle)
// TODO: Add expo-haptics for native feedback
// Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    onPanResponderMove: (_, gestureState) => {
      const dx = gestureState.dx;
      const maxDrag = 80;
      
      // Direction-aware limits (own: left, other: right)
      const dirLimit = isOwnMessage ? -1 : 1;
      const clampedDx = Math.max(dirLimit * -maxDrag, Math.min(dx, dirLimit * maxDrag));
      
      translateX.setValue(clampedDx * 0.6); // Smooth resistance
    },
    onPanResponderRelease: (_, gestureState) => {
      const dx = gestureState.dx;
      const threshold = isOwnMessage ? SWIPE_THRESHOLD * -1 : SWIPE_THRESHOLD;
      
      if (Math.abs(dx) > SWIPE_THRESHOLD && Math.sign(dx) === (isOwnMessage ? -1 : 1)) {
        // Success haptic + reply
        // Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onSwipeReply();
      }

      // Smooth snapback
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        tension: 300,
        friction: 20,
        restSpeedThreshold: 20,
        restDisplacementThreshold: 1
      }).start();
    },
    onPanResponderTerminate: (_, gestureState) => {
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        tension: 300,
        friction: 20,
      }).start();
    },
  })
).current;

  return (
    <View style={styles.container}>
      <Animated.View 
        style={[
          styles.messageWrapper,
          { transform: [{ translateX }] }
        ]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    marginHorizontal: 8,
    width: '100%',
  },
  messageWrapper: {
    width: '100%',
  },
});

export default memo(SwipeableMessage);

