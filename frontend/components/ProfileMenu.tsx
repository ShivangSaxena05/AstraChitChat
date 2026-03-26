import React, { useState } from 'react';
import { Modal, Pressable, View, Text, StyleSheet, useColorScheme, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

  const handlePrivacySecurity = () => {
    onClose();
    router.push('/profile/settings');
  };

  const handleBlockedContacts = () => {
    onClose();
    router.push('/profile/settings');
  };

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('token');
              await AsyncStorage.removeItem('userId');
              onClose();
              router.replace('/(auth)/login' as any);
            } catch (error) {
              Alert.alert('Error', 'Failed to log out');
            }
          }
        }
      ]
    );
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
        <Pressable style={[styles.menuContainer, { backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff' }]} onPress={(e) => e.stopPropagation()}>

          {/* Handle bar */}
          <View style={styles.handleBar} />

          <TouchableOpacity style={styles.menuItem} onPress={handleSettings}>
            <Ionicons name="settings-outline" size={24} color={iconColor} />
            <ThemedText style={styles.menuText}>Settings</ThemedText>
            <Ionicons name="chevron-forward" size={20} color={colorScheme === 'dark' ? '#666' : '#999'} style={styles.chevron} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handlePrivacySecurity}>
            <Ionicons name="shield-checkmark-outline" size={24} color={iconColor} />
            <ThemedText style={styles.menuText}>Privacy & Security</ThemedText>
            <Ionicons name="chevron-forward" size={20} color={colorScheme === 'dark' ? '#666' : '#999'} style={styles.chevron} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handleBlockedContacts}>
            <Ionicons name="ban-outline" size={24} color={iconColor} />
            <ThemedText style={styles.menuText}>Blocked Contacts</ThemedText>
            <Ionicons name="chevron-forward" size={20} color={colorScheme === 'dark' ? '#666' : '#999'} style={styles.chevron} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => handleOption('Archive')}>
            <Ionicons name="archive-outline" size={24} color={iconColor} />
            <ThemedText style={styles.menuText}>Archive</ThemedText>
            <Ionicons name="chevron-forward" size={20} color={colorScheme === 'dark' ? '#666' : '#999'} style={styles.chevron} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => handleOption('Saved')}>
            <Ionicons name="bookmark-outline" size={24} color={iconColor} />
            <ThemedText style={styles.menuText}>Saved</ThemedText>
            <Ionicons name="chevron-forward" size={20} color={colorScheme === 'dark' ? '#666' : '#999'} style={styles.chevron} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => handleOption('Close Friends')}>
            <Ionicons name="people-outline" size={24} color={iconColor} />
            <ThemedText style={styles.menuText}>Close Friends</ThemedText>
            <Ionicons name="chevron-forward" size={20} color={colorScheme === 'dark' ? '#666' : '#999'} style={styles.chevron} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => handleOption('Activity Log')}>
            <Ionicons name="time-outline" size={24} color={iconColor} />
            <ThemedText style={styles.menuText}>Activity Log</ThemedText>
            <Ionicons name="chevron-forward" size={20} color={colorScheme === 'dark' ? '#666' : '#999'} style={styles.chevron} />
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color="#ff3b30" />
            <ThemedText style={[styles.menuText, { color: '#ff3b30' }]}>Log Out</ThemedText>
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
    maxHeight: '80%',
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#666',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128, 128, 128, 0.3)',
  },
  menuText: {
    fontSize: 16,
    marginLeft: 15,
    flex: 1,
  },
  chevron: {
    marginLeft: 'auto',
  },
  separator: {
    height: 16,
  },
});

