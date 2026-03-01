import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// --- IMPORTS ---
// Assuming these paths are correct for your project structure
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { get } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';

// Import all required UI components for the header structure
import SearchBarComponent from '@/components/SearchBarComponent';
import StoriesReelsComponent from '@/components/StoriesReelsComponent';
import TopHeaderComponent from '@/components/TopHeaderComponent';
import OtherProfileScreen from './other-profile';


// --- INTERFACE ---
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
    sender?: {
      _id: string;
      username: string;
    };
  };
  unreadCount: number;
}

interface UserProfile {
  _id: string;
  username: string;
  profilePicture: string;
  bio: string;
  stats: {
    posts: number;
    followers: number;
    following: number;
  };
}

// --- CHAT LIST SCREEN COMPONENT ---
export default function ChatListScreen() {
  const { conversations, setConversations, currentUserId: socketUserId } = useSocket();
  const chats = conversations as Chat[];
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const router = useRouter();
  const { showProfile } = useLocalSearchParams<{ showProfile: string }>();

  useEffect(() => {
    const initialize = async () => {
      const userId = await AsyncStorage.getItem('userId');
      setCurrentUserId(userId);
      fetchChats();
    };
    initialize();
  }, []);

  useEffect(() => {
    if (showProfile) {
      setSelectedUserId(showProfile);
      setProfileModalVisible(true);
    }
  }, [showProfile]);

  const fetchChats = async () => {
    try {
      const data = await get('/chats'); // Assuming this endpoint exists
      if (data && data.chats) {
        // Sort chats by most recent message First so the Chat list is correct initially
        const sorted = data.chats.sort((a: Chat, b: Chat) => {
          const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
          const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
          return bTime - aTime;
        });
        setConversations(sorted);
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to fetch chats');
    } finally {
      setLoading(false);
    }
  };

  const renderChat = ({ item }: { item: Chat }) => {
    const otherParticipant = item.participants.find(p => p._id !== currentUserId);

    const isFromMe = String(item.lastMessage?.sender?._id) === String(currentUserId);
    const formatLastMessage = () => {
      if (!item.lastMessage?.text) return 'No messages yet';
      if (!isFromMe && item.lastMessage?.sender && item.participants.length > 2) {
        // Only prefix with username in group chats (if needed) or when preferred
        return `${item.lastMessage.text}`; 
      }
      return isFromMe ? `You: ${item.lastMessage.text}` : item.lastMessage.text;
    };

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => router.push({
          pathname: '/chat/detail',
          params: {
            chatId: item._id,
            otherUserId: otherParticipant?._id || '',
            otherUsername: otherParticipant?.username || ''
          }
        })}
      >
        <View style={styles.chatContent}>
          <ThemedText type="subtitle">{otherParticipant?.username || 'Unknown'}</ThemedText>
          <Text style={[styles.lastMessage, item.unreadCount > 0 && { color: '#fff', fontWeight: 'bold' }]} numberOfLines={1}>
            {formatLastMessage()}
          </Text>
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
        <TopHeaderComponent />
        <SearchBarComponent />
        <StoriesReelsComponent />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading chats...</Text>
        </View>
      </ThemedView>
    );
  }

  const handlePlusPress = () => {
    router.push('/chat/add');
  };

  const handleUserSelect = (userId: string) => {
    setSelectedUserId(userId);
    setProfileModalVisible(true);
  };

  const handleMessageFromProfile = (chatId: string, otherUserId: string, otherUsername: string) => {
    setProfileModalVisible(false);
    // Navigate to the chat detail screen
    router.push({
      pathname: '/chat/detail',
      params: {
        chatId,
        otherUserId,
        otherUsername
      }
    });
  };



  // --- MAIN RENDER ---
  return (
    <ThemedView style={styles.container}>
      {/* Top Header */}
      <TopHeaderComponent />
      <SearchBarComponent />
      <StoriesReelsComponent />

      {chats.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No chats yet. Start your first chat!</Text>
          <TouchableOpacity style={styles.plusButtonCenter} onPress={handlePlusPress}>
            <Ionicons name="add" size={48} color="#4ADDAE" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.chatsContainer}>
          <FlatList
            data={chats}
            renderItem={renderChat}
            keyExtractor={(item) => item._id}
            showsVerticalScrollIndicator={false}
          />
          <TouchableOpacity style={styles.plusButtonBottom} onPress={handlePlusPress}>
            <Ionicons name="add" size={24} color="white" />
          </TouchableOpacity>
        </View>
      )}

      {/* Profile Modal */}
      <Modal
        visible={profileModalVisible}
        animationType="slide"
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setProfileModalVisible(false)}
          >
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
          {selectedUserId && (
            <OtherProfileScreen userId={selectedUserId} onMessage={handleMessageFromProfile} />
          )}
        </View>
      </Modal>
    </ThemedView>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000', // Assuming a dark background
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    fontSize: 16,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  chatContent: {
    flex: 1,
  },
  lastMessage: {
    color: '#666',
    marginTop: 4,
  },
  unreadBadge: {
    backgroundColor: '#4ADDAE',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  unreadText: {
    color: '#000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  plusButtonCenter: {
    alignSelf: 'center',
    backgroundColor: '#000',
    borderRadius: 50,
    padding: 20,
    borderWidth: 2,
    borderColor: '#4ADDAE',
  },
  chatsContainer: {
    flex: 1,
  },
  plusButtonBottom: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#4ADDAE',
    borderRadius: 50,
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 10,
  },
});

