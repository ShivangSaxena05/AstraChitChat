import TopHeaderComponent from '@/components/TopHeaderComponent';
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { get, post } from '@/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/hooks/use-theme-color';

interface User {
  _id: string;
  username: string;
  name: string;
  profilePicture: string;
}

export default function AddChatScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const colors = useTheme();

  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      searchUsers();
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const searchUsers = async () => {
    if (!searchQuery.trim()) return;

    try {
      setLoading(true);
      const data = await get(`/users/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(data.users || []);
    } catch (error: any) {
      console.error('Search error:', error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to search users');
    } finally {
      setLoading(false);
    }
  };

  const startChat = async (user: User) => {
    try {
      const currentUserId = await AsyncStorage.getItem('userId');
      if (!currentUserId) throw new Error('User not logged in');
      const { data } = await post('/chats', { participants: [currentUserId, user._id] });
      router.push({
        pathname: '/chat/detail',
        params: {
          chatId: data._id,
          otherUserId: user._id,
          otherUsername: user.username
        }
      });
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to start chat');
    }
  };

  const renderUser = ({ item }: { item: User }) => (
    <TouchableOpacity style={[styles.userItem, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => startChat(item)}>
      <Image 
        source={{ uri: item.profilePicture || 'https://i.pravatar.cc/150' }} 
        style={styles.avatar} 
      />
      <View style={styles.userInfo}>
        <ThemedText type="subtitle">{item.username}</ThemedText>
        <Text style={{ color: colors.textTertiary, marginTop: 4 }}>{item.name}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <ThemedView style={styles.container}>
      {/* Top Header now handles back navigation */}
      <TopHeaderComponent />

      <View style={styles.searchContainer}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search users by username or name..."
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      ) : searchResults.length > 0 ? (
        <FlatList
          data={searchResults}
          renderItem={renderUser}
          keyExtractor={(item) => item._id}
          style={styles.resultsList}
          contentContainerStyle={styles.resultsContainer}
        />
      ) : searchQuery.trim().length > 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No users found</Text>
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Search for users to start a chat</Text>
        </View>
      )}
    </ThemedView>
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
  },
  backButton: {
    fontSize: 24,
    marginRight: 16,
    color: '#388e3c', // Theme: light.success (static style, using fallback)
  },
  searchContainer: {
    padding: 16,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
  },
  resultsList: {
    flex: 1,
  },
  resultsContainer: {
    padding: 16,
  },
  userItem: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
  userName: {
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
