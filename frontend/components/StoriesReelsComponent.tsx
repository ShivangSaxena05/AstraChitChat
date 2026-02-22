import React from 'react';
import { View, ScrollView, TouchableOpacity, Text, Image, StyleSheet } from 'react-native';

const mockStories = [
  { id: 'add', username: 'Your Story', image: null },
  { id: '1', username: 'User1', image: 'https://via.placeholder.com/50' },
  { id: '2', username: 'User2', image: 'https://via.placeholder.com/50' },
  { id: '3', username: 'User3', image: 'https://via.placeholder.com/50' },
  { id: '4', username: 'User4', image: 'https://via.placeholder.com/50' },
  { id: '5', username: 'User5', image: 'https://via.placeholder.com/50' },
];

export default function StoriesReelsComponent() {
  const handleStoryPress = (storyId: string) => {
    console.log('Story pressed:', storyId);
  };

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollView}>
        {mockStories.map((story) => (
          <TouchableOpacity
            key={story.id}
            style={styles.storyContainer}
            onPress={() => handleStoryPress(story.id)}
          >
            <View style={[styles.storyCircle, story.id === 'add' && styles.addStoryCircle]}>
              {story.image ? (
                <Image source={{ uri: story.image }} style={styles.storyImage} />
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
