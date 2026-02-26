import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { get } from '@/services/api';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, TouchableOpacity, View, useColorScheme, Modal } from 'react-native';

interface User {
  _id: string;
  username: string;
  name: string;
  profilePicture: string;
}

type ListType = 'followers' | 'following';

export default function FollowersListScreen() {
  const { userId, username, type } = useLocalSearchParams<{ 
    userId: string; 
    username: string;
    type: ListType;
  }>();
  
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const router = useRouter();
  const navigation = useNavigation();
  const colorScheme = useColorScheme();

  const listType: ListType = type || 'followers';

  const fetchUsers = useCallback(async () => {
    try {
      const endpoint = listType === 'followers' 
        ? `/follow/${userId}/followers` 
        : `/follow/${userId}/following`;
      
      const data = await get(endpoint);
      setUsers(listType === 'followers' ? data.followers : data.following);
    } catch (error: any) {
      console.error('Fetch users error:', error);
      Alert.alert('Error', `Failed to fetch ${listType}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, listType]);

  // Fetch data when screen comes into focus
  React.useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchUsers();
  };

  const handleUserPress = (selectedUserId: string) => {
    setSelectedUserId(selectedUserId);
    setProfileModalVisible(true);
  };

  const handleCloseModal = () => {
    setProfileModalVisible(false);
    setSelectedUserId(null);
  };

  const renderUserItem = ({ item }: { item: User }) => (
    <TouchableOpacity 
      style={styles.userItem} 
      onPress={() => handleUserPress(item._id)}
    >
      <Image 
        source={{ uri: item.profilePicture || 'https://i.pravatar.cc/150' }} 
        style={styles.avatar} 
      />
      <View style={styles.userInfo}>
        <ThemedText style={styles.username}>{item.username}</ThemedText>
        <ThemedText style={styles.name}>{item.name}</ThemedText>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <ThemedText style={styles.emptyText}>
        {listType === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
      </ThemedText>
      <ThemedText style={styles.emptySubtext}>
        {listType === 'followers' 
          ? 'When someone follows you, they will appear here.' 
          : 'Start following people to see them here.'}
      </ThemedText>
    </View>
  );

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={users}
        renderItem={renderUserItem}
        keyExtractor={(item) => item._id}
        ListEmptyComponent={renderEmptyState}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        contentContainerStyle={users.length === 0 ? styles.emptyList : undefined}
      />
      
      {/* Profile Modal */}
      <Modal
        visible={profileModalVisible}
        animationType="slide"
        onRequestClose={handleCloseModal}
      >
        <ThemedView style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleCloseModal}
          >
            <ThemedText style={styles.closeButtonText}>✕</ThemedText>
          </TouchableOpacity>
          {selectedUserId && (
            <OtherProfileScreenWrapper userId={selectedUserId} onClose={handleCloseModal} />
          )}
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

// Wrapper component for OtherProfileScreen
import OtherProfileScreen from './other-profile';

function OtherProfileScreenWrapper({ userId, onClose }: { userId: string; onClose: () => void }) {
  const wrapperRouter = useRouter();
  
  const handleMessage = (chatId: string, otherUserId: string, otherUsername: string) => {
    onClose();
    // Navigate to chat
    wrapperRouter.push({
      pathname: '/chat/detail',
      params: { chatId, otherUserId, otherUsername }
    });
  };
  
  return <OtherProfileScreen userId={userId} onMessage={handleMessage} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  name: {
    fontSize: 14,
    opacity: 0.7,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyList: {
    flex: 1,
  },
  emptyText: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 10,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
  },
  modalContainer: {
    flex: 1,
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
  closeButtonText: {
    color: '#fff',
    fontSize: 18,
  },
});

