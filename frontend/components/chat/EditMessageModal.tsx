import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useTheme } from '@/hooks/use-theme-color';

interface EditMessageModalProps {
  visible: boolean;
  messageText: string;
  isLoading: boolean;
  onSave: (newText: string) => Promise<void>;
  onCancel: () => void;
}

export const EditMessageModal: React.FC<EditMessageModalProps> = ({
  visible,
  messageText,
  isLoading,
  onSave,
  onCancel,
}) => {
  const colors = useTheme();
  const [editedText, setEditedText] = useState(messageText);
  const styles = createStyles(colors);

  const handleSave = async () => {
    if (!editedText.trim()) {
      alert('Message cannot be empty');
      return;
    }
    if (editedText === messageText) {
      onCancel();
      return;
    }
    await onSave(editedText);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.overlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            {/* Header */}
            <Text style={[styles.title, { color: colors.text }]}>Edit Message</Text>

            {/* Input */}
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.textSecondary,
                  backgroundColor: colors.background,
                },
              ]}
              value={editedText}
              onChangeText={setEditedText}
              placeholder="Edit your message..."
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={5000}
              editable={!isLoading}
            />

            {/* Character count */}
            <Text style={[styles.charCount, { color: colors.textSecondary }]}>
              {editedText.length}/5000
            </Text>

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onCancel}
                disabled={isLoading}
              >
                <Text style={[styles.buttonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.button,
                  styles.saveButton,
                  { backgroundColor: colors.text },
                  isLoading && styles.buttonDisabled,
                ]}
                onPress={handleSave}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.card} size="small" />
                ) : (
                  <Text style={[styles.buttonText, { color: colors.card }]}>
                    Save
                  </Text>
                )}
              </TouchableOpacity>
            </View>
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
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 16,
    },
    input: {
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      marginBottom: 8,
      minHeight: 100,
      textAlignVertical: 'top',
    },
    charCount: {
      fontSize: 12,
      marginBottom: 16,
      textAlign: 'right',
    },
    buttonContainer: {
      flexDirection: 'row',
      gap: 12,
    },
    button: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButton: {
      borderWidth: 1,
      borderColor: colors?.textSecondary || '#999',
    },
    saveButton: {
      borderWidth: 0,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      fontSize: 16,
      fontWeight: '600',
    },
  });
