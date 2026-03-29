import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedView } from '@/components/themed-view';
import ChatBubble from '@/components/ChatBubble';
import { useSocket } from '@/contexts/SocketContext';
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

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [receiverId, setReceiverId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const { socket, isConnected, queueMessage } = useSocket();
  const colors = useTheme();

  // ✅ FIX 5.1: Proper socket listener cleanup and initialization
  useEffect(() => {
    const initializeChat = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        const id = await AsyncStorage.getItem('userId');

        if (!id) {
          Alert.alert('Error', 'User not found. Please login again.');
          return;
        }

        setUserId(id);
        setIsLoading(false);

        // Setup socket listeners
        if (socket) {
          // Remove old listeners to prevent duplicates
          socket.removeAllListeners('message received');
          socket.removeAllListeners('connect');

          const handleMessageReceived = (message: Message) => {
            setMessages((prev) => [...prev, message]);
            // Auto-scroll to bottom
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
          };

          const handleConnect = () => {
            if (socket) {
              socket.emit('setup', { _id: id });
            }
          };

          socket.on('message received', handleMessageReceived);
          socket.on('connect', handleConnect);

          return () => {
            socket.off('message received', handleMessageReceived);
            socket.off('connect', handleConnect);
          };
        }
      } catch (error) {
        console.error('[Chat] Initialization error:', error);
        Alert.alert('Error', 'Failed to initialize chat');
        setIsLoading(false);
      }
    };

    initializeChat();
  }, [socket]);

  // ✅ FIX 6.2: Proper message sending with validation
  const sendMessage = useCallback(async () => {
    if (!newMessage.trim()) {
      return;
    }

    if (!socket) {
      Alert.alert('Error', 'Not connected to chat server. Please wait...');
      return;
    }

    if (!userId || !receiverId) {
      Alert.alert('Error', 'Unable to send message. User information missing.');
      return;
    }

    const messageContent = newMessage.trim();
    setNewMessage('');
    setIsSending(true);

    try {
      const messageData = {
        sender: userId,
        receiver: receiverId,
        content: messageContent,
        chatType: 'text',
        createdAt: new Date().toISOString(),
      };

      if (isConnected) {
        socket.emit('new message', messageData, (ack: any) => {
          if (!ack?.success) {
            setIsSending(false);
            Alert.alert('Error', 'Failed to send message. Try again.');
            setNewMessage(messageContent); // Restore message
          } else {
            setIsSending(false);
          }
        });
      } else {
        // Queue message if offline
        queueMessage({
          tempId: `temp_${Date.now()}`,
          chatId: receiverId,
          receiverId,
          bodyText: messageContent,
          content: messageContent,
          msgType: 'text',
          createdAt: new Date().toISOString(),
          retryCount: 0,
        });
        setIsSending(false);
      }
    } catch (error) {
      console.error('[Chat] Error sending message:', error);
      setIsSending(false);
      Alert.alert('Error', 'Failed to send message');
      setNewMessage(messageContent);
    }
  }, [newMessage, socket, userId, receiverId, isConnected, queueMessage]);

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
      <ChatBubble message={item} currentUserId={userId} />
    ),
    [userId]
  );

  if (isLoading) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.tint} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item._id}
        style={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />
      <View style={styles.inputContainer}>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          value={newMessage}
          onChangeText={setNewMessage}
          placeholder="Type a message..."
          placeholderTextColor={colors.placeholder}
          editable={!isSending}
        />
        <TouchableOpacity
          style={[styles.sendButton, { backgroundColor: colors.tint }, isSending && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={isSending}
        >
          {isSending ? (
            <ActivityIndicator color={colors.card} size="small" />
          ) : (
            <Text style={styles.sendButtonText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesList: {
    flex: 1,
    padding: 10,
  },
  message: {
    maxWidth: '70%',
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  sent: {
    alignSelf: 'flex-end',
    backgroundColor: '#0a7ea4', // Theme: light.info / primary tint
  },
  received: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8e8e8', // Theme: light.backgroundTertiary
  },
  messageText: {
    color: '#1a1a1a', // Theme: light.text
  },
  timestamp: {
    fontSize: 12,
    color: '#888888', // Theme: light.textTertiary
    marginTop: 5,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
  },
  sendButton: {
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#ffffff', // Theme: white text
    fontWeight: 'bold',
  },
});
