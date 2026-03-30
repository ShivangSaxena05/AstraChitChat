import React from 'react';
import { View, FlatList, Image, TouchableOpacity, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedView } from './themed-view';
import { ThemedText } from './themed-text';
import { useTheme } from '@/hooks/use-theme-color';

interface MediaItem {
  _id: string;
  url: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt: string;
  thumbnail?: string; // S3 thumbnail
}

interface ChatMediaGridProps {
  mediaType: 'photos' | 'videos' | 'links' | 'files';
  mediaItems: MediaItem[];
  chatId: string;
  onViewAll: (type: string) => void;
  hasMore?: boolean;
  loading?: boolean;
}

const { width: screenWidth } = Dimensions.get('window');
const ITEM_WIDTH = (screenWidth - 80) / 4; // 4-column grid approx

const ChatMediaGrid: React.FC<ChatMediaGridProps> = React.memo(({
  mediaType,
  mediaItems,
  chatId,
  onViewAll,
  hasMore = false,
  loading = false
}) => {
  const colors = useTheme();

  const renderItem = ({ item }: { item: MediaItem }) => {
    // HIGH FIX: Validate media item properties
    if (!item || !item._id) {
      return null;
    }

    let iconName = 'document';
    let bgColor = colors.backgroundSecondary;

    if (mediaType === 'photos' || (item.mimeType?.startsWith('image/'))) {
      // HIGH FIX: Validate URL before rendering image
      const imageUrl = item.thumbnail || item.url;
      if (!imageUrl) {
        return (
          <View style={[styles.mediaThumbnail, { backgroundColor: colors.backgroundSecondary }]}>
            <Ionicons name="image-outline" size={20} color={colors.textTertiary} />
          </View>
        );
      }
      return (
        <Image
          source={{ uri: imageUrl }}
          style={styles.mediaThumbnail}
        />
      );
    } else if (mediaType === 'videos' || item.mimeType?.startsWith('video/')) {
      iconName = 'play-circle';
      bgColor = colors.accent;
    } else if (mediaType === 'links') {
      iconName = 'link';
      bgColor = colors.success;
    } else if (mediaType === 'files') {
      iconName = 'document';
      bgColor = colors.warning;
    }

    return (
      <View style={[styles.mediaThumbnail, { backgroundColor: bgColor, justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name={iconName as any} size={24} color={colors.background} />
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="image-outline" size={48} color={colors.textTertiary} />
      <ThemedText type="subtitle" style={[styles.emptyText, { color: colors.textSecondary }]}>
        No {mediaType} shared
      </ThemedText>
    </View>
  );

  const getSectionTitle = (type: string) => {
    const titles: Record<string, string> = {
      photos: 'Photos',
      videos: 'Videos', 
      links: 'Links',
      files: 'Files'
    };
    return titles[type] || type;
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          {getSectionTitle(mediaType)}
        </ThemedText>
        {mediaItems.length > 0 && (
          <TouchableOpacity style={styles.viewAllButton} onPress={() => onViewAll(mediaType)}>
            <ThemedText>View all</ThemedText>
            <Ionicons name="chevron-forward" size={16} color={colors.tint} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="ellipse" size={20} color={colors.textTertiary} />
        </View>
      ) : mediaItems.length === 0 ? (
        renderEmpty()
      ) : (
        <FlatList
          data={mediaItems.slice(0, 12)} // Show preview of 12 max
          renderItem={renderItem}
          keyExtractor={item => item._id}
          numColumns={4}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.grid}
          initialNumToRender={8}
          maxToRenderPerBatch={4}
          windowSize={5}
          removeClippedSubviews
          columnWrapperStyle={styles.row}
        />
      )}

      {hasMore && mediaItems.length > 0 && (
        <TouchableOpacity style={styles.loadMore}>
          <ThemedText style={[styles.loadMoreText, { color: colors.tint }]}>Load more {mediaType}</ThemedText>
        </TouchableOpacity>
      )}
    </ThemedView>
  );
});

ChatMediaGrid.displayName = 'ChatMediaGrid';

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  grid: {
    paddingBottom: 8,
  },
  row: {
    justifyContent: 'space-between',
  },
  mediaThumbnail: {
    width: ITEM_WIDTH - 8,
    height: ITEM_WIDTH - 8,
    borderRadius: 8,
    margin: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0', // Theme: light.border
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    marginTop: 8,
    fontSize: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  loadMore: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  loadMoreText: {
    fontWeight: '500',
  },
});

export default ChatMediaGrid;

