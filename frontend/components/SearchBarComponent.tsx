import * as api from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface SearchResult {
  _id: string;
  username?: string;
  name?: string;
  profilePicture?: string;
  type: 'user' | 'chat' | 'query';
}

const styles = StyleSheet.create({
  container: { position: 'relative', zIndex: 1 },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#000',
    alignItems: 'center',
  },
  searchIcon: { marginRight: 10 },
  searchInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#333',
    borderRadius: 20,
    paddingHorizontal: 16,
    color: 'white',
    paddingLeft: 40,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: '#333',
    borderRadius: 10,
    maxHeight: 300,
    zIndex: 10,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  suggestionText: { color: 'white', fontSize: 16, marginLeft: 10 },
  profilePic: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#555',
  },
  loadingContainer: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: '#333',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: { color: 'white', fontSize: 16, marginLeft: 10 },
  errorContainer: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: '#d9534f',
    borderRadius: 10,
    padding: 12,
    zIndex: 10,
  },
  errorText: { color: 'white', fontSize: 16, textAlign: 'center' },
});

export default function SearchBarComponent() {
  const router = require('expo-router').useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowSuggestions(false);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('Making search request for:', query);
      const data = await api.get(`/users/search?q=${encodeURIComponent(query)}`);
      console.log('Search response data:', data);

      // Handle both formats: { users: [...] } or direct array
      const usersArray = Array.isArray(data) ? data : data.users || [];
      const users = usersArray.map((user: any) => ({ ...user, type: 'user' }));

      // Add typed query as first suggestion
      setSearchResults([{ _id: 'query', username: query, type: 'query' }, ...users]);
      setShowSuggestions(true);
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.response?.data?.message || err.message || 'Search failed');
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

    if (searchQuery.trim().length > 0) {
      setError(null);
      debounceTimeout.current = setTimeout(() => handleSearch(searchQuery), 300);
    } else {
      setShowSuggestions(false);
      setSearchResults([]);
      setError(null);
    }

    return () => {
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    };
  }, [searchQuery]);

  const handleResultPress = (item: SearchResult) => {
    if (item.type === 'query') {
      handleSearch(item.username || '');
      return;
    }

    if (item.type === 'user') {
      // Navigate to home tab with profile modal
      router.push({ pathname: '/', params: { showProfile: item._id } });
    } else {
      router.push({ pathname: '/chat', params: { chatId: item._id } });
    }

    setSearchQuery('');
    setSearchResults([]);
    setShowSuggestions(false);
  };

  const handleMessage = async (userId: string) => {
    try {
      const data = await api.post('/chats', { participants: [userId] });
      router.push(`/chat?chatId=${data._id}`);
      setSearchQuery('');
      setSearchResults([]);
      setShowSuggestions(false);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to start chat');
    }
  };

  const renderSuggestion = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity style={styles.suggestionItem} onPress={() => handleResultPress(item)}>
      {item.type === 'query' ? (
        <Ionicons name="search-outline" size={20} color="#888" />
      ) : item.profilePicture ? (
        <Image source={{ uri: item.profilePicture }} style={styles.profilePic} />
      ) : (
        <Ionicons name="person-circle-outline" size={24} color="#007AFF" />
      )}
      <Text style={styles.suggestionText}>
        {item.type === 'query' ? `Search for "${item.username}"` : item.username}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color="#888" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search users and chats..."
          placeholderTextColor="#888"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={() => handleSearch(searchQuery)}
          returnKeyType="search"
        />
      </View>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {showSuggestions && !loading && !error && searchResults.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <FlatList
            data={searchResults}
            keyExtractor={item => item._id || item.username || Math.random().toString()}
            renderItem={renderSuggestion}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      )}
    </View>
  );
}
