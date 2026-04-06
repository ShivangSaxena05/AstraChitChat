import React, { useMemo } from 'react';
import {
  Image,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { formatLastSeen } from '@/utils/chatUtils';

interface UserStatusHeaderProps {
  otherUsername: string;
  otherUserProfilePicture: string;
  otherUserStatus: {
    isOnline: boolean;
    lastSeen: string | null;
    profilePicture?: string;
  };
  otherUserTyping: boolean;
  colors: any;
  onBackPress: () => void;
  onHeaderPress: () => void;
}

/**
 * UserStatusHeader component
 * Displays user info, online status, typing indicator, and last seen
 * Positioned at the top of the chat screen
 */
export const UserStatusHeader = React.memo(
  ({
    otherUsername,
    otherUserProfilePicture,
    otherUserStatus,
    otherUserTyping,
    colors,
    onBackPress,
    onHeaderPress,
  }: UserStatusHeaderProps) => {
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
      <View style={styles.chatHeader}>
        <TouchableOpacity
          onPress={onBackPress}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.card} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerTouchable}
          onPress={onHeaderPress}
          activeOpacity={0.8}
        >
          <View style={styles.headerContent}>
            <Image
              source={{
                uri:
                  otherUserProfilePicture ||
                  otherUserStatus.profilePicture ||
                  'https://i.pravatar.cc/150?img=1',
              }}
              style={styles.profileImage}
            />

            <View style={styles.headerInfo}>
              <ThemedText style={styles.partnerName}>
                {otherUsername}
              </ThemedText>
              <View style={styles.statusRow}>
                {otherUserTyping ? (
                  <Text style={styles.typingText}>Typing...</Text>
                ) : (
                  <>
                    {otherUserStatus.isOnline && (
                      <View style={styles.onlineDot} />
                    )}
                    <Text style={styles.lastSeen} numberOfLines={1}>
                      {otherUserStatus.isOnline
                        ? 'Online'
                        : formatLastSeen(otherUserStatus.lastSeen)}
                    </Text>
                  </>
                )}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  },
);

UserStatusHeader.displayName = 'UserStatusHeader';

const createStyles = (colors: any) =>
  StyleSheet.create({
    chatHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 12,
      paddingTop:
        Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight || 30) + 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    backButton: {
      padding: 8,
      borderRadius: 20,
      backgroundColor: colors.backgroundSecondary,
    },
    headerTouchable: {
      flex: 1,
      marginLeft: 12,
    },
    headerContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    profileImage: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: 10,
    },
    headerInfo: {
      flex: 1,
    },
    partnerName: {
      fontSize: 17,
      fontWeight: '600',
      marginBottom: 2,
      color: colors.text,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    onlineDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.success,
      marginRight: 6,
    },
    lastSeen: {
      color: colors.textSecondary,
      fontSize: 13,
    },
    typingText: {
      color: colors.tint,
      fontSize: 13,
      marginLeft: 6,
    },
  });
