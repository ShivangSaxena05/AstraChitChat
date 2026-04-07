import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { ThemedText } from './themed-text';
import { useTheme } from '@/hooks/use-theme-color';

interface Message {
  _id: string;
  sender: {
    _id: string;
    name: string;
    profilePic: string;
  };
  receiver: {
    _id: string;
    name: string;
    profilePic: string;
  };
  content: string;
  chatType: string;
  createdAt: string;
}

interface ChatBubbleProps {
  message: Message;
  currentUserId: string | null;
}

export default function ChatBubble({ message, currentUserId }: ChatBubbleProps) {
  const colors = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    // Fade in animation on mount
    Animated.sequence([
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [scaleAnim, opacityAnim]);

  const handlePressIn = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // ✅ FIX 4.2: Proper message direction logic
  const isCurrentUser = useMemo(() => {
    return currentUserId && message.sender._id === currentUserId;
  }, [currentUserId, message.sender._id]);

  const displayName = useMemo(() => {
    return message.sender?.name || 'Unknown User';
  }, [message.sender?.name]);

  const timestamp: any = styles.timestamp;
  const sentTimestamp: any = [
    styles.sentTimestamp,
    { color: 'rgba(255, 255, 255, 0.7)' }
  ];
  const receivedTimestamp: any = [
    styles.receivedTimestamp,
    { color: colors.textTertiary }
  ];

  return (
    <View style={[styles.container, isCurrentUser ? styles.sent : styles.received]}>
      {!isCurrentUser && (
        <Text style={[styles.senderName, { color: colors.textSecondary }]}>{displayName}</Text>
      )}

      <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut}>
        <Animated.View
          style={[
            styles.bubble,
            isCurrentUser
              ? [styles.sentBubble, { backgroundColor: colors.tint }]
              : [styles.receivedBubble, { backgroundColor: colors.card }],
            {
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
        {message.chatType === 'text' && (
          <ThemedText
            style={[
              styles.messageText,
              isCurrentUser ? styles.sentText : [styles.receivedText, { color: colors.text }],
            ]}
          >
            {message.content}
          </ThemedText>
        )}

        {message.chatType === 'image' && (
          <View style={[styles.mediaContainer, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={styles.mediaPlaceholder}>🖼️ Image</Text>
          </View>
        )}

        {message.chatType === 'video' && (
          <View style={[styles.mediaContainer, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={styles.mediaPlaceholder}>🎥 Video</Text>
          </View>
        )}

        <Text style={isCurrentUser ? sentTimestamp : receivedTimestamp}>
          {formatTime(message.createdAt)}
        </Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    marginHorizontal: 12,
    flexDirection: 'row',
  },
  sent: {
    justifyContent: 'flex-end',
  },
  received: {
    justifyContent: 'flex-start',
  },
  senderName: {
    fontSize: 12,
    marginBottom: 4,
    marginLeft: 12,
  },
  bubble: {
    padding: 12,
    borderRadius: 18,
    maxWidth: '80%',
  },
  sentBubble: {
    borderBottomRightRadius: 4,
  },
  receivedBubble: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  sentText: {
    // Color will be applied dynamically via inline style
  },
  receivedText: {
    // Color will be applied dynamically via inline style
  },
  mediaContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  mediaPlaceholder: {
    fontSize: 14,
    textAlign: 'center',
  },
  timestamp: {
    fontSize: 12,
    marginTop: 6,
  },
  sentTimestamp: {
    textAlign: 'right',
    // color will be applied dynamically
  },
  receivedTimestamp: {
    // color will be applied dynamically
  },
});
