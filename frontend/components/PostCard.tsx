import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { ThemedText } from './themed-text';
import { post as apiPost, put, del } from '@/services/api';

interface Post {
  _id: string;
  mediaUrl: string;
  mediaType: string;
  caption: string;
  user: {
    _id: string;
    username: string;
    profilePicture: string;
  };
  createdAt: string;
  likes?: number;
  comments?: number;
  likedBy?: string[];
}

interface PostCardProps {
  post: Post;
  currentUserId?: string | null;
  onLike?: (postId: string, liked: boolean) => void;
  onComment?: (postId: string) => void;
  onShare?: (postId: string) => void;
  onUpdate?: () => void;
}

export default function PostCard({
  post,
  currentUserId,
  onLike,
  onComment,
  onShare,
  onUpdate,
}: PostCardProps) {
  // ✅ FIX 4.1 & 6.3: Proper state management and sync
  const [isLiked, setIsLiked] = useState(
    post.likedBy ? post.likedBy.includes(currentUserId || '') : false
  );
  const [likeCount, setLikeCount] = useState(post.likes || 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);

  const videoRef = useRef<Video>(null);

  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  }, []);

  const handlePlayPause = useCallback(async () => {
    try {
      if (!videoRef.current) return;

      if (isPlaying) {
        await videoRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        setIsLoadingVideo(true);
        await videoRef.current.playAsync();
        setIsPlaying(true);
      }
      setVideoError(null);
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to control video playback';
      setVideoError(errorMsg);
      setIsPlaying(false);
      Alert.alert('Video Error', errorMsg);
    } finally {
      setIsLoadingVideo(false);
    }
  }, [isPlaying]);

  const handleLike = useCallback(async () => {
    try {
      if (isLiked) {
        await del(`/posts/${post._id}/unlike`);
        setIsLiked(false);
        setLikeCount((prev) => Math.max(0, prev - 1));
      } else {
        await apiPost(`/posts/${post._id}/like`, {});
        setIsLiked(true);
        setLikeCount((prev) => prev + 1);
      }
      onLike?.(post._id, !isLiked);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to update like');
      setIsLiked(!isLiked); // Revert on error
    }
  }, [post._id, isLiked, onLike]);

  const handleComment = useCallback(() => {
    onComment?.(post._id);
  }, [post._id, onComment]);

  const handleShare = useCallback(() => {
    onShare?.(post._id);
  }, [post._id, onShare]);

  const handleVideoStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (status.isLoaded && status.didJustFinish) {
      setIsPlaying(false);
    }
  }, []);

  return (
    <View style={styles.container}>
      {/* User Header */}
      <View style={styles.header}>
        <Image
          source={{
            uri: post.user.profilePicture || 'https://via.placeholder.com/40',
          }}
          style={styles.avatar}
        />
        <View style={styles.userInfo}>
          <ThemedText type="subtitle">{post.user.username}</ThemedText>
          <Text style={styles.date}>{formatDate(post.createdAt)}</Text>
        </View>
      </View>

      {/* Media Content */}
      {post.mediaType === 'image' && (
        <Image
          source={{ uri: post.mediaUrl }}
          style={styles.media}
          resizeMode="cover"
          onError={() => setVideoError('Failed to load image')}
        />
      )}

      {(post.mediaType === 'video' || post.mediaType === 'flick') && (
        <TouchableOpacity
          style={styles.media}
          onPress={handlePlayPause}
          disabled={isLoadingVideo}
        >
          <Video
            ref={videoRef}
            source={{ uri: post.mediaUrl }}
            style={styles.video}
            resizeMode={ResizeMode.COVER}
            isLooping
            shouldPlay={false}
            isMuted={true}
            useNativeControls={false}
            onPlaybackStatusUpdate={handleVideoStatusUpdate}
            onError={(error: string) => setVideoError(typeof error === 'string' ? error : 'Video error')}
          />
          {!isPlaying && (
            <View style={styles.playButtonContainer}>
              {isLoadingVideo ? (
                <ActivityIndicator color="#fff" size="large" />
              ) : (
                <View style={styles.playButton}>
                  <Text style={styles.playButtonText}>▶️</Text>
                </View>
              )}
            </View>
          )}
          {videoError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>⚠️ {videoError}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* Caption */}
      <View style={styles.content}>
        <ThemedText>{post.caption}</ThemedText>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
          <Text style={styles.actionIcon}>{isLiked ? '❤️' : '🤍'}</Text>
          <Text style={styles.actionText}>{likeCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleComment}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionText}>{post.comments || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
          <Text style={styles.actionIcon}>📤</Text>
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  date: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  media: {
    width: '100%',
    height: 300,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  playButtonContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  playButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonText: {
    fontSize: 28,
  },
  errorContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 8,
  },
  errorText: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
  },
  content: {
    padding: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionIcon: {
    fontSize: 18,
  },
  actionText: {
    fontSize: 14,
    color: '#666',
  },
});
