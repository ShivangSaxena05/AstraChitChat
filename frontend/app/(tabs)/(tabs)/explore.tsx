import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, ActivityIndicator, TouchableOpacity, Image } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import * as api from '@/services/api';
import PostCard from '@/components/PostCard';
import TopHeaderComponent from '@/components/TopHeaderComponent';

export default function ExploreScreen() {
  const router = require('expo-router').useRouter();
  const { q } = require('expo-router').useLocalSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { users, posts } = await api.get(`/search?q=${encodeURIComponent(query)}`);
      // Combine users and posts, users first
      // Tag them with type
      const usersWithType = (users || []).map((u: any) => ({ ...u, _itemType: 'user' }));
      const postsWithType = (posts || []).map((p: any) => ({ ...p, _itemType: 'post' }));
      
      setResults([...usersWithType, ...postsWithType]);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (q) {
      setSearchQuery(String(q));
    }
  }, [q]);

  useEffect(() => {
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    if (searchQuery.trim().length > 0) {
      debounceTimeout.current = setTimeout(() => performSearch(searchQuery), 300);
    } else {
      setResults([]);
    }
    return () => {
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    };
  }, [searchQuery]);

  const renderUserCard = (user: any) => (
    <TouchableOpacity 
      style={styles.userCard}
      onPress={() => router.push(`/profile/${user._id}`)}
    >
      <Image 
        source={{ uri: user.profilePicture || 'https://via.placeholder.com/50' }} 
        style={styles.userAvatar} 
      />
      <View style={styles.userInfo}>
        <ThemedText style={styles.userName}>{user.name || user.username}</ThemedText>
        <Text style={styles.userUsername}>@{user.username}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#888" />
    </TouchableOpacity>
  );

  const renderItem = ({ item }: { item: any }) => {
    if (item._itemType === 'user') {
      return renderUserCard(item);
    }
    if (item._itemType === 'post') {
      return <PostCard post={item} />;
    }
    return null;
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.topHeader}>
        <TopHeaderComponent />
      </View>
      <View style={styles.searchHeader}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search users, videos, and posts..."
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearIcon}>
              <Ionicons name="close-circle" size={20} color="#888" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : results.length > 0 ? (
        <FlatList
          data={results}
          keyExtractor={(item, index) => item._id + index}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      ) : searchQuery.trim().length > 0 ? (
        <View style={styles.centerContainer}>
          <ThemedText style={styles.noResultsText}>No results found for &quot;{searchQuery}&quot;</ThemedText>
        </View>
      ) : (
        <View style={styles.centerContainer}>
          <Ionicons name="search-outline" size={64} color="#555" style={styles.placeholderIcon} />
          <ThemedText style={styles.placeholderTitle}>Discover More</ThemedText>
          <Text style={styles.placeholderText}>Search for users, videos, and interesting posts.</Text>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  topHeader: {
    backgroundColor: 'transparent',
  },
  searchHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    zIndex: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    borderRadius: 20,
    paddingHorizontal: 16,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  clearIcon: {
    marginLeft: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    height: '100%',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholderIcon: {
    marginBottom: 16,
  },
  placeholderTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#fff',
  },
  placeholderText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  noResultsText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 80,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    backgroundColor: '#111',
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    backgroundColor: '#333',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  userUsername: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
});
