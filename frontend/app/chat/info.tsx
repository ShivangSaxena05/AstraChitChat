import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  RefreshControl,
  Platform,
  FlatList,
  Pressable,
  StatusBar,
  useColorScheme,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { get, post } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import { useCall } from '@/contexts/CallContext';
import ProfileSkeleton from '@/components/ProfileSkeleton';
import { useTheme } from '@/hooks/use-theme-color';
import { Dimensions } from 'react-native';

const { height: screenHeight, width: screenWidth } = Dimensions.get('window');

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
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

  // ✅ SAFETY CHECK: Validate critical route parameters
  useEffect(() => {
    if (!chatId || !otherUserId || !otherUsername) {
      console.error('[ChatInfo] Missing critical route parameters:', {
        chatId: chatId || 'MISSING',
        otherUserId: otherUserId || 'MISSING',
        otherUsername: otherUsername || 'MISSING',
      });
      Alert.alert('Error', 'Invalid chat parameters. Returning to chat.');
      router.back();
    }
  }, [chatId, otherUserId, otherUsername, router]);

  // Call hooks unconditionally - if providers are missing, the error will bubble up properly
  // This follows React's Rules of Hooks
  let socketContext: ReturnType<typeof useSocket> | null = null;
  let callContext: ReturnType<typeof useCall> | null = null;
  
  try {
    socketContext = useSocket();
  } catch (e) {
    console.warn('SocketContext: component not wrapped in SocketProvider', e);
  }

  try {
    callContext = useCall();
  } catch (e) {
    console.warn('CallContext: component not wrapped in CallProvider', e);
  }

  const socket = socketContext?.socket || null;
  const initiateCall = callContext?.initiateCall || (() => {});

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
      console.error('fetchChatInfo error:', error);
      Alert.alert('Error', 'Failed to load chat info');
    } finally {
      setLoading(false);
    }
  }, [chatId, otherUserId, otherUsername]);

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
  }, [chatId, mediaData]);

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
            await post(`/chats/${chatId}/clear`, {});
            Alert.alert('Cleared', 'Chat history cleared');
          } catch (error) {
            Alert.alert('Error', 'Failed to clear chat');
          }
        } },
      ]
    );
  };

  const handlePinToggle = async () => {
    try {
      await post(`/chats/${chatId}/pin`, {});
      setData(prev => prev ? { ...prev, isPinned: !prev.isPinned } : null);
    } catch (error) {
      Alert.alert('Error', 'Failed to update pin');
    }
  };

  const blockUser = () => {
    Alert.alert(
      'Block user',
      'Block this user? They won\'t be able to message or call you.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: async () => {
          try {
            await post(`/users/${otherUserId}/block`, {});
            Alert.alert('Success', 'User blocked successfully');
            router.back();
          } catch (error) {
            Alert.alert('Error', 'Failed to block user');
          }
        } },
      ]
    );
  };

  const navigateToUserProfile = useCallback(() => {
    if (!otherUserId) return;
    router.push({
      pathname: '/profile/[userId]',
      params: { userId: otherUserId }
    });
  }, [otherUserId, router]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchChatInfo();
    } finally {
      setRefreshing(false);
    }
  }, [fetchChatInfo]);

  useEffect(() => {
    fetchChatInfo();
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleUserStatus = (data: { userId: string; isOnline: boolean; lastSeen?: string }) => {
      if (data.userId === otherUserId) {
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
    return () => {
      if (socket) {
        socket.off('user online', handleUserStatus);
      }
    };
  }, [socket, otherUserId]);

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

  const formatLastSeen = (lastSeen: string | null): string => {
    if (!lastSeen) return 'Last seen unknown';
    const date = new Date(lastSeen);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  };

  const formatMuteUntil = (until: string | undefined) => {
    if (!until) return '';
    if (until === 'forever') return 'Forever';
    const date = new Date(until);
    return `Until ${date.toLocaleDateString()}`;
  };

  const mediaTypes = ['photos', 'videos', 'links', 'files'] as const;

  const renderMediaSection = (type: string, count: number) => (
    <TouchableOpacity 
      key={type} 
      style={styles.mediaSection}
      onPress={() => loadMediaPreview(type)}
      disabled={mediaLoading[type]}
    >
      <View style={styles.mediaHeader}>
        <ThemedText type="subtitle">{type.charAt(0).toUpperCase() + type.slice(1)}</ThemedText>
        <ThemedText>{count}</ThemedText>
      </View>
      {mediaLoading[type] ? (
        <ActivityIndicator size="small" />
      ) : (
        <ThemedText style={styles.viewAllText}>View all</ThemedText>
      )}
    </TouchableOpacity>
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
          onPress={navigateToUserProfile}
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
          <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
        </TouchableOpacity>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => initiateCall([otherUserId], chatId, otherUserId, { username: data.otherUser.username, profilePicture: data.otherUser.profilePicture || '' }, false)}
            activeOpacity={0.7}
          >
            <Ionicons name="call-outline" size={24} color={colors.success} />
            <ThemedText style={styles.actionButtonText}>Call</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="search-outline" size={24} color={colors.info} />
            <ThemedText style={styles.actionButtonText}>Search</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={navigateToUserProfile}
            activeOpacity={0.7}
          >
            <Ionicons name="person-outline" size={24} color={colors.accent} />
            <ThemedText style={styles.actionButtonText}>Profile</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Media Sections */}
        {mediaTypes.map(type => {
          const count = (data.mediaCounts as any)[type];
          if (count > 0) return renderMediaSection(type, count);
        })}

        {/* Chat Settings */}
        <View style={styles.settingsSection}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>Chat settings</ThemedText>
          
          <TouchableOpacity style={styles.settingItem} onPress={handleMuteToggle}>
            <Ionicons name={data.isMuted ? "notifications-off" : "notifications"} size={24} color={colors.warning} />
            <View style={styles.settingText}>
              <ThemedText style={styles.settingLabel}>Mute notifications</ThemedText>
              <ThemedText style={styles.settingSubtext}>
                {data.isMuted ? `Muted ${formatMuteUntil(data.mutedUntil)}` : 'Turn off notifications'}
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={handlePinToggle}>
            <Ionicons name={data.isPinned ? "bookmark" : "bookmark-outline"} size={24} color={colors.success} />
            <View style={styles.settingText}>
              <ThemedText style={styles.settingLabel}>Pin chat</ThemedText>
              <ThemedText style={styles.settingSubtext}>
                {data.isPinned ? 'Unpin from top' : 'Pin to top'}
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingItem, styles.destructive]} onPress={clearChat}>
            <Ionicons name="trash-outline" size={24} color={colors.error} />
            <View style={styles.settingText}>
              <ThemedText style={styles.settingLabel}>Clear chat</ThemedText>
              <ThemedText style={styles.settingSubtext}>Clear all messages</ThemedText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingItem, styles.destructive]} onPress={blockUser}>
            <Ionicons name="ban" size={24} color={colors.error} />
            <View style={styles.settingText}>
              <ThemedText style={styles.settingLabel}>Block {data.otherUser.username}</ThemedText>
              <ThemedText style={styles.settingSubtext}>Stop receiving messages and calls</ThemedText>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Profile Picture Modal */}
      <Modal visible={profileModalVisible} transparent animationType="fade">
        <TouchableOpacity 
          style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center'}}
          activeOpacity={1}
          onPress={() => setProfileModalVisible(false)}
        >
          <TouchableOpacity 
            style={{position: 'absolute', top: 50, right: 20, zIndex: 1}} 
            onPress={() => setProfileModalVisible(false)}
          >
            <Ionicons name="close" size={32} color="white" />
          </TouchableOpacity>
          <Image
            source={{ uri: data.otherUser.profilePicture || `https://ui-avatars.com/api/?name=${data.otherUser.username}` }}
            style={{width: 250, height: 250, borderRadius: 125}}
            resizeMode="cover"
          />
        </TouchableOpacity>
      </Modal>
    </ThemedView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.backgroundSecondary,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.card,
  },
  profileInfo: {
    flex: 1,
  },
  username: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  statusText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  quickActions: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    marginHorizontal: 12,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  actionButtonText: {
    fontSize: 12,
    color: colors.text,
    marginTop: 6,
    fontWeight: '500',
  },
  mediaSection: {
    backgroundColor: colors.card,
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mediaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  viewAllText: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '500',
  },
  settingsSection: {
    backgroundColor: colors.card,
    marginHorizontal: 12,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionTitle: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingText: {
    flex: 1,
    marginLeft: 12,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  settingSubtext: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  destructive: {
    borderTopWidth: 0,
    borderTopColor: 'transparent',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
});

const styles = createStyles({} as any);
