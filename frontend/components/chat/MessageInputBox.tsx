import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Message } from '@/hooks/useChatSocket';

interface MessageInputBoxProps {
  message: string;
  quotedMessage: Message | null;
  isSocketConnected: boolean;
  isFollowing: boolean;
  otherUsername: string;
  colors: any;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onCancelReply: () => void;
}

/**
 * MessageInputBox component
 * Handles message input, reply preview, and send button
 * Supports text input with reply quoting
 */
export const MessageInputBox = React.forwardRef<TextInput, MessageInputBoxProps>(
  (
    {
      message,
      quotedMessage,
      isSocketConnected,
      isFollowing,
      otherUsername,
      colors,
      onChangeText,
      onSend,
      onCancelReply,
    },
    inputRef,
  ) => {
    const styles = createStyles(colors);
    const [isSending, setIsSending] = useState(false);
    const sendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Wrap onSend to prevent duplicate sends
    const handleSend = useCallback(() => {
      if (isSending) return;
      
      setIsSending(true);
      if (sendTimeoutRef.current) clearTimeout(sendTimeoutRef.current);
      
      onSend();
      
      // Reset sending flag after a short delay to allow for socket processing
      sendTimeoutRef.current = setTimeout(() => {
        setIsSending(false);
      }, 500);
    }, [isSending, onSend]);

    // Cleanup timeout on unmount
    useEffect(() => {
      return () => {
        if (sendTimeoutRef.current) clearTimeout(sendTimeoutRef.current);
      };
    }, []);

    // Auto-focus input when reply is set
    useEffect(() => {
      if (quotedMessage) {
        const timer = setTimeout(() => {
          if (inputRef && 'current' in inputRef) {
            inputRef.current?.focus();
          }
        }, 100);
        return () => clearTimeout(timer);
      }
    }, [quotedMessage, inputRef]);

    const isSendDisabled =
      !isSocketConnected || !message.trim() || !isFollowing || isSending;

    return (
      <View
        style={[
          styles.container,
          quotedMessage && styles.containerWithReply,
        ]}
      >
        {/* Reply Preview Bar */}
        {quotedMessage && (
          <View style={styles.replyPreviewContainer}>
            <View style={styles.replyPreviewLine} />
            <View style={styles.replyPreviewContent}>
              <Text style={styles.replyPreviewName}>
                Replying to{' '}
                {quotedMessage.sender?.username || 'unknown'}
              </Text>
              <Text style={styles.replyPreviewText} numberOfLines={1}>
                {quotedMessage.msgType === 'image'
                  ? '📷 Photo'
                  : quotedMessage.msgType === 'video'
                    ? '🎥 Video'
                    : quotedMessage.bodyText ||
                      quotedMessage.content ||
                      'Media'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onCancelReply}
              style={styles.cancelReplyButton}
            >
              <Ionicons
                name="close-circle"
                size={24}
                color={colors.textTertiary}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Follow Prompt */}
        {!isFollowing && (
          <View style={styles.followPromptContainer}>
            <Ionicons
              name="information-circle"
              size={20}
              color={colors.success}
            />
            <Text style={styles.followPromptText}>
              Follow {otherUsername} to start a conversation
            </Text>
          </View>
        )}

        {/* Input Row */}
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={[
              styles.input,
              !isFollowing && styles.inputDisabled,
            ]}
            value={message}
            onChangeText={isFollowing ? onChangeText : undefined}
            placeholder={
              !isFollowing
                ? 'Follow to start chatting...'
                : quotedMessage
                  ? 'Write your reply...'
                  : 'Type a message...'
            }
            placeholderTextColor={colors.placeholder}
            multiline={false}
            blurOnSubmit={false}
            onSubmitEditing={isFollowing && !isSending ? handleSend : undefined}
            returnKeyType="send"
            editable={isFollowing}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              isSendDisabled && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={isSendDisabled}
          >
            <Text
              style={[
                styles.sendButtonText,
                isSendDisabled && styles.sendButtonTextDisabled,
              ]}
            >
              {!isFollowing
                ? 'Follow'
                : isSocketConnected
                  ? 'Send'
                  : 'Connecting...'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  },
);

MessageInputBox.displayName = 'MessageInputBox';

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flexDirection: 'column',
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
      width: '100%',
    },
    containerWithReply: {
      flexDirection: 'column',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    input: {
      flex: 1,
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingVertical: 12,
      maxHeight: 120,
      color: colors.text,
      backgroundColor: colors.card,
      fontSize: 16,
    },
    inputDisabled: {
      opacity: 0.5,
      backgroundColor: colors.backgroundSecondary,
    },
    sendButton: {
      backgroundColor: colors.tint,
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonDisabled: { backgroundColor: colors.backgroundSecondary },
    sendButtonText: {
      color: colors.background,
      fontWeight: 'bold',
      fontSize: 14,
    },
    sendButtonTextDisabled: { color: colors.textSecondary },
    replyPreviewContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginBottom: 8,
    },
    replyPreviewLine: {
      width: 3,
      height: '100%',
      backgroundColor: colors.tint,
      marginRight: 12,
    },
    replyPreviewContent: { flex: 1 },
    replyPreviewName: {
      color: colors.tint,
      fontSize: 12,
      fontWeight: 'bold',
      marginBottom: 2,
    },
    replyPreviewText: { color: colors.textSecondary, fontSize: 14 },
    cancelReplyButton: { padding: 4 },
    followPromptContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.tint}15`,
      borderRadius: 8,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginBottom: 8,
      borderLeftWidth: 3,
      borderLeftColor: colors.tint,
    },
    followPromptText: {
      color: colors.tint,
      fontSize: 14,
      fontWeight: '600',
      marginLeft: 8,
    },
  });
