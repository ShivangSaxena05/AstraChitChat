import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Text,
  ActivityIndicator,
  Modal,
  Dimensions,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { get } from '@/services/api';
import { useTheme } from '@/hooks/use-theme-color';
import StoryViewer from './StoryViewer';

const { width: screenWidth } = Dimensions.get('window');

interface Story {
  _id: string;
  mediaUrl: string;
  mediaType: string;
  user: {
    _id: string;
    name: string;
    username: string;
    profilePicture: string;
  };
  textOverlay: Array<any>;
  viewers: Array<any>;
  createdAt: string;
  expiresAt: string;
}

export default function StoriesFeed() {
  const router = useRouter();
  const theme = useTheme();
  const [stories, setStories] = useState<Story[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const [selectedStoryIndex, setSelectedStoryIndex] = useState(0);
  const [groupedStories, setGroupedStories] = useState<{
    [key: string]: Story[];
  }>({});

  useEffect(() => {
    fetchStories();
  }, []);

  const fetchStories = async () => {
    try {
      setIsLoading(true);
      const response = await get('/stories/feed');

      if (response.success) {
        setStories(response.data);
        groupStoriesByUser(response.data);
      }
    } catch (error) {
      console.error('Error fetching stories:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const groupStoriesByUser = (storiesList: Story[]) => {
    const grouped: { [key: string]: Story[] } = {};

    storiesList.forEach((story) => {
      const userId = story.user._id;
      if (!grouped[userId]) {
        grouped[userId] = [];
      }
      grouped[userId].push(story);
    });

    setGroupedStories(grouped);
  };

  const handleStoryPress = (userId: string) => {
    const userStories = groupedStories[userId];
    const storyIndex = stories.findIndex(
      (s) => s.user._id === userId
    );
    setSelectedStoryIndex(storyIndex);
    setShowStoryViewer(true);
  };

  const getUserFirstStory = (userId: string) => {
    return groupedStories[userId]?.[0];
  };

  const getUserStoryCount = (userId: string) => {
    return groupedStories[userId]?.length || 0;
  };

  if (isLoading) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: theme.background, justifyContent: 'center' }
        ]}
      >
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  if (!stories || stories.length === 0) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: theme.background, justifyContent: 'center' }
        ]}
      >
        <Text style={[styles.emptyText, { color: theme.text }]}>
          No stories from your following
        </Text>
      </View>
    );
  }

  const uniqueUsers = Array.from(
    new Map(stories.map((s) => [s.user._id, s.user])).values()
  );

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Create Story Button */}
        <TouchableOpacity
          style={[
            styles.storyItem,
            {
              backgroundColor: theme.card,
              borderColor: theme.tint
            }
          ]}
          onPress={() => router.push('/story/create')}
        >
          <View style={styles.createStoryOverlay}>
            <Ionicons name="add" size={40} color={theme.tint} />
            <Text style={[styles.createStoryText, { color: theme.text }]}>
              Your
            </Text>
            <Text style={[styles.createStoryText, { color: theme.text }]}>
              Story
            </Text>
          </View>
        </TouchableOpacity>

        {/* Stories from Following */}
        {uniqueUsers.map((user) => {
          const firstStory = getUserFirstStory(user._id);
          const storyCount = getUserStoryCount(user._id);

          if (!firstStory) return null;

          return (
            <TouchableOpacity
              key={user._id}
              style={[
                styles.storyItem,
                {
                  borderColor: theme.tint,
                  borderWidth: 2
                }
              ]}
              onPress={() => handleStoryPress(user._id)}
            >
              <Image
                source={{ uri: firstStory.mediaUrl }}
                style={styles.storyImage}
              />
              <View
                style={[
                  styles.storyGradientOverlay,
                  { backgroundColor: 'rgba(0, 0, 0, 0.3)' }
                ]}
              />
              <View style={styles.storyUserInfo}>
                <Image
                  source={{ uri: user.profilePicture }}
                  style={styles.userAvatar}
                />
                <Text style={styles.username} numberOfLines={1}>
                  {user.username}
                </Text>
              </View>
              {storyCount > 1 && (
                <View style={styles.storyCountBadge}>
                  <Text style={styles.storyCountText}>
                    +{storyCount - 1}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Story Viewer Modal */}
      <Modal
        visible={showStoryViewer}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowStoryViewer(false)}
      >
        <StoryViewer
          stories={stories}
          initialIndex={selectedStoryIndex}
          onClose={() => setShowStoryViewer(false)}
        />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 120
  },
  scrollContent: {
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  storyItem: {
    width: 90,
    height: 100,
    borderRadius: 12,
    marginHorizontal: 5,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    borderWidth: 2
  },
  storyImage: {
    ...StyleSheet.absoluteFillObject
  },
  storyGradientOverlay: {
    ...StyleSheet.absoluteFillObject
  },
  storyUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 6,
    zIndex: 2
  },
  userAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 4
  },
  username: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
    flex: 1
  },
  storyCountBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#FF0000',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    zIndex: 3
  },
  storyCountText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: 'bold'
  },
  createStoryOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  createStoryText: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center'
  }
});
