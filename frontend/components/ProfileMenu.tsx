import React, { useState } from 'react';
import { Modal, Pressable, View, Text, StyleSheet, useColorScheme, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

interface ProfileMenuProps {
  visible: boolean;
  onClose: () => void;
}

export default function ProfileMenu({ visible, onClose }: ProfileMenuProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#fff' : '#000';

  const handleSettings = () => {
    onClose();
    router.push('/profile/settings');
  };

  const handleOption = (title: string) => {
    onClose();
    // Placeholder - extend with real nav/data
    console.log(`${title} tapped`);
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.menuContainer, { backgroundColor: colorScheme === 'dark' ? '#333' : '#fff' }]} onPress={(e) => e.stopPropagation()}>
          
          <TouchableOpacity style={styles.menuItem} onPress={handleSettings}>
            <Ionicons name="settings-outline" size={24} color={iconColor} />
            <ThemedText style={styles.menuText}>Settings</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => handleOption('Archive')}>
            <Ionicons name="archive-outline" size={24} color={iconColor} />
            <ThemedText style={styles.menuText}>Archive</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => handleOption('Saved')}>
            <Ionicons name="bookmark-outline" size={24} color={iconColor} />
            <ThemedText style={styles.menuText}>Saved</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => handleOption('Close Friends')}>
            <Ionicons name="people-outline" size={24} color={iconColor} />
            <ThemedText style={styles.menuText}>Close Friends</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => handleOption('Activity Log')}>
            <Ionicons name="time-outline" size={24} color={iconColor} />
            <ThemedText style={styles.menuText}>Activity Log</ThemedText>
          </TouchableOpacity>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  menuContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuText: {
    fontSize: 18,
    marginLeft: 15,
  },
});

