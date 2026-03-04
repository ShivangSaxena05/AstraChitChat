import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { get, post } from '@/services/api';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, StyleSheet, TouchableOpacity, View, useColorScheme } from 'react-native';

interface FollowRequest {
  _id: string;
  name: string;
  username: string;
  profilePicture: string;
}

export default function FollowRequestsScreen() {
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const colorScheme = useColorScheme();

  useFocusEffect(
    useCallback(() => {
      fetchRequests();
    }, [])
  );

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await get('/follow/requests');
      setRequests(res.requests || []);
    } catch (error: any) {
      console.error('Fetch requests error:', error);
      Alert.alert('Error', 'Failed to fetch follow requests');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (userId: string) => {
    try {
      await post(`/follow/requests/${userId}/accept`, {});
      setRequests(prev => prev.filter(req => req._id !== userId));
    } catch (error: any) {
      Alert.alert('Error', 'Failed to accept follow request');
    }
  };

  const handleReject = async (userId: string) => {
    try {
      await post(`/follow/requests/${userId}/reject`, {});
      setRequests(prev => prev.filter(req => req._id !== userId));
    } catch (error: any) {
      Alert.alert('Error', 'Failed to reject follow request');
    }
  };

  const renderRequest = ({ item }: { item: FollowRequest }) => (
    <View style={styles.userRow}>
      <Image source={{ uri: item.profilePicture || 'https://i.pravatar.cc/150' }} style={styles.avatar} />
      <View style={styles.userInfo}>
        <ThemedText style={styles.username}>{item.username}</ThemedText>
        <ThemedText style={styles.name}>{item.name}</ThemedText>
      </View>
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={[styles.actionButton, styles.acceptButton]} onPress={() => handleAccept(item._id)}>
          <ThemedText style={styles.acceptText}>Accept</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.rejectButton]} onPress={() => handleReject(item._id)}>
          <ThemedText style={styles.rejectText}>Reject</ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colorScheme === 'dark' ? '#333' : '#ccc',
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
      color: 'gray',
    },
    buttonContainer: {
      flexDirection: 'row',
      gap: 8,
    },
    actionButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
    },
    acceptButton: {
      backgroundColor: '#4ADDAE',
    },
    rejectButton: {
      backgroundColor: colorScheme === 'dark' ? '#444' : '#efefef',
    },
    acceptText: {
      fontWeight: 'bold',
      color: '#fff',
    },
    rejectText: {
      fontWeight: 'bold',
    },
    emptyText: {
      padding: 16,
      textAlign: 'center',
      color: 'gray',
    }
  }), [colorScheme]);

  if (loading && requests.length === 0) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={requests}
        keyExtractor={item => item._id}
        renderItem={renderRequest}
        ListEmptyComponent={<ThemedText style={styles.emptyText}>No pending follow requests</ThemedText>}
      />
    </ThemedView>
  );
}
