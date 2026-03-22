  import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  RefreshControl,
  Platform,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { get, post } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import { useCall } from '@/contexts/CallContext';
import ChatMediaGrid from '@/components/ChatMediaGrid';
import ProfilePictureModal from '@/components/ProfilePictureModal';
import { ProfileSkeleton } from '@/components/ProfileSkeleton';

const { height: screenHeight } = Dimensions.get('window');

interface ChatInfoData {
  otherUser: {
    _id: string;
    username: string;
    profilePicture?: string;
    isOnline: boolean;
    lastSeen: string | null;
  };
  isMuted: boolean;
  mutedUntil?: string;
  isPinned: boolean;
  mediaCounts: {
    photos: number;
    videos: number;
    links: number;
    files: number;
  };
}

export default function ChatInfoScreen() {
  const [data, setData] = useState<ChatInfoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mediaLoading, setMediaLoading] = useState<Record<string, boolean>>({});
  const [mediaData, setMediaData] = useState<Record<string, any[]>>({});
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  const router = useRouter();
  const params = useLocalSearchParams();
  const chatId = params.chatId as string;
  const otherUserId = params.otherUserId as string;
  const otherUsername = params.otherUsername as string;

  const { socket } = useSocket();
  const { initiateCall } = useCall();

  // Fetch initial chat info
  const fetchChatInfo = useCallback(async () => {
    try {
      const [infoRes, statusRes] = await Promise.all([
        get(`/chats/${chatId}/info`).catch(() => null),
        get(`/chats/user-status/${otherUserId}`),
      ]);

      setData({
        otherUser: {
          _id: otherUserId,
          username: otherUsername,
          profilePicture: infoRes?.profilePicture || '',
          isOnline: statusRes.isOnline || false,
          lastSeen: statusRes.lastSeen || null,
        },
        isMuted: infoRes?.isMuted || false,
        mutedUntil: infoRes?.mutedUntil,
        isPinned: infoRes?.isPinned || false,
        mediaCounts: infoRes?.mediaCounts || { photos: 0, videos: 0, links: 0, files: 0 },
      });
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load chat info');
    } finally {
      setLoading(false);
    }
  }, [chatId, otherUserId, otherUsername]);

  // Load media preview for a type
  const loadMediaPreview = useCallback(async (type: string) => {
    if (mediaData[type]?.length) return;
    setMediaLoading(prev => ({ ...prev, [type]: true }));
    try {
      const res = await get(`/chats/${chatId}/media?type=${type}&limit=12`);
      setMediaData(prev => ({ ...prev, [type]: res.media || [] }));
    } catch (error) {
      console.log(`Failed to load ${type}`);
    } finally {
      setMediaLoading(prev => ({ ...prev, [type]: false }));
    }
  }, [chatId]);

  const handleMuteToggle = () => {
    Alert.alert(
      'Mute notifications',
      'Mute this chat?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mute for 7 days', onPress: () => muteChat('7d') },
        { text: 'Mute forever', onPress: () => muteChat('inf') },
      ]
    );
  };

  const muteChat = async (duration: '7d' | 'inf') => {
    try {
      await post(`/chats/${chatId}/mute`, { duration });
      setData(prev => prev ? { ...prev, isMuted: true, mutedUntil: duration === 'inf' ? 'forever' : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() } : null);
    } catch (error) {
      Alert.alert('Error', 'Failed to mute chat');
    }
  };

  const clearChat = () => {
    Alert.alert(
      'Clear chat',
      'Clear all messages in this chat?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: async () => {
          try {
            await post(`/chats/${chatId}/clear`);
            Alert.alert('Cleared', 'Chat history cleared');
          } catch (error) {
            Alert.alert('Error', 'Failed to clear chat');
          }
        } },
      ]
    );
  };

  const blockUser = () => {
    Alert.alert(
      'Block user',
      'Block this user? They won\'t be able to message or call you.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: () => {
          // Navigate to block/report flow or call API
          router.push('/profile/block/' + otherUserId);
        } },
      ]
    );
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchChatInfo();
    setRefreshing(false);
  }, [fetchChatInfo]);

  // Real-time status update
  useEffect(() => {
    if (!socket) return;

    const handleUserStatus = (data: { userId: string; isOnline: boolean; lastSeen?: string }) => {
      if (data.userId === otherUserId && data) {
        setData(prev => prev ? {
          ...prev,
          otherUser: {
            ...prev.otherUser,
            isOnline: data.isOnline,
            lastSeen: data.lastSeen || null,
          }
        } : null);
      }
    };

    socket.on('user online', handleUserStatus);

    return () => socket.off('user online', handleUserStatus);
  }, [socket, otherUserId]);

  useEffect(() => {
    fetchChatInfo();
  }, []);

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!data) {
    return (
      <ThemedView style={styles.errorContainer}>
        <ThemedText>Chat info not available</ThemedText>
      </ThemedView>
    );
  }

  const formatMuteUntil = (until: string | undefined) => {
    if (!until) return '';
    if (until === 'forever') return 'Forever';
    const date = new Date(until);
    return `Until ${date.toLocaleDateString()}`;
  };

  const mediaTypes = ['photos', 'videos', 'links', 'files'] as const;

  const renderMediaSection = (type: typeof mediaTypes[number]) => (
    <ChatMediaGrid
      key={type}
      mediaType={type}
      mediaItems={mediaData[type] || []}
      chatId={chatId}
      onViewAll={loadMediaPreview}
      loading={mediaLoading[type]}
      hasMore={data.mediaCounts[type as keyof typeof data.mediaCounts]! > (mediaData[type]?.length || 0)}
    />
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <TouchableOpacity 
          style={styles.profileHeader}
          onPress={() => setProfileModalVisible(true)}
          activeOpacity={0.7}
        >
          <View style={styles.avatarContainer}>
            <Image
              source={{ uri: data.otherUser.profilePicture || 'https://via.placeholder.com/80' }}
              style={styles.avatar}
            />
            {data.otherUser.isOnline && <View style={styles.onlineIndicator} />}
          </View>
          <View style={styles.profileInfo}>
            <ThemedText type="title" style={styles.username}>{data.otherUser.username}</ThemedText>
            <ThemedText style={styles.statusText}>
              {data.otherUser.isOnline ? 'Online' : `Last seen ${formatLastSeen(data.otherUser.lastSeen)}`}
            </ThemedText>
          </View>
        </TouchableOpacity>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => initiateCall([otherUserId], chatId)}>
            <Ionicons name="call-outline" size={24} color="#10b981" />
            <ThemedText>Audio Call</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => initiateCall([otherUserId], chatId, true)}>
            <Ionicons name="videocam-outline" size={24} color="#3b82f6" />
            <ThemedText>Video Call</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.back()}>
            <Ionicons name="search-outline" size={24} color="#6b7280" />
            <ThemedText>Search</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Media Sections */}
        {mediaTypes.map(type => (
          data.mediaCounts[type as keyof typeof data.mediaCounts]! > 0 && renderMediaSection(type)
        ))}

        {/* Chat Settings */}
        <View style={styles.settingsSection}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>Chat settings</ThemedText>
          
          <TouchableOpacity style={styles.settingItem} onPress={handleMuteToggle}>
            <Ionicons name={data.isMuted ? "notifications-off" : "notifications"} size={24} color="#f59e0b" />
            <View style={styles.settingText}>
              <ThemedText style={styles.settingLabel}>Mute notifications</ThemedText>
              <ThemedText style={styles.settingSubtext}>
                {data.isMuted ? `Muted ${formatMuteUntil(data.mutedUntil)}` : 'Turn off notifications'}
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <Ionicons name={data.isPinned ? "push" : "push-outline"} size={24} color="#10b981" />
            <View style={styles.settingText}>
              <ThemedText style={styles.settingLabel}>Pin chat</ThemedText>
              <ThemedText style={styles.settingSubtext}>
                {data.isPinned ? 'Unpin from top' : 'Pin to top'}
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingItem, styles.destructive]} onPress={clearChat}>
            <Ionicons name="trash-outline" size={24} color="#ef4444" />
            <View style={styles.settingText}>
              <ThemedText style={styles.settingLabel}>Clear chat</ThemedText>
              <ThemedText style={styles.settingSubtext}>Clear all messages</ThemedText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingItem, styles.destructive]} onPress={blockUser}>
            <Ionicons name="block" size={24} color="#ef4444" />
            <View style={styles.settingText}>
              <ThemedText style={styles.settingLabel}>Block {data.otherUser.username}</ThemedText>
              <ThemedText style={styles.settingSubtext}>Stop receiving messages and calls</ThemedText>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Profile Picture Modal */}
      <Modal visible={profileModalVisible} transparent animationType="fade">
        <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center'}}>
          <TouchableOpacity style={{position: 'absolute', top: 50, right: 20, zIndex: 1}} onPress={() => setProfileModalVisible(false)}>
            <Ionicons name="close" size={32} color="white" />
          </TouchableOpacity>
          <Image
            source={{ uri: data.otherUser.profilePicture || 'https://ui-avatars.com/api/?name=' + data.otherUser.username }}
            style={{width: 250, height: 250, borderRadius: 125}}
            resizeMode="cover"
          />
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    margin: 16,
    marginBottom: 8,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#e5e7eb',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#10b981',
    borderWidth: 3,
    borderColor: 'white',
  },
  profileInfo: {
    flex: 1,
  },
  username: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 15,
    color: '#6b7280',
  },
  quickActions: {
    flexDirection: 'row',
    backgroundColor: 'white',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingsSection: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    borderRadius: 16,
    paddingVertical: 8,
    marginBottom: 20,
  },
  sectionTitle: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 18,
    fontWeight: '600',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  settingText: {
    flex: 1,
    marginLeft: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  settingSubtext: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  destructive: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#fee2e2',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
});

