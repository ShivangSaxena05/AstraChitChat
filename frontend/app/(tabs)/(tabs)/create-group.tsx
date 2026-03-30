import TopHeaderComponent from '@/components/TopHeaderComponent';
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Image, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { get, post } from '@/services/api';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/hooks/use-theme-color';

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
  const colors = useTheme();

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
    <TouchableOpacity style={[styles.userRow, { borderBottomColor: colors.border }]} onPress={() => toggleUserSelection(item)}>
      <Image source={{ uri: item.profilePicture || 'https://i.pravatar.cc/150' }} style={styles.avatar} />
      <View style={styles.userInfo}>
        <ThemedText style={[styles.userName, { color: colors.text }]}>{item.name}</ThemedText>
        <Text style={[styles.userHandle, { color: colors.textTertiary }]}>@{item.username}</Text>
      </View>
      <Ionicons name="add-circle-outline" size={24} color={colors.tint} />
    </TouchableOpacity>
  );

  const renderSelectedUser = ({ item }: { item: User }) => (
    <View style={[styles.selectedUserBadge, { backgroundColor: colors.backgroundSecondary, borderRadius: 16 }]}>
      <Image source={{ uri: item.profilePicture || 'https://i.pravatar.cc/150' }} style={styles.selectedAvatar} />
      <Text style={[styles.selectedUserName, { color: colors.text }]} numberOfLines={1}>{item.username}</Text>
      <TouchableOpacity 
        style={[styles.removeUserBtn, { backgroundColor: colors.card }]} 
        onPress={() => toggleUserSelection(item)}
      >
        <Ionicons name="close-circle" size={20} color={colors.error} />
      </TouchableOpacity>
    </View>
  );

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      {/* Top Header with back navigation */}
      <TopHeaderComponent />

      {/* Group Info Input */}
      <View style={[styles.inputSection, { backgroundColor: colors.card }]}>
        <View style={[styles.groupIconPlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
          <Ionicons name="camera" size={32} color={colors.textMuted} />
        </View>
        <TextInput
          style={[styles.titleInput, { color: colors.text, borderBottomColor: colors.tint }]}
          placeholder="Group Subject"
          placeholderTextColor={colors.textMuted}
          value={groupTitle}
          onChangeText={setGroupTitle}
          maxLength={25}
        />
      </View>

      <View style={[styles.divider, { backgroundColor: colors.backgroundSecondary }]} />

      {/* Selected Users Horizontal List */}
      {selectedUsers.length > 0 && (
        <View style={[styles.selectedSection, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Text style={[styles.participantCountText, { color: colors.textSecondary }]}>Participants: {selectedUsers.length}</Text>
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
      <View style={[styles.searchSection, { backgroundColor: colors.backgroundSecondary }]}>
        <Ionicons name="search" size={20} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search friends to add..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Search Results */}
      {searching ? (
        <ActivityIndicator size="large" color={colors.tint} style={styles.loader} />
      ) : (
        <FlatList
          data={searchResults}
          renderItem={renderSearchedUser}
          keyExtractor={item => item._id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.resultsList}
          ListEmptyComponent={
            searchQuery.trim().length > 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No users found.</Text>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 50,
    borderBottomWidth: 1,
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
    fontWeight: 'bold',
    fontSize: 16,
  },
  disabledText: {
    fontSize: 16,
  },
  inputSection: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
  },
  groupIconPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  titleInput: {
    flex: 1,
    fontSize: 18,
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  divider: {
    height: 10,
  },
  selectedSection: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  participantCountText: {
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
    fontSize: 12,
    textAlign: 'center',
  },
  removeUserBtn: {
    position: 'absolute',
    top: -4,
    right: 4,
    borderRadius: 10,
  },
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
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
    fontSize: 14,
    marginTop: 2,
  },
  loader: {
    marginTop: 32,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 32,
    fontSize: 16,
  }
});
