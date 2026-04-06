import React, { memo, useCallback, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import SwipeableMessage from '@/components/SwipeableMessage';
import { sanitizeMessage, isMessageRead } from '@/utils/chatUtils';
import type { Message } from '@/hooks/useChatSocket';
import type { ListItem } from '@/hooks/useGroupedMessages';
import { MessageContextMenu } from './MessageContextMenu';
import { EditMessageModal } from './EditMessageModal';
import { ReactionPicker } from './ReactionPicker';
import { ReadReceiptsModal } from './ReadReceiptsModal';
import { useMessageActions } from '@/hooks/useMessageActions';

interface MessageItemProps {
  item: ListItem;
  currentUserId: string | null;
  otherUserId: string;
  onLongPress?: (message: Message) => void;
  onSwipeReply?: (message: Message) => void;
  onReplyPress?: (messageId: string) => void;
  highlightedMessageId?: string | null;
  retryAttempts: React.MutableRefObject<Map<string, number>>;
  colors: any;
}

/**
 * Memoized message item component
 * Renders either a date separator or a message bubble
 * Handles swipe-to-reply, long-press (quote), and retry logic
 */
export const MessageItem = memo(
  ({
    item,
    currentUserId,
    otherUserId,
    onLongPress,
    onSwipeReply,
    onReplyPress,
    highlightedMessageId,
    retryAttempts,
    colors,
  }: MessageItemProps) => {
    const styles = createStyles(colors);
    
    // Message action states
    const [showEditModal, setShowEditModal] = useState(false);
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const [showReadReceipts, setShowReadReceipts] = useState(false);
    const [receipts, setReceipts] = useState<any[]>([]);
    
    // Message actions hook
    const { isLoading, editMessage, deleteMessage, unsendMessage, addReaction, getReceipts } =
      useMessageActions({
        messageId: item.type === 'message' ? item.data._id : '',
      });

    const handleSwipe = useCallback(() => {
      if (item.type === 'message') {
        onSwipeReply?.(item.data);
      }
    }, [item, onSwipeReply]);

    // Date separator
    if (item.type === 'dateSeparator') {
      return (
        <View style={styles.dateSeparator}>
          <Text style={styles.dateSeparatorText}>{item.date}</Text>
        </View>
      );
    }

    const message = item.data;
    const isOwnMessage = String(message.sender._id) === String(currentUserId);
    const messageStatus = message.status;
    const isRead = isMessageRead(message, currentUserId, otherUserId);
    const isDelivered =
      message.deliveredTo &&
      currentUserId &&
      message.deliveredTo.some((id: string) => String(id) !== String(currentUserId));
    const isHighlighted = highlightedMessageId === message._id;

    return (
      <SwipeableMessage onSwipeReply={handleSwipe} isOwnMessage={isOwnMessage}>
        <TouchableOpacity
          onLongPress={() => onLongPress?.(message)}
          delayLongPress={500}
          activeOpacity={0.7}
          style={isOwnMessage ? styles.ownMessageTouchable : styles.otherMessageTouchable}
        >
          <View
            style={[
              styles.messageContainer,
              isOwnMessage ? styles.ownMessage : styles.otherMessage,
              isHighlighted && styles.highlightedMessage,
            ]}
          >
            {/* Quoted Message Display */}
            {(message.quotedMessage || message.quotedMsgId) && (
              <TouchableOpacity
                style={[
                  styles.quotedMessageContainer,
                  isOwnMessage
                    ? styles.ownQuotedMessage
                    : styles.otherQuotedMessage,
                ]}
                onPress={() =>
                  message.quotedMessage &&
                  onReplyPress?.(message.quotedMessage._id)
                }
                activeOpacity={0.8}
                disabled={!message.quotedMessage}
              >
                <Text
                  style={[
                    styles.quotedMessageName,
                    isOwnMessage
                      ? styles.ownQuotedName
                      : styles.otherQuotedName,
                  ]}
                >
                  {message.quotedMessage?.sender?.username || 'Unknown'}
                </Text>
                <Text
                  style={[
                    styles.quotedMessageText,
                    isOwnMessage
                      ? styles.ownQuotedText
                      : styles.otherQuotedText,
                  ]}
                  numberOfLines={1}
                >
                  {message.quotedMessage
                    ? message.quotedMessage.msgType === 'image'
                      ? '📷 Photo'
                      : message.quotedMessage.msgType === 'video'
                        ? '🎥 Video'
                        : sanitizeMessage(
                            message.quotedMessage.bodyText || 'Message',
                          )
                    : 'Original message unavailable'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Sender name (for group chats) */}
            {!isOwnMessage && message.sender?.username && (
              <Text style={styles.senderNameText}>
                {message.sender.username}
              </Text>
            )}

            {/* Message text */}
            <Text
              style={[
                styles.messageText,
                isOwnMessage ? styles.ownMessageText : styles.otherMessageText,
              ]}
            >
              {message.unsentAt
                ? '[Message unsent]'
                : sanitizeMessage(message.bodyText || message.content || '')}
            </Text>

            {/* Edited indicator */}
            {message.editedAt && !message.unsentAt && (
              <Text
                style={[
                  styles.editedText,
                  isOwnMessage ? styles.ownEditedText : styles.otherEditedText,
                ]}
              >
                (edited)
              </Text>
            )}

            {/* Timestamp and status */}
            <View style={styles.timestampContainer}>
              <Text
                style={[
                  styles.timestamp,
                  isOwnMessage ? styles.ownTimestamp : styles.otherTimestamp,
                ]}
              >
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>

              {/* Message status indicators */}
              {isOwnMessage && message.status ? (
                <View style={styles.statusContainer}>
                  {message.status === 'sending' ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.textSecondary}
                    />
                  ) : message.status === 'sent' ? (
                    <Text style={[styles.statusIcon, styles.sentIcon]}>
                      ✓✓
                    </Text>
                  ) : (
                    <TouchableOpacity
                      style={styles.retryButton}
                      onPress={() => {
                        const attempts =
                          retryAttempts.current.get(message._id) || 0;
                        if (attempts >= 3) {
                          Alert.alert(
                            'Max retries reached',
                            'Please check your connection',
                          );
                          return;
                        }
                        retryAttempts.current.set(message._id, attempts + 1);
                        // TODO: Implement retry logic
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.retryIcon}>↻</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                isOwnMessage && (
                  <Text
                    style={[
                      styles.readStatus,
                      isRead ? styles.readStatusBlue : styles.readStatusGray,
                    ]}
                  >
                    {isRead ? '✓✓' : isDelivered ? '✓✓' : '✓'}
                  </Text>
                )
              )}

              {/* Message context menu */}
              <MessageContextMenu
                messageId={message._id}
                isOwnMessage={isOwnMessage}
                messageText={message.bodyText || message.content || ''}
                isLoading={isLoading}
                onReaction={() => setShowReactionPicker(true)}
                onEdit={() => setShowEditModal(true)}
                onDelete={() => deleteMessage()}
                onUnsend={() => unsendMessage()}
                onReadReceipts={async () => {
                  try {
                    const data = await getReceipts();
                    setReceipts(data || []);
                    setShowReadReceipts(true);
                  } catch (error) {
                    console.error('Error fetching receipts:', error);
                  }
                }}
              />
            </View>

            {/* Reactions display */}
            {message.reactions && message.reactions.length > 0 && (
              <View style={styles.reactionsContainer}>
                {message.reactions.map((reaction: any, index: number) => (
                  <TouchableOpacity
                    key={`${reaction.emoji}-${index}`}
                    style={[styles.reactionBubble, { borderColor: colors.textSecondary }]}
                  >
                    <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
                    <Text style={[styles.reactionCount, { color: colors.textSecondary }]}>
                      {reaction.users?.length || 0}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* Modals */}
        <EditMessageModal
          visible={showEditModal}
          messageText={message.bodyText || message.content || ''}
          isLoading={isLoading}
          onSave={async (newText) => {
            await editMessage(newText);
            setShowEditModal(false);
          }}
          onCancel={() => setShowEditModal(false)}
        />

        <ReactionPicker
          visible={showReactionPicker}
          isLoading={isLoading}
          onSelectReaction={async (emoji) => {
            await addReaction(emoji);
            setShowReactionPicker(false);
          }}
          onClose={() => setShowReactionPicker(false)}
        />

        <ReadReceiptsModal
          visible={showReadReceipts}
          messageId={message._id}
          isLoading={isLoading}
          receipts={receipts}
          onClose={() => setShowReadReceipts(false)}
        />
      </SwipeableMessage>
    );
  },
);

MessageItem.displayName = 'MessageItem';

const createStyles = (colors: any) =>
  StyleSheet.create({
    dateSeparator: { alignItems: 'center', marginVertical: 12 },
    dateSeparatorText: {
      backgroundColor: colors.backgroundSecondary,
      color: colors.textSecondary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      fontSize: 12,
      overflow: 'hidden',
    },
    messageContainer: {
      maxWidth: '85%',
      marginBottom: 8,
      padding: 10,
      paddingHorizontal: 14,
      borderRadius: 20,
    },
    ownMessageTouchable: {
      width: '100%',
      alignItems: 'flex-end',
    },
    otherMessageTouchable: {
      width: '100%',
      alignItems: 'flex-start',
    },
    ownMessage: {
      alignSelf: 'flex-end',
      backgroundColor: colors.tint,
      borderBottomRightRadius: 4,
    },
    otherMessage: {
      alignSelf: 'flex-start',
      backgroundColor: colors.card,
      borderBottomLeftRadius: 4,
    },
    highlightedMessage: {
      backgroundColor: colors.backgroundSecondary,
      transform: [{ scale: 1.02 }],
    },
    messageText: { fontSize: 15, lineHeight: 20 },
    ownMessageText: { color: colors.background },
    otherMessageText: { color: colors.text },
    senderNameText: {
      color: colors.tint,
      fontSize: 12,
      fontWeight: 'bold',
      marginBottom: 4,
    },
    timestamp: { fontSize: 12, marginTop: 4 },
    ownTimestamp: { color: colors.background, textAlign: 'right' },
    otherTimestamp: { color: colors.textSecondary },
    timestampContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 4,
    },
    statusContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    statusIcon: {
      fontSize: 12,
      color: colors.background,
    },
    sentIcon: {
      color: colors.info,
    },
    retryButton: {
      padding: 2,
      borderRadius: 10,
      backgroundColor: `${colors.error}20`,
    },
    retryIcon: {
      fontSize: 14,
      color: colors.error,
      fontWeight: 'bold',
    },
    readStatus: { fontSize: 12, marginLeft: 8 },
    readStatusBlue: { color: colors.info },
    readStatusGray: { color: colors.background },
    editedText: { fontSize: 12, marginTop: 2 },
    ownEditedText: { color: colors.background },
    otherEditedText: { color: colors.textSecondary },
    quotedMessageContainer: {
      padding: 8,
      borderLeftWidth: 3,
      marginBottom: 6,
      borderRadius: 6,
    },
    ownQuotedMessage: {
      backgroundColor: `${colors.tint}10`,
      borderLeftColor: colors.accent,
    },
    otherQuotedMessage: {
      backgroundColor: `${colors.card}80`,
      borderLeftColor: colors.tint,
    },
    quotedMessageName: { fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
    ownQuotedName: { color: colors.accent },
    otherQuotedName: { color: colors.tint },
    quotedMessageText: { fontSize: 13 },
    ownQuotedText: { color: colors.background },
    otherQuotedText: { color: colors.textSecondary },
    reactionsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 8,
      gap: 4,
    },
    reactionBubble: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      backgroundColor: `${colors.card}50`,
    },
    reactionEmoji: {
      fontSize: 16,
      marginRight: 4,
    },
    reactionCount: {
      fontSize: 11,
      fontWeight: '600',
    },
  });
