import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const ChatIcon = () => {
  const router = useRouter();

  const handlePress = () => {
    router.push('/chat'); // Navigate to the chat list screen
  };

  return (
    <TouchableOpacity style={styles.chatIcon} onPress={handlePress}>
      <Ionicons name="paper-plane-outline" size={26} color="black" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  chatIcon: {
    position: 'absolute',
    top: 10,
    right: 16,
    zIndex: 1, // Ensure it's above other content
  },
});

export default ChatIcon;