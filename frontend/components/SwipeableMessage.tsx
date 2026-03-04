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

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        const shouldAllow = isOwnMessage 
          ? gestureState.dx < 0 && gestureState.dx > -50
          : gestureState.dx > 0 && gestureState.dx < 50;

        if (shouldAllow) {
          translateX.setValue(gestureState.dx * 0.4);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const swipeDistance = isOwnMessage ? -gestureState.dx : gestureState.dx;
        
        if (swipeDistance > SWIPE_THRESHOLD) {
          onSwipeReply();
        }

        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 40,
          friction: 8,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
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
  },
  messageWrapper: {
    // styling passed through children
  },
});

export default memo(SwipeableMessage);

