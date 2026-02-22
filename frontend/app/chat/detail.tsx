import React, { useEffect, useState, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { get, post } from '@/services/api';
import { SOCKET_URL } from '@/services/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';

interface Message {
  _id: string;
  sender: {
    _id: string;
    username: string;
    profilePicture: string;
  };
  receiver: {
    _id: string;
    username: string;
    profilePicture: string;
  };
  msgType: string;
  bodyText?: string;
  mediaUrl?: string;
  mediaMime?: string;
  mediaSizeBytes?: number;
  quotedMsgId?: string;
  editedAt?: string;
  unsentAt?: string;
  unsentBy?: string;
  content?: string; // Legacy support
  createdAt: string;
  read?: boolean;
}

export default function ChatDetailScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const socketRef = useRef<Socket | null>(null);
  const router = useRouter();
  const params = useLocalSearchParams();
  const chatId = params.chatId as string;
  const otherUserId = params.otherUserId as string;
  const otherUsername = params.otherUsername as string;

  useEffect(() => {
    const initialize = async () => {
      // Reset state when chatId changes
      setMessages([]);
      setLoading(true);

      const userId = await AsyncStorage.getItem('userId');
      setCurrentUserId(userId);

      // Initialize socket connection
      const token = await AsyncStorage.getItem('token');
      const newSocket = io(SOCKET_URL, {
        auth: { token }
      });

      socketRef.current = newSocket;
      setSocket(newSocket);

      // Socket event listeners
      newSocket.on('connect', () => {
        console.log('Connected to socket');
        setSocketConnected(true);
        newSocket.emit('setup', { _id: userId });
        newSocket.emit('join chat', chatId);
      });

      newSocket.on('disconnect', () => {
        console.log('Disconnected from socket');
        setSocketConnected(false);
      });

      newSocket.on('message received', (message: Message) => {
        // Check if message already exists to prevent duplicates
        setMessages(prev => {
          const exists = prev.some(m => m._id === message._id);
          if (exists) return prev;
          return [...prev, message];
        });
        // Scroll to bottom when new message arrives
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      });

      fetchMessages();
    };

    initialize();

    return () => {
      if (socketRef.current) {
        socketRef.current.off('connect');
        socketRef.current.off('disconnect');
        socketRef.current.off('message received');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [chatId]);

  const fetchMessages = async () => {
    try {
      setLoading(true); // Ensure loading is true at the start of fetch
      const data = await get(`/chats/${chatId}/messages`);
      setMessages(data.messages);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to fetch messages');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !currentUserId || !socketRef.current || !socketConnected) return;

    try {
      const messageData = {
        sender: currentUserId,
        receiver: otherUserId,
        chat: chatId,
        content: newMessage.trim(),
        msgType: 'text'
      };

      // Send via socket
      socketRef.current.emit('new message', messageData);

      // Optimistically add to UI
      // const tempMessage: Message = {
      //   _id: Date.now().toString(),
      //   sender: { _id: currentUserId, username: 'You', profilePicture: '' },
      //   receiver: { _id: otherUserId, username: otherUsername, profilePicture: '' },
      //   content: newMessage.trim(),
      //   createdAt: new Date().toISOString(),
      //   msgType: ''
      // };

      // setMessages(prev => [...prev, tempMessage]);
      // setNewMessage('');

      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);

    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to send message');
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwnMessage = item.sender._id === currentUserId;

    return (
      <View style={[styles.messageContainer, isOwnMessage ? styles.ownMessage : styles.otherMessage]}>
        <Text style={[styles.messageText, isOwnMessage ? styles.ownMessageText : styles.otherMessageText]}>
          {item.unsentAt ? '[Message unsent]' : (item.bodyText || item.content)}
        </Text>
        {item.editedAt && !item.unsentAt && (
          <Text style={[styles.editedText, isOwnMessage ? styles.ownEditedText : styles.otherEditedText]}>
            (edited)
          </Text>
        )}
        <View style={styles.timestampContainer}>
          <Text style={[styles.timestamp, isOwnMessage ? styles.ownTimestamp : styles.otherTimestamp]}>
            {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {isOwnMessage && (
            <Text style={styles.readStatus}>
              {item.read ? '✓✓' : '✓'}
            </Text>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <Text>Loading messages...</Text>
      </ThemedView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <ThemedText type="subtitle">{otherUsername}</ThemedText>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item._id}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContainer}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={newMessage}
          onChangeText={setNewMessage}
          placeholder="Type a message..."
          placeholderTextColor="#666"
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, (!socketConnected || !newMessage.trim()) && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!socketConnected || !newMessage.trim()}
        >
          <Text style={[styles.sendButtonText, (!socketConnected || !newMessage.trim()) && styles.sendButtonTextDisabled]}>
            {socketConnected ? 'Send' : 'Connecting...'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    fontSize: 24,
    marginRight: 16,
    color: '#007AFF',
  },
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    padding: 16,
  },
  messageContainer: {
    maxWidth: '80%',
    marginBottom: 12,
    padding: 12,
    borderRadius: 16,
  },
  ownMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f0f0',
  },
  messageText: {
    fontSize: 16,
  },
  ownMessageText: {
    color: '#fff',
  },
  otherMessageText: {
    color: '#000',
  },
  timestamp: {
    fontSize: 12,
    marginTop: 4,
  },
  ownTimestamp: {
    color: '#e0e0e0',
    textAlign: 'right',
  },
  otherTimestamp: {
    color: '#666',
  },
  timestampContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  readStatus: {
    fontSize: 12,
    color: '#e0e0e0',
    marginLeft: 8,
  },
  editedText: {
    fontSize: 12,
    marginTop: 2,
  },
  ownEditedText: {
    color: '#e0e0e0',
  },
  otherEditedText: {
    color: '#999',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
    maxHeight: 100,
    color: '#000', // Default text color
  },
  sendButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  sendButtonTextDisabled: {
    color: '#999',
  },
});
