import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Modal,
  Text,
  ActivityIndicator,
  FlatList,
  Alert,
  Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { get, post } from '@/services/api';
import { useTheme } from '@/hooks/use-theme-color';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

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
  textOverlay: Array<{
    text: string;
    fontSize: number;
    color: string;
    x: number;
    y: number;
  }>;
  viewers: Array<{
    userId: string;
    viewedAt: string;
  }>;
  createdAt: string;
  expiresAt: string;
}

interface StoryViewerProps {
  stories: Story[];
  initialIndex?: number;
  onClose: () => void;
}

export default function StoryViewer({
  stories,
  initialIndex = 0,
  onClose
}: StoryViewerProps) {
  const theme = useTheme();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [currentStoryProgress, setCurrentStoryProgress] = useState(0);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<any[]>([]);
  const [isLoadingViewers, setIsLoadingViewers] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const storyTimeout = useRef<NodeJS.Timeout | null>(null);

  const currentStory = stories[currentIndex];

  useEffect(() => {
    recordStoryView();
    startStoryProgress();

    return () => {
      if (storyTimeout.current) {
        clearTimeout(storyTimeout.current);
      }
    };
  }, [currentIndex]);

  const recordStoryView = async () => {
    try {
      await post(`/stories/${currentStory._id}/view`, {});
    } catch (error) {
      console.error('Error recording story view:', error);
    }
  };

  const startStoryProgress = () => {
    if (storyTimeout.current) {
      clearTimeout(storyTimeout.current);
    }

    setCurrentStoryProgress(0);
    progressAnim.setValue(0);

    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 5000,
      useNativeDriver: false
    }).start();

    storyTimeout.current = setTimeout(() => {
      if (currentIndex < stories.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        onClose();
      }
    }, 5000);
  };

  const goToPreviousStory = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goToNextStory = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onClose();
    }
  };

  const fetchViewers = async () => {
    if (isLoadingViewers) return;

    try {
      setIsLoadingViewers(true);
      const response = await get(`/stories/${currentStory._id}/viewers`);

      if (response.success) {
        setViewers(response.data);
      }
    } catch (error) {
      console.error('Error fetching viewers:', error);
      Alert.alert('Error', 'Failed to load viewers');
    } finally {
      setIsLoadingViewers(false);
    }
  };

  const handleViewersPress = async () => {
    setShowViewers(true);
    await fetchViewers();
  };

  const isOwnStory = async () => {
    const userId = await AsyncStorage.getItem('userId');
    return userId === currentStory.user._id;
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%']
  });

  return (
    <View style={[styles.container, { backgroundColor: '#000' }]}>
      {/* Story Image */}
      <Image
        source={{ uri: currentStory.mediaUrl }}
        style={styles.storyImage}
        resizeMode="cover"
      />

      {/* Text Overlays */}
      {currentStory.textOverlay && currentStory.textOverlay.length > 0 && (
        <>
          {currentStory.textOverlay.map((text, index) => (
            <View
              key={index}
              style={[
                styles.textOverlay,
                {
                  left: text.x,
                  top: text.y,
                  transform: [{ rotate: '0deg' }]
                }
              ]}
            >
              <Text
                style={[
                  styles.overlayText,
                  {
                    fontSize: text.fontSize,
                    color: text.color
                  }
                ]}
              >
                {text.text}
              </Text>
            </View>
          ))}
        </>
      )}

      {/* Progress bar */}
      <Animated.View
        style={[
          styles.progressBar,
          {
            width: progressWidth
          }
        ]}
      />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <Image
            source={{ uri: currentStory.user.profilePicture }}
            style={styles.profilePicture}
          />
          <View>
            <Text style={styles.username}>
              {currentStory.user.username}
            </Text>
            <Text style={styles.timestamp}>
              {new Date(currentStory.createdAt).toLocaleString()}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Navigation */}
      <View style={styles.navigationContainer}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={goToPreviousStory}
          activeOpacity={0.7}
        >
          <View />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={goToNextStory}
          activeOpacity={0.7}
        >
          <View />
        </TouchableOpacity>
      </View>

      {/* Footer - Viewers */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.viewersButton}
          onPress={handleViewersPress}
        >
          <Ionicons name="eye" size={20} color="#FFF" />
          <Text style={styles.viewersText}>
            {currentStory.viewers?.length || 0} views
          </Text>
        </TouchableOpacity>
      </View>

      {/* Viewers Modal */}
      <Modal
        visible={showViewers}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowViewers(false)}
      >
        <View
          style={[styles.modal, { backgroundColor: theme.background }]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Story Views
            </Text>
            <TouchableOpacity onPress={() => setShowViewers(false)}>
              <Ionicons name="close" size={28} color={theme.text} />
            </TouchableOpacity>
          </View>

          {isLoadingViewers ? (
            <ActivityIndicator size="large" color={theme.tint} />
          ) : viewers.length > 0 ? (
            <FlatList
              data={viewers}
              keyExtractor={(item) => item.userId._id}
              renderItem={({ item }) => (
                <View style={[styles.viewerItem, { borderBottomColor: theme.card }]}>
                  <Image
                    source={{ uri: item.userId.profilePicture }}
                    style={styles.viewerProfilePic}
                  />
                  <View style={styles.viewerInfo}>
                    <Text style={[styles.viewerName, { color: theme.text }]}>
                      {item.userId.name}
                    </Text>
                    <Text style={[styles.viewerUsername, { color: theme.text + '66' }]}>
                      @{item.userId.username}
                    </Text>
                  </View>
                  <Text style={[styles.viewTime, { color: theme.text + '99' }]}>
                    {new Date(item.viewedAt).toLocaleTimeString()}
                  </Text>
                </View>
              )}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: theme.text }]}>
                No views yet
              </Text>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  storyImage: {
    ...StyleSheet.absoluteFillObject
  },
  textOverlay: {
    position: 'absolute'
  },
  overlayText: {
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 3
  },
  progressBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 3,
    backgroundColor: '#FFF',
    zIndex: 10
  },
  header: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  profilePicture: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12
  },
  username: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold'
  },
  timestamp: {
    color: '#FFF',
    fontSize: 12,
    opacity: 0.8
  },
  navigationContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 5
  },
  navButton: {
    flex: 1
  },
  footer: {
    position: 'absolute',
    bottom: 32,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center'
  },
  viewersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20
  },
  viewersText: {
    color: '#FFF',
    marginLeft: 8,
    fontSize: 14
  },
  modal: {
    flex: 1,
    paddingTop: 20
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0'
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold'
  },
  viewerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1
  },
  viewerProfilePic: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    marginRight: 12
  },
  viewerInfo: {
    flex: 1
  },
  viewerName: {
    fontSize: 14,
    fontWeight: '600'
  },
  viewerUsername: {
    fontSize: 12
  },
  viewTime: {
    fontSize: 12
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyText: {
    fontSize: 16
  }
});
