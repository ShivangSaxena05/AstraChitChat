import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, Share } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { ThemedText } from './themed-text';
import { post as apiPost, put, del } from '@/services/api';

interface Post {
  _id: string;
  mediaUrl: string;
  mediaType: string;
  caption: string;
  user: {
    username: string;
    profilePicture: string;
  };
  createdAt: string;
  likes?: number;
  comments?: number;
}

interface PostCardProps {
  post: Post;
  onLike?: (postId: string) => void;
  onComment?: (postId: string) => void;
  onShare?: (postId: string) => void;
  onUpdate?: () => void; // Callback to refresh parent component
}

export default function PostCard({ post, onLike, onComment, onShare, onUpdate }: PostCardProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likes || 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<Video>(null);
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  return (
    <View style={styles.container}>
      {/* User Header */}
      <View style={styles.header}>
        <Image
          source={{ uri: post.user.profilePicture || 'https://via.placeholder.com/40' }}
          style={styles.avatar}
        />
        <View style={styles.userInfo}>
          <ThemedText type="subtitle">{post.user.username}</ThemedText>
          <Text style={styles.date}>{formatDate(post.createdAt)}</Text>
        </View>
      </View>

      {/* Media Content */}
      {post.mediaType === 'image' && (
        <Image source={{ uri: post.mediaUrl }} style={styles.media} resizeMode="cover" />
      )}
      {(post.mediaType === 'video' || post.mediaType === 'flick') && (
        <TouchableOpacity
          style={styles.media}
          onPress={async () => {
            if (videoRef.current) {
              if (isPlaying) {
                await videoRef.current.pauseAsync();
                setIsPlaying(false);
              } else {
                await videoRef.current.playAsync();
                setIsPlaying(true);
              }
            }
          }}
        >
          <Video
            ref={videoRef}
            source={{ uri: post.mediaUrl }}
            style={styles.video}
            resizeMode={ResizeMode.COVER}
            isLooping
            shouldPlay={isPlaying}
            isMuted={true}
            useNativeControls={false}
            onPlaybackStatusUpdate={(status: AVPlaybackStatus) => {
              if (status.isLoaded && status.didJustFinish) {
                setIsPlaying(false);
              }
            }}
          />
          {!isPlaying && (
            <View style={styles.playButton}>
              <Text style={styles.playButtonText}>▶️</Text>
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
        <TouchableOpacity
          style={styles.actionButton}
          onPress={async () => {
            try {
              await apiPost(`/posts/${post._id}/like`, {});
              setIsLiked(!isLiked);
              setLikeCount(prev => isLiked ? prev - 1 : prev + 1);
              onUpdate?.();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.message || 'Failed to like post');
            }
          }}
        >
          <Text style={[styles.actionText, isLiked && { color: '#FF6B6B' }]}>
            ❤️ {likeCount}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => onComment?.(post._id)}
        >
          <Text style={styles.actionText}>💬 {post.comments || 0}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={async () => {
            try {
              await Share.share({
                message: `Check out this post: ${post.caption}`,
                url: post.mediaUrl,
              });
            } catch (error) {
              Alert.alert('Error', 'Failed to share post');
            }
          }}
        >
          <Text style={styles.actionText}>📤 Share</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
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
    color: '#666',
    marginTop: 2,
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
  playButton: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 25,
    width: 50,
    height: 50,
  },
  playButtonText: {
    fontSize: 20,
    color: '#fff',
  },
  mediaPlaceholder: {
    color: '#666',
    fontSize: 16,
  },
  content: {
    padding: 12,
  },
  actions: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  actionText: {
    fontSize: 14,
    color: '#333',
  },
});
