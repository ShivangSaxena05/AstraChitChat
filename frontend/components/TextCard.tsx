import React from 'react';
import {
  View,
  TouchableOpacity,
  Image,
  Text,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';

interface TextPost {
  _id: string;
  caption: string;
  user: {
    _id: string;
    username: string;
    profilePicture?: string;
  };
  createdAt: string;
  likes?: number;
  comments?: number;
}

const formatTimeAgo = (date?: string | null): string => {
  if (!date || typeof date !== 'string') return 'Recently';
  try {
    const now = new Date();
    const postDate = new Date(date);
    if (isNaN(postDate.getTime())) return 'Recently';
    const diffMs = now.getTime() - postDate.getTime();
    if (diffMs < 0) return 'Just now';
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return postDate.toLocaleDateString();
  } catch {
    return 'Recently';
  }
};

interface TextCardProps {
  item: TextPost;
  colors: any;
  onPress: () => void;
}

export const TextCard = ({ item, colors, onPress }: TextCardProps) => {
  const { width } = useWindowDimensions();
  const isTablet = width >= 600;
  const isDesktop = width >= 960;

  return (
    <TouchableOpacity
      style={[
        styles.container, 
        { backgroundColor: colors.card },
        isTablet && styles.containerTablet,
        isDesktop && styles.containerDesktop,
      ]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={[styles.userRow, isTablet && styles.userRowTablet]}>
        <Image
          source={{
            uri: item.user.profilePicture || `https://i.pravatar.cc/150?u=${item.user._id}`,
          }}
          style={[styles.avatar, isTablet && styles.avatarTablet]}
        />
        <View style={styles.userInfo}>
          <ThemedText style={[styles.username, { color: colors.text }, isTablet && styles.usernameTablet]}>
            {item.user.username}
          </ThemedText>
          <Text style={[styles.timeAgo, { color: colors.textTertiary }, isTablet && styles.timeAgoTablet]}>
            {formatTimeAgo(item.createdAt)}
          </Text>
        </View>
      </View>

      <ThemedText 
        style={[styles.caption, { color: colors.text }, isTablet && styles.captionTablet, isDesktop && styles.captionDesktop]} 
        numberOfLines={0}
      >
        {item.caption || 'No content'}
      </ThemedText>

      <View style={[styles.actions, { borderTopColor: colors.border }, isTablet && styles.actionsTablet]}>
        <TouchableOpacity style={[styles.actionBtn, isTablet && styles.actionBtnTablet]}>
          <Ionicons name="heart-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.actionLabel, { color: colors.textSecondary }, isTablet && styles.actionLabelTablet]}>
            {(item.likes || 0) > 999 ? `${(item.likes! / 1000).toFixed(1)}K` : item.likes || 0}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, isTablet && styles.actionBtnTablet]}>
          <Ionicons name="chatbubble-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.actionLabel, { color: colors.textSecondary }, isTablet && styles.actionLabelTablet]}>
            {(item.comments || 0) > 999 ? `${(item.comments! / 1000).toFixed(1)}K` : item.comments || 0}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, isTablet && styles.actionBtnTablet]}>
          <Ionicons name="share-social-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.actionLabel, { color: colors.textSecondary }, isTablet && styles.actionLabelTablet]}>Share</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    padding: 12,
    gap: 12,
  },
  containerTablet: {
    borderRadius: 14,
    padding: 14,
    gap: 14,
  },
  containerDesktop: {
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userRowTablet: {
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ccc',
    flexShrink: 0,
  },
  avatarTablet: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  usernameTablet: {
    fontSize: 15,
    marginBottom: 4,
  },
  timeAgo: {
    fontSize: 12,
  },
  timeAgoTablet: {
    fontSize: 13,
  },
  caption: {
    fontSize: 15,
    lineHeight: 22,
    marginVertical: 8,
  },
  captionTablet: {
    fontSize: 16,
    lineHeight: 24,
    marginVertical: 10,
  },
  captionDesktop: {
    fontSize: 17,
    lineHeight: 26,
    marginVertical: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionsTablet: {
    marginTop: 10,
    paddingTop: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  actionBtnTablet: {
    gap: 6,
    paddingVertical: 6,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionLabelTablet: {
    fontSize: 13,
  },
});