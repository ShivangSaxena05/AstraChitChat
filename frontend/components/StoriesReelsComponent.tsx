import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, Text, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { get } from '@/services/api';

interface Story {
  id: string;
  userId?: string;
  username: string;
  profilePicture: string;
  isUserStory?: boolean;
}

const mockStories: Story[] = [
  { id: 'add', username: 'Your Story', profilePicture: '', isUserStory: true },
];

export default function StoriesReelsComponent() {
  const [stories, setStories] = useState<Story[]>(mockStories);
  const [loading, setLoading] = useState(true);

  // MEDIUM FIX: Fetch real stories from API
  useEffect(() => {
    fetchStories();
  }, []);

  const fetchStories = async () => {
    try {
      // Attempt to fetch stories from API
      const data = await get('/stories/active');
      if (data?.stories && Array.isArray(data.stories)) {
        // Prepend "Your Story" button
        setStories([mockStories[0], ...data.stories.map((s: any) => ({
          id: s._id || s.id,
          userId: s.userId,
          username: s.username || s.user?.username || 'Unknown',
          profilePicture: s.profilePicture || s.user?.profilePicture || '',
        }))]);
      }
    } catch (error) {
      console.warn('Failed to fetch stories, using default:', error);
      // Fallback to mock data
      setStories(mockStories);
    } finally {
      setLoading(false);
    }
  };

  const handleStoryPress = (storyId: string) => {
    if (storyId === 'add') {
      console.log('Create story tapped');
    } else {
      console.log('Story pressed:', storyId);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollView}>
        {stories.map((story) => (
          <TouchableOpacity
            key={story.id}
            style={styles.storyContainer}
            onPress={() => handleStoryPress(story.id)}
          >
            <View style={[styles.storyCircle, story.isUserStory && styles.addStoryCircle]}>
              {story.profilePicture && !story.isUserStory ? (
                <Image source={{ uri: story.profilePicture }} style={styles.storyImage} />
              ) : (
                <View style={styles.addIcon}>
                  <Text style={styles.addText}>+</Text>
                </View>
              )}
            </View>
            <Text style={styles.username} numberOfLines={1}>
              {story.username}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    backgroundColor: '#000',
  },
  scrollView: {
    paddingHorizontal: 16,
  },
  storyContainer: {
    alignItems: 'center',
    marginRight: 16,
  },
  storyCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  addStoryCircle: {
    borderStyle: 'dashed',
  },
  storyImage: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  addIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  addText: {
    fontSize: 24,
    color: '#007AFF',
    fontWeight: 'bold',
  },
  username: {
    fontSize: 12,
    color: 'white',
    textAlign: 'center',
    maxWidth: 60,
  },
});
