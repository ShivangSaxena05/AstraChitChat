import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ThemedText } from './themed-text';

interface Message {
  _id: string;
  sender: {
    name: string;
    profilePic: string;
  };
  receiver: {
    name: string;
    profilePic: string;
  };
  content: string;
  chatType: string;
  createdAt: string;
}

interface ChatBubbleProps {
  message: Message;
  isCurrentUser: boolean;
}

export default function ChatBubble({ message, isCurrentUser }: ChatBubbleProps) {
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={[styles.container, isCurrentUser ? styles.sent : styles.received]}>
      {!isCurrentUser && (
        <Text style={styles.senderName}>{message.sender.name}</Text>
      )}

      <View style={[styles.bubble, isCurrentUser ? styles.sentBubble : styles.receivedBubble]}>
        {message.chatType === 'text' && (
          <ThemedText style={[styles.messageText, isCurrentUser ? styles.sentText : styles.receivedText]}>
            {message.content}
          </ThemedText>
        )}

        {message.chatType === 'image' && (
          <View style={styles.mediaContainer}>
            <Text style={styles.mediaPlaceholder}>[Image]</Text>
          </View>
        )}

        {message.chatType === 'video' && (
          <View style={styles.mediaContainer}>
            <Text style={styles.mediaPlaceholder}>[Video]</Text>
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
    marginVertical: 4,
    marginHorizontal: 8,
    maxWidth: '80%',
  },
  sent: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  received: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
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
    maxWidth: '100%',
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
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    marginBottom: 8,
  },
  mediaPlaceholder: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },
  timestamp: {
    fontSize: 11,
    marginTop: 4,
  },
  sentTimestamp: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'right',
  },
  receivedTimestamp: {
    color: '#666',
    textAlign: 'left',
  },
});
