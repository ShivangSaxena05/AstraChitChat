import React, { useCallback, useMemo } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import { MessageItem } from './MessageItem';
import type { ListItem } from '@/hooks/useGroupedMessages';
import type { Message } from '@/hooks/useChatSocket';

interface MessageListProps {
  groupedMessages: ListItem[];
  currentUserId: string | null;
  otherUserId: string;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  highlightedMessageId?: string | null;
  retryAttempts: React.MutableRefObject<Map<string, number>>;
  colors: any;
  pullGesture: any;
  animatedPullStyle: any;
  isHoldingTop: boolean;
  callProgress: number;
  onMessageLongPress?: (message: Message) => void;
  onSwipeReply?: (message: Message) => void;
  onReplyPress?: (messageId: string) => void;
  onScroll?: (event: any) => void;
  onLoadMore?: () => void;
  flatListRef?: React.Ref<FlatList>;
  getItemLayout?: (data: any, index: number) => { length: number; offset: number; index: number };
}

/**
 * MessageList component
 * Renders messages in an inverted FlatList with date separators
 * Handles scrolling, gesture detection, and message loading
 */
export const MessageList = React.forwardRef<FlatList, MessageListProps>(
  (
    {
      groupedMessages,
      currentUserId,
      otherUserId,
      isLoading,
      isLoadingMore,
      hasMore,
      highlightedMessageId,
      retryAttempts,
      colors,
      pullGesture,
      animatedPullStyle,
      isHoldingTop,
      callProgress,
      onMessageLongPress,
      onSwipeReply,
      onReplyPress,
      onScroll,
      onLoadMore,
      getItemLayout,
    },
    flatListRef,
  ) => {
    const styles = useMemo(() => createStyles(colors), [colors]);

    const renderItem = useCallback(
      ({ item }: { item: ListItem }) => (
        <MessageItem
          item={item}
          currentUserId={currentUserId}
          otherUserId={otherUserId}
          onLongPress={onMessageLongPress}
          onSwipeReply={onSwipeReply}
          onReplyPress={onReplyPress}
          highlightedMessageId={highlightedMessageId}
          retryAttempts={retryAttempts}
          colors={colors}
        />
      ),
      [
        currentUserId,
        otherUserId,
        onMessageLongPress,
        onSwipeReply,
        onReplyPress,
        highlightedMessageId,
        colors,
        retryAttempts,
      ],
    );

    const renderHeader = useCallback(() => {
      if (!isLoadingMore) return null;
      return (
        <View style={styles.loadingMoreContainer}>
          <Text style={styles.loadingMoreText}>Loading older messages...</Text>
        </View>
      );
    }, [isLoadingMore, styles]);

    const reversedMessages = useMemo(
      () => [...groupedMessages].reverse(),
      [groupedMessages],
    );

    if (isLoading && groupedMessages.length === 0) {
      return (
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={styles.loadingMoreText}>Loading messages...</Text>
        </View>
      );
    }

    return (
      <GestureDetector gesture={pullGesture}>
        <View style={styles.container}>
          {isHoldingTop && (
            <View style={[styles.callHoverContainer, animatedPullStyle]}>
              <View style={styles.callIconWrapper}>
                <Text style={styles.callHoverText}>
                  {callProgress >= 1 ? 'Calling...' : 'Pull to Call'}
                </Text>
              </View>
            </View>
          )}

          <FlatList
            ref={flatListRef}
            data={reversedMessages}
            inverted
            renderItem={renderItem}
            keyExtractor={(item) =>
              item.type === 'dateSeparator'
                ? `sep-${item.dateKey}`
                : `msg-${item.data._id}`
            }
            style={styles.flatList}
            contentContainerStyle={styles.contentContainer}
            initialNumToRender={20}
            maxToRenderPerBatch={10}
            windowSize={10}
            removeClippedSubviews={Platform.OS === 'android'}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onEndReached={hasMore && !isLoadingMore ? onLoadMore : null}
            onEndReachedThreshold={0.5}
            ListHeaderComponent={renderHeader}
            getItemLayout={Platform.OS === 'android' ? getItemLayout : undefined}
          />
        </View>
      </GestureDetector>
    );
  },
);

MessageList.displayName = 'MessageList';

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1 },
    flatList: { flex: 1 },
    contentContainer: { padding: 16, paddingTop: 8 },
    loadingMoreContainer: { padding: 12, alignItems: 'center' },
    loadingMoreText: { color: colors.textSecondary, fontSize: 12 },
    callHoverContainer: {
      position: 'absolute',
      top: 100,
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 100,
      pointerEvents: 'none',
    },
    callIconWrapper: {
      width: 80,
      height: 80,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.shadow,
      borderRadius: 40,
    },
    callHoverText: {
      color: colors.text,
      marginTop: 12,
      fontWeight: 'bold',
      fontSize: 14,
    },
  });
