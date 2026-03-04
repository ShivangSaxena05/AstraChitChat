import React, { memo, useRef } from 'react';
import { View, Text, StyleSheet, PanResponder, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
  const isSwipeActive = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipes
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 5;
      },
      onPanResponderGrant: () => {
        isSwipeActive.current = false;
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow swiping in the correct direction based on message type
        // For own messages (sent), swipe from right to left (negative dx)
        // For other messages (received), swipe from left to right (positive dx)
        const shouldAllow = isOwnMessage 
          ? gestureState.dx < 0 && gestureState.dx > -50  // Swipe left
          : gestureState.dx > 0 && gestureState.dx < 50;  // Swipe right

        if (shouldAllow) {
          isSwipeActive.current = true;
          // Apply the gesture with a damping factor for smoother feel
          translateX.setValue(gestureState.dx * 0.4);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // Check if swipe exceeded threshold
        const swipeDistance = isOwnMessage ? -gestureState.dx : gestureState.dx;
        
        if (swipeDistance > SWIPE_THRESHOLD) {
          // Trigger haptic feedback and reply
          onSwipeReply();
        }

        // Animate back to original position
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 40,
          friction: 8,
        }).start(() => {
          isSwipeActive.current = false;
        });
      },
      onPanResponderTerminate: () => {
        // Reset position if gesture is cancelled
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      {/* Reply Indicator - Shows on the side being swiped */}
      <View style={[
        styles.replyIndicator, 
        isOwnMessage ? styles.replyIndicatorLeft : styles.replyIndicatorRight
      ]}>
        <Ionicons name="arrow-undo" size={16} color="#4ADDAE" />
      </View>
      
      {/* Message Bubble with Pan Responder */}
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
    position: 'relative',
    marginVertical: 4,
    marginHorizontal: 8,
  },
  messageWrapper: {
    // The actual message styling will be passed through children
  },
  replyIndicator: {
    position: 'absolute',
    top: '50%',
    marginTop: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(74, 221, 174, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: -1,
  },
  replyIndicatorLeft: {
    left: -32,
  },
  replyIndicatorRight: {
    right: -32,
  },
});

export default memo(SwipeableMessage);

