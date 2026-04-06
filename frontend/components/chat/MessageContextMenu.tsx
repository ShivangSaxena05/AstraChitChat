import React, { memo } from 'react';
import {
  Alert,
  ActionSheetIOS,
  Platform,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/use-theme-color';

interface MessageContextMenuProps {
  messageId: string;
  isOwnMessage: boolean;
  messageText: string;
  onEdit?: () => void;
  onReaction?: () => void;
  onDelete?: () => void;
  onUnsend?: () => void;
  onReadReceipts?: () => void;
  isLoading?: boolean;
}

export const MessageContextMenu = memo(
  ({
    messageId,
    isOwnMessage,
    messageText,
    onEdit,
    onReaction,
    onDelete,
    onUnsend,
    onReadReceipts,
    isLoading,
  }: MessageContextMenuProps) => {
    const colors = useTheme();

    const handleDelete = () => {
      Alert.alert('Delete Message', 'Are you sure? This cannot be undone.', [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Delete',
          onPress: onDelete,
          style: 'destructive',
        },
      ]);
    };

    const handleUnsend = () => {
      Alert.alert('Unsend Message', 'Unsend this message?', [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Unsend',
          onPress: onUnsend,
          style: 'destructive',
        },
      ]);
    };

    const options = [
      'Cancel',
      { text: '👍 React', onPress: onReaction },
      { text: '👁️ Receipts', onPress: onReadReceipts },
      ...(isOwnMessage ? [{ text: '✏️ Edit', onPress: onEdit }] : []),
      ...(isOwnMessage
        ? [{ text: '🗑️ Delete', onPress: handleDelete, style: 'destructive' }]
        : [{ text: '↩️ Unsend', onPress: handleUnsend, style: 'destructive' }]),
    ];

    if (Platform.OS === 'ios') {
      return (
        <TouchableOpacity
          onPress={() => {
            ActionSheetIOS.showActionSheetWithOptions(
              {
                options: options.map((o) => (typeof o === 'string' ? o : o.text)),
                destructiveButtonIndex: options.findIndex(
                  (o) => typeof o !== 'string' && o.style === 'destructive'
                ),
                cancelButtonIndex: 0,
              },
              (buttonIndex) => {
                const option = options[buttonIndex];
                if (typeof option !== 'string' && option.onPress && !isLoading) {
                  option.onPress();
                }
              }
            );
          }}
          disabled={isLoading}
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      );
    }

    // Android: return menu using Alert
    return (
      <TouchableOpacity
        onPress={() => {
          const actions = [
            { text: '👍 React', onPress: onReaction },
            { text: '👁️ Receipts', onPress: onReadReceipts },
            ...(isOwnMessage ? [{ text: '✏️ Edit', onPress: onEdit }] : []),
            ...(isOwnMessage
              ? [{ text: '🗑️ Delete', onPress: handleDelete, style: 'destructive' }]
              : [{ text: '↩️ Unsend', onPress: handleUnsend, style: 'destructive' }]),
            { text: 'Cancel', onPress: () => {} },
          ] as any;

          Alert.alert('Message Actions', 'Choose an action:', actions);
        }}
        disabled={isLoading}
      >
        <Ionicons
          name="ellipsis-horizontal"
          size={20}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
    );
  }
);

MessageContextMenu.displayName = 'MessageContextMenu';
