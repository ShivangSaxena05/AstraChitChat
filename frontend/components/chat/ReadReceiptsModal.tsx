import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  SafeAreaView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useTheme } from '@/hooks/use-theme-color';
import { Ionicons } from '@expo/vector-icons';

interface Receipt {
  userId: string;
  userName: string;
  profilePicture?: string;
  readAt: string;
}

interface ReadReceiptsModalProps {
  visible: boolean;
  messageId: string;
  isLoading: boolean;
  receipts: Receipt[];
  onClose: () => void;
}

export const ReadReceiptsModal: React.FC<ReadReceiptsModalProps> = ({
  visible,
  messageId,
  isLoading,
  receipts,
  onClose,
}) => {
  const colors = useTheme();
  const styles = createStyles(colors);

  const formatTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Unknown';
    }
  };

  const renderReceipt = ({ item }: { item: Receipt }) => (
    <View style={[styles.receiptItem, { borderBottomColor: colors.textSecondary }]}>
      {item.profilePicture ? (
        <Image
          source={{ uri: item.profilePicture }}
          style={styles.avatar}
        />
      ) : (
        <View style={[styles.avatar, { backgroundColor: colors.textSecondary }]}>
          <Text style={styles.avatarText}>{item.userName.charAt(0).toUpperCase()}</Text>
        </View>
      )}

      <View style={styles.receiptInfo}>
        <Text style={[styles.userName, { color: colors.text }]}>{item.userName}</Text>
        <Text style={[styles.readTime, { color: colors.textSecondary }]}>
          Read at {formatTime(item.readAt)}
        </Text>
      </View>

      <Ionicons name="checkmark-circle" size={20} color={colors.text} />
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.overlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>
                Read by {receipts.length}
              </Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.text} />
              </View>
            ) : receipts.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="eye-off-outline" size={40} color={colors.textSecondary} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  No one has read this message yet
                </Text>
              </View>
            ) : (
              <FlatList
                data={receipts}
                keyExtractor={(item) => item.userId}
                renderItem={renderReceipt}
                scrollEnabled={receipts.length > 3}
                style={styles.list}
              />
            )}

            {/* Close button */}
            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: colors.text }]}
              onPress={onClose}
            >
              <Text style={[styles.closeButtonText, { color: colors.card }]}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    overlay: {
      flex: 1,
      width: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      padding: 16,
    },
    modalContent: {
      width: '90%',
      maxHeight: '80%',
      borderRadius: 12,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors?.textSecondary,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
    },
    list: {
      maxHeight: '70%',
      paddingHorizontal: 0,
    },
    receiptItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    avatarText: {
      color: colors?.background,
      fontWeight: '600',
      fontSize: 14,
    },
    receiptInfo: {
      flex: 1,
    },
    userName: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 4,
    },
    readTime: {
      fontSize: 12,
    },
    loadingContainer: {
      height: 200,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      height: 200,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 14,
      marginTop: 12,
      textAlign: 'center',
    },
    closeButton: {
      marginHorizontal: 16,
      marginVertical: 12,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
    },
    closeButtonText: {
      fontSize: 16,
      fontWeight: '600',
    },
  });
