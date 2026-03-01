import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// --- IMPORTS ---
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { get } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';

// Import all required UI components for the header structure
import SearchBarComponent from '@/components/SearchBarComponent';
import StoriesReelsComponent from '@/components/StoriesReelsComponent';
import TopHeaderComponent from '@/components/TopHeaderComponent';
import OtherProfileScreen from './other-profile';

// Subscreens to embed
import FlicksScreen from './flicks';
import ExploreScreen from './explore';

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

// --- HOME SCREEN COMPONENT ---
export default function HomeScreen() {
  const { conversations, setConversations, currentUserId: socketUserId } = useSocket();
  const chats = conversations as Chat[];
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'chats' | 'flicks' | 'explore'>('chats');
  
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
      const data = await get('/chats');
      if (data && data.chats) {
        // Sort chats by most recent message First so the Home list is correct initially
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
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
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
      {/* Top Header - Incorporates the Multi-Account Switcher now! */}
      <TopHeaderComponent />

      {/* Premium Tab Toggle */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={styles.tab}
          onPress={() => setActiveTab('chats')}
          activeOpacity={0.8}
        >
          <View style={[styles.tabTrapezoid, activeTab === 'chats' ? styles.activeTabTrapezoid : styles.inactiveTabTrapezoid]} />
          {activeTab === 'chats' && <View style={styles.activeTabGlowLine} />}
          <Text style={[styles.tabText, activeTab === 'chats' && styles.activeTabText]}>
            Chats
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.tab}
          onPress={() => setActiveTab('flicks')}
          activeOpacity={0.8}
        >
          <View style={[styles.tabTrapezoid, activeTab === 'flicks' ? styles.activeTabTrapezoid : styles.inactiveTabTrapezoid]} />
          {activeTab === 'flicks' && <View style={styles.activeTabGlowLine} />}
          <Text style={[styles.tabText, activeTab === 'flicks' && styles.activeTabText]}>
            Flicks
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tab}
          onPress={() => setActiveTab('explore')}
          activeOpacity={0.8}
        >
          <View style={[styles.tabTrapezoid, activeTab === 'explore' ? styles.activeTabTrapezoid : styles.inactiveTabTrapezoid]} />
          {activeTab === 'explore' && <View style={styles.activeTabGlowLine} />}
          <Text style={[styles.tabText, activeTab === 'explore' && styles.activeTabText]}>
            Explore
          </Text>
        </TouchableOpacity>
      </View>

      {/* RENDER CONTENT BASED ON ACTIVE TAB */}
      <View style={styles.contentArea}>
        {activeTab === 'chats' && (
          <>
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
          </>
        )}

        {activeTab === 'flicks' && <FlicksScreen />}
        
        {activeTab === 'explore' && <ExploreScreen isEmbedded={true} />}
      </View>

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
  tabContainer: {
    flexDirection: 'row',
    height: 50,
    backgroundColor: '#111',
    marginHorizontal: 16,
    borderRadius: 25,
    overflow: 'hidden',
    position: 'relative',
    marginTop: 10,
    marginBottom: 10,
    padding: 3,
  },
  tab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },
  tabTrapezoid: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 22,
    borderWidth: 1,
  },
  activeTabTrapezoid: {
    backgroundColor: 'rgba(74, 221, 174, 0.15)',
    borderColor: 'rgba(74, 221, 174, 0.4)',
  },
  inactiveTabTrapezoid: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  activeTabGlowLine: {
    position: 'absolute',
    bottom: 0,
    width: '60%',
    height: 3,
    backgroundColor: '#4ADDAE',
    borderRadius: 3,
    shadowColor: '#4ADDAE',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 5,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#888',
    letterSpacing: 0.5,
  },
  activeTabText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  contentArea: {
    flex: 1,
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
