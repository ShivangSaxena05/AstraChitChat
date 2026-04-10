import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, Text, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { get } from '@/services/api';
import { useTheme } from '@/hooks/use-theme-color';

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
  const colors = useTheme();
  const router = useRouter();
  const [stories, setStories] = useState<Story[]>(mockStories);
  const [loading, setLoading] = useState(true);

  // MEDIUM FIX: Fetch real stories from API
  useEffect(() => {
    fetchStories();
  }, []);

  const fetchStories = async () => {
    try {
      // Attempt to fetch stories from API - use /feed endpoint
      const data = await get('/stories/feed');
      if (data?.data && Array.isArray(data.data)) {
        // Prepend "Your Story" button
        setStories([mockStories[0], ...data.data.map((s: any) => ({
          id: s._id || s.id,
          userId: s.author?._id || s.userId,
          username: s.author?.username || s.username || 'Unknown',
          profilePicture: s.author?.profilePicture || s.profilePicture || '',
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
      router.push('/story/create');
    } else {
      console.log('Story pressed:', storyId);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="small" color={colors.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollView}>
        {stories.map((story) => (
          <TouchableOpacity
            key={story.id}
            style={styles.storyContainer}
            onPress={() => handleStoryPress(story.id)}
          >
            <View style={[styles.storyCircle, { borderColor: colors.tint }, story.isUserStory && styles.addStoryCircle]}>
              {story.profilePicture && !story.isUserStory ? (
                <Image source={{ uri: story.profilePicture }} style={styles.storyImage} />
              ) : (
                <View style={styles.addIcon}>
                  <Text style={[styles.addText, { color: colors.tint }]}>+</Text>
                </View>
              )}
            </View>
            <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>
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
    // backgroundColor will be applied dynamically
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
    // borderColor will be applied dynamically
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
    fontWeight: 'bold',
    // color will be applied dynamically
  },
  username: {
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 60,
    // color will be applied dynamically
  },
});
