import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { get } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Chat {
  _id: string;
  participants: {
    _id: string;
    username: string;
    profilePicture: string;
  }[];
  lastMessage: {
    text: string;
    createdAt: string;
  };
  unreadCount: number;
}

export default function ChatListScreen() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const initialize = async () => {
      const userId = await AsyncStorage.getItem('userId');
      setCurrentUserId(userId);
    };
    initialize();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (currentUserId) {
        fetchChats();
      }
    }, [currentUserId])
  );

  const fetchChats = async () => {
    try {
      const data = await get('/chats'); // Assuming this endpoint exists
      setChats(data.chats);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to fetch chats');
    } finally {
      setLoading(false);
    }
  };

  const renderChat = ({ item }: { item: Chat }) => {
    const otherParticipant = item.participants.find(p => p._id !== currentUserId);

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => router.push({
          pathname: '/chat/detail',
          params: {
            chatId: item._id,
            otherUserId: otherParticipant?._id || '',
            otherUsername: otherParticipant?.username || ''
          }})}
      >
        <View style={styles.chatContent}>
          <ThemedText type="subtitle">{otherParticipant?.username || 'Unknown'}</ThemedText>
          <Text style={styles.lastMessage}>{item.lastMessage?.text || 'No messages yet'}</Text>
        </View>
        {item.unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{item.unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <Text>Loading chats...</Text>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Chats</ThemedText>
      <FlatList
        data={chats}
        renderItem={renderChat}
        keyExtractor={(item) => item._id}
        showsVerticalScrollIndicator={false}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    marginBottom: 16,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  chatContent: {
    flex: 1,
  },
  lastMessage: {
    color: '#666',
    marginTop: 4,
  },
  unreadBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
