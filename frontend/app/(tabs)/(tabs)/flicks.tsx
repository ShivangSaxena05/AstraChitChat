import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, StyleSheet, Dimensions, Alert, TouchableOpacity, Text, Image, RefreshControl, ActivityIndicator, useColorScheme } from 'react-native';
import { FlatList, ViewToken } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { get, post } from '@/services/api';
import { Share } from 'react-native';

const { height: screenHeight } = Dimensions.get('window');

interface Flick {
  _id: string;
  mediaUrl: string;
  mediaType: string;
  caption: string;
  user: {
    username: string;
    profilePicture: string;
  };
  createdAt: string;
}

export default function FlicksScreen() {
  const [flicks, setFlicks] = useState<Flick[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentVisibleIndex, setCurrentVisibleIndex] = useState<number | null>(null);
  const [likedFlicks, setLikedFlicks] = useState<Set<string>>(new Set());
  const videoRefs = useRef<{ [key: string]: Video }>({});
  const colorScheme = useColorScheme();

  useEffect(() => {
    fetchFlicks();
  }, []);

  const fetchFlicks = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      }
      const data = await get('/posts/flicks');
      setFlicks(data.flicks);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to fetch flicks');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = useCallback(() => {
    fetchFlicks(true);
  }, []);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const visibleIndex = viewableItems[0].index;
      setCurrentVisibleIndex(visibleIndex ?? null);
    }
  }, []);

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50,
  };

  const handleLike = async (flickId: string) => {
    try {
      await post(`/posts/${flickId}/like`);
      setLikedFlicks(prev => {
        const newSet = new Set(prev);
        if (newSet.has(flickId)) {
          newSet.delete(flickId);
        } else {
          newSet.add(flickId);
        }
        return newSet;
      });
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to like flick');
    }
  };

  const handleComment = (flickId: string) => {
    // TODO: Navigate to comments screen when implemented
    Alert.alert('Coming Soon', 'Comments feature will be available soon!');
  };

  const handleShare = async (flick: Flick) => {
    try {
      await Share.share({
        message: `Check out this flick: ${flick.caption}`,
        url: flick.mediaUrl,
      });
    } catch (error: any) {
      Alert.alert('Error', 'Failed to share flick');
    }
  };

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    flickContainer: {
      height: screenHeight,
      width: '100%',
    },
    video: {
      flex: 1,
    },
    overlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 20,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    overlayContent: {
      flex: 1,
    },
    userInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: 12,
    },
    username: {
      color: '#fff',
      fontWeight: 'bold',
    },
    captionContainer: {
      marginBottom: 20,
    },
    caption: {
      color: '#fff',
      fontSize: 16,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    actionButton: {
      alignItems: 'center',
      padding: 10,
    },
    actionIcon: {
      fontSize: 24,
      color: '#fff',
    },
    loadingText: {
      color: '#4ADDAE',
      marginTop: 10,
      fontSize: 16,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    emptyText: {
      fontSize: 18,
      color: colorScheme === 'dark' ? '#ccc' : '#666',
      textAlign: 'center',
      marginBottom: 10,
    },
    emptySubtext: {
      fontSize: 14,
      color: colorScheme === 'dark' ? '#999' : '#999',
      textAlign: 'center',
    },
  }), [colorScheme]);

  const renderFlick = ({ item, index }: { item: Flick; index: number }) => {
    const isVisible = index === currentVisibleIndex;
    const isLiked = likedFlicks.has(item._id);

    return (
      <View style={styles.flickContainer}>
        <Video
          ref={(ref: Video | null) => {
            if (ref) {
              videoRefs.current[item._id] = ref;
            }
          }}
          style={styles.video}
          source={{ uri: item.mediaUrl }}
          resizeMode={ResizeMode.COVER}
          isLooping
          shouldPlay={isVisible}
          isMuted={true}
          onPlaybackStatusUpdate={(status: AVPlaybackStatus) => {
            // Handle playback status if needed
          }}
        />
        <View style={styles.overlay}>
          <View style={styles.overlayContent}>
            {/* User Info */}
            <View style={styles.userInfo}>
              <Image
                source={{ uri: item.user.profilePicture || 'https://via.placeholder.com/40' }}
                style={styles.avatar}
              />
              <ThemedText type="subtitle" style={styles.username}>
                {item.user.username}
              </ThemedText>
            </View>

            {/* Caption */}
            <View style={styles.captionContainer}>
              <ThemedText style={styles.caption}>{item.caption}</ThemedText>
            </View>

            {/* Action Buttons */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleLike(item._id)}
              >
                <Text style={[styles.actionIcon, isLiked && { color: '#FF6B6B' }]}>
                  {isLiked ? '❤️' : '🤍'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleComment(item._id)}
              >
                <Text style={styles.actionIcon}>💬</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleShare(item)}
              >
                <Text style={styles.actionIcon}>📤</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4ADDAE" />
          <Text style={styles.loadingText}>Loading flicks...</Text>
        </View>
      </ThemedView>
    );
  }

  if (flicks.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No flicks available yet!</Text>
          <Text style={styles.emptySubtext}>Be the first to share a flick</Text>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={flicks}
        renderItem={renderFlick}
        keyExtractor={(item) => item._id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        snapToAlignment="start"
        decelerationRate="fast"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#4ADDAE"
            colors={['#4ADDAE']}
          />
        }
      />
    </ThemedView>
  );
}
