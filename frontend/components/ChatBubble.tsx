import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ThemedText } from './themed-text';

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

  return (
    <View style={[styles.container, isCurrentUser ? styles.sent : styles.received]}>
      {!isCurrentUser && (
        <Text style={styles.senderName}>{displayName}</Text>
      )}

      <View style={[styles.bubble, isCurrentUser ? styles.sentBubble : styles.receivedBubble]}>
        {message.chatType === 'text' && (
          <ThemedText style={[styles.messageText, isCurrentUser ? styles.sentText : styles.receivedText]}>
            {message.content}
          </ThemedText>
        )}

        {message.chatType === 'image' && (
          <View style={styles.mediaContainer}>
            <Text style={styles.mediaPlaceholder}>🖼️ Image</Text>
          </View>
        )}

        {message.chatType === 'video' && (
          <View style={styles.mediaContainer}>
            <Text style={styles.mediaPlaceholder}>🎥 Video</Text>
          </View>
        )}

        <Text style={[styles.timestamp, isCurrentUser ? styles.sentTimestamp : styles.receivedTimestamp]}>
          {formatTime(message.createdAt)}
        </Text>
      </View>
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
    color: '#666',
    marginBottom: 4,
    marginLeft: 12,
  },
  bubble: {
    padding: 12,
    borderRadius: 18,
    maxWidth: '80%',
  },
  sentBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  receivedBubble: {
    backgroundColor: '#E5E5EA',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  sentText: {
    color: '#fff',
  },
  receivedText: {
    color: '#000',
  },
  mediaContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
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
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'right',
  },
  receivedTimestamp: {
    color: '#999',
  },
});
