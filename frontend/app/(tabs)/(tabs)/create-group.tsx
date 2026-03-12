import TopHeaderComponent from '@/components/TopHeaderComponent';
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Image, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { get, post } from '@/services/api';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface User {
  _id: string;
  username: string;
  name: string;
  profilePicture: string;
}

export default function CreateGroupScreen() {
  const [groupTitle, setGroupTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    const fetchUserId = async () => {
      const id = await AsyncStorage.getItem('userId');
      setCurrentUserId(id);
    };
    fetchUserId();
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim().length > 0) {
        searchUsers();
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const searchUsers = async () => {
    try {
      setSearching(true);
      const data = await get(`/chats/search?q=${searchQuery}`);
      // Filter out users already selected
      const filteredData = data.filter((user: User) => !selectedUsers.find(u => u._id === user._id));
      setSearchResults(filteredData);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };

  const toggleUserSelection = (user: User) => {
    const isSelected = selectedUsers.find(u => u._id === user._id);
    if (isSelected) {
      setSelectedUsers(selectedUsers.filter(u => u._id !== user._id));
    } else {
      setSelectedUsers([...selectedUsers, user]);
    }
    setSearchQuery(''); // Clear search after selection to make it easier to search again
    setSearchResults([]);
  };

  const handleCreateGroup = async () => {
    if (groupTitle.trim().length === 0) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }
    if (selectedUsers.length < 2) {
      Alert.alert('Error', 'Please select at least two other participants');
      return;
    }

    try {
      setLoading(true);
      const participantIds = selectedUsers.map(u => u._id);
      
      const response = await post('/chats/group', {
        title: groupTitle.trim(),
        participants: participantIds
      });

      if (response._id) {
        Alert.alert('Success', 'Group created safely!');
        // Navigate backwards, chat list will refetch
        router.back();
      }
    } catch (error: any) {
      console.error('Create group error:', error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  const renderSearchedUser = ({ item }: { item: User }) => (
    <TouchableOpacity style={styles.userRow} onPress={() => toggleUserSelection(item)}>
      <Image source={{ uri: item.profilePicture || 'https://i.pravatar.cc/150' }} style={styles.avatar} />
      <View style={styles.userInfo}>
        <ThemedText style={styles.userName}>{item.name}</ThemedText>
        <Text style={styles.userHandle}>@{item.username}</Text>
      </View>
      <Ionicons name="add-circle-outline" size={24} color="#4ADDAE" />
    </TouchableOpacity>
  );

  const renderSelectedUser = ({ item }: { item: User }) => (
    <View style={styles.selectedUserBadge}>
      <Image source={{ uri: item.profilePicture || 'https://i.pravatar.cc/150' }} style={styles.selectedAvatar} />
      <Text style={styles.selectedUserName} numberOfLines={1}>{item.username}</Text>
      <TouchableOpacity 
        style={styles.removeUserBtn} 
        onPress={() => toggleUserSelection(item)}
      >
        <Ionicons name="close-circle" size={20} color="#ff4444" />
      </TouchableOpacity>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      {/* Top Header with back navigation */}
      <TopHeaderComponent />

      {/* Group Info Input */}
      <View style={styles.inputSection}>
        <View style={styles.groupIconPlaceholder}>
          <Ionicons name="camera" size={32} color="#aaa" />
        </View>
        <TextInput
          style={styles.titleInput}
          placeholder="Group Subject"
          placeholderTextColor="#999"
          value={groupTitle}
          onChangeText={setGroupTitle}
          maxLength={25}
        />
      </View>

      <View style={styles.divider} />

      {/* Selected Users Horizontal List */}
      {selectedUsers.length > 0 && (
        <View style={styles.selectedSection}>
          <Text style={styles.participantCountText}>Participants: {selectedUsers.length}</Text>
          <FlatList
            horizontal
            data={selectedUsers}
            renderItem={renderSelectedUser}
            keyExtractor={item => item._id}
            showsHorizontalScrollIndicator={false}
            style={styles.selectedList}
          />
        </View>
      )}

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search friends to add..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* Search Results */}
      {searching ? (
        <ActivityIndicator size="large" color="#4ADDAE" style={styles.loader} />
      ) : (
        <FlatList
          data={searchResults}
          renderItem={renderSearchedUser}
          keyExtractor={item => item._id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.resultsList}
          ListEmptyComponent={
            searchQuery.trim().length > 0 ? (
              <Text style={styles.emptyText}>No users found.</Text>
            ) : null
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#151718',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 50, // accommodate safe area roughly
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  createBtn: {
    padding: 8,
  },
  createText: {
    color: '#4ADDAE',
    fontWeight: 'bold',
    fontSize: 16,
  },
  disabledText: {
    color: '#555',
  },
  inputSection: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  groupIconPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  titleInput: {
    flex: 1,
    fontSize: 18,
    color: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#4ADDAE',
    paddingVertical: 8,
  },
  divider: {
    height: 10,
    backgroundColor: '#000',
  },
  selectedSection: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  participantCountText: {
    color: '#999',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: 'bold',
  },
  selectedList: {
    flexGrow: 0,
  },
  selectedUserBadge: {
    alignItems: 'center',
    marginRight: 16,
    width: 64,
  },
  selectedAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginBottom: 4,
  },
  selectedUserName: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
  },
  removeUserBtn: {
    position: 'absolute',
    top: -4,
    right: 4,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
  },
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    margin: 16,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
  },
  resultsList: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
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
    fontSize: 16,
    fontWeight: 'bold',
  },
  userHandle: {
    color: '#999',
    fontSize: 14,
    marginTop: 2,
  },
  loader: {
    marginTop: 32,
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
    marginTop: 32,
    fontSize: 16,
  }
});
