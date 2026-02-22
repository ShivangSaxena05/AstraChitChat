import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedView } from '@/components/themed-view';
import { SOCKET_URL } from '@/services/config';
import ChatBubble from '@/components/ChatBubble';

interface Message {
  _id: string;
  sender: { name: string; profilePic: string };
  receiver: { name: string; profilePic: string };
  content: string;
  chatType: string;
  createdAt: string;
}

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    initializeSocket();
    return () => {
      socket?.disconnect();
    };
  }, []);

  const initializeSocket = async () => {
    const token = await AsyncStorage.getItem('token');
    const id = await AsyncStorage.getItem('userId');
    setUserId(id);

    if (token && id) {
      const newSocket = io(SOCKET_URL, {
        auth: { token },
      });

      newSocket.on('connect', () => {
        newSocket.emit('setup', { _id: id });
      });

      newSocket.on('message received', (message: Message) => {
        setMessages(prev => [...prev, message]);
      });

      setSocket(newSocket);
    }
  };

  const sendMessage = () => {
    if (!newMessage.trim() || !socket || !userId) return;

    const messageData = {
      sender: userId,
      receiver: 'someReceiverId', // TODO: Implement user selection
      content: newMessage,
      chatType: 'text',
    };

    socket.emit('new message', messageData);
    setNewMessage('');
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <ChatBubble message={item} isCurrentUser={item.sender.name === 'Current User'} />
  );

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
          style={styles.input}
          value={newMessage}
          onChangeText={setNewMessage}
          placeholder="Type a message..."
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    backgroundColor: '#007AFF',
  },
  received: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5E5EA',
  },
  messageText: {
    color: '#000',
  },
  timestamp: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
