import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/hooks/use-theme-color';

interface ReactionPickerProps {
  visible: boolean;
  isLoading: boolean;
  onSelectReaction: (emoji: string) => void;
  onClose: () => void;
}

const EMOJI_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👏', '🎉', '✅'];

export const ReactionPicker: React.FC<ReactionPickerProps> = ({
  visible,
  isLoading,
  onSelectReaction,
  onClose,
}) => {
  const colors = useTheme();
  const styles = createStyles(colors);

  const handleEmojiPress = async (emoji: string) => {
    console.log(`[ReactionPicker] Selected emoji: ${emoji}`);
    onSelectReaction(emoji);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.overlay}>
          {/* Handle bar */}
          <View style={[styles.handleBar, { backgroundColor: colors.textSecondary }]} />

          {/* Header */}
          <Text style={[styles.title, { color: colors.text }]}>React to message</Text>

          {/* Emoji Grid */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.text} />
            </View>
          ) : (
            <ScrollView
              style={styles.emojiContainer}
              contentContainerStyle={styles.emojiGrid}
            >
              {EMOJI_REACTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.emojiButton, { borderColor: colors.textSecondary }]}
                  onPress={() => handleEmojiPress(emoji)}
                  disabled={isLoading}
                >
                  <Text style={styles.emoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Close button */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={[styles.closeButtonText, { color: colors.text }]}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    handleBar: {
      width: 40,
      height: 4,
      borderRadius: 2,
      alignSelf: 'center',
      marginTop: 8,
      marginBottom: 8,
      opacity: 0.5,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
      marginVertical: 12,
    },
    emojiContainer: {
      backgroundColor: colors.card,
      maxHeight: '70%',
    },
    emojiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-around',
      padding: 16,
      gap: 12,
    },
    emojiButton: {
      width: '22%',
      aspectRatio: 1,
      borderRadius: 12,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    emoji: {
      fontSize: 32,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.card,
    },
    closeButton: {
      backgroundColor: colors.card,
      paddingVertical: 16,
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: colors.textSecondary,
    },
    closeButtonText: {
      fontSize: 16,
      fontWeight: '600',
    },
  });
