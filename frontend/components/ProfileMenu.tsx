import React, { useState } from 'react';
import { Modal, Pressable, View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ThemedText } from './themed-text';
import { useSocket } from '@/contexts/SocketContext';
import { post } from '@/services/api';
import { useTheme } from '@/hooks/use-theme-color';
import secureTokenManager from '@/services/secureTokenManager';

interface ProfileMenuProps {
  visible: boolean;
  onClose: () => void;
}

export default function ProfileMenu({ visible, onClose }: ProfileMenuProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();
  const colors = useTheme();
  const { disconnect } = useSocket();
  const iconColor = colors.icon;

  const handleSettings = () => {
    onClose();
    router.push('/profile/settings' as any);
  };

  const handlePrivacySecurity = () => {
    onClose();
    router.push('/profile/settings' as any);
  };

  const handleBlockedContacts = () => {
    onClose();
    router.push('/profile/settings' as any);
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
            setIsLoggingOut(true);
            try {
              // Step 1: Call backend logout endpoint
              const token = await secureTokenManager.getToken();
              if (token) {
                try {
                  await post('/auth/logout', {});
                } catch (error) {
                  console.warn('[Logout] Backend logout failed, proceeding with local logout:', error);
                }
              }

              // Step 2: Disconnect socket
              disconnect();

              // Step 3: Clear stored credentials from secure storage ✅ SECURE
              await secureTokenManager.clearAll();

              // Step 4: Close menu
              onClose();

              // ✅ FIX 4.4: Correct navigation path and handle errors
              setTimeout(() => {
                try {
                  router.replace('/auth/login' as any);
                } catch (navError) {
                  console.error('[Logout] Navigation error:', navError);
                  // Fallback: try push if replace fails
                  router.push('/auth/login' as any);
                }
              }, 300);
            } catch (error) {
              console.error('[Logout] Logout error:', error);
              Alert.alert('Error', 'Failed to log out. Please try again.');
              setIsLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  const handleOption = (title: string) => {
    onClose();
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
        <Pressable style={[styles.menuContainer, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>

          {/* Handle bar */}
          <View style={[styles.handleBar, { backgroundColor: colors.border }]} />

          <View style={styles.titleWrap}>
            <ThemedText style={[styles.menuTitle, { color: colors.text }]}>Profile Hub</ThemedText>
            <ThemedText style={[styles.menuSubtitle, { color: colors.textSecondary }]}>Control your account and privacy</ThemedText>
          </View>

          <ThemedText style={[styles.sectionLabel, { color: colors.textSecondary }]}>Account</ThemedText>

          <TouchableOpacity style={styles.menuItem} onPress={handleSettings}>
            <Ionicons name="settings-outline" size={24} color={iconColor} />
            <ThemedText style={styles.menuText}>Settings</ThemedText>
            <Ionicons name="chevron-forward" size={20} color={colors.icon} style={styles.chevron} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handlePrivacySecurity}>
            <Ionicons name="shield-checkmark-outline" size={24} color={iconColor} />
            <ThemedText style={styles.menuText}>Privacy & Security</ThemedText>
            <Ionicons name="chevron-forward" size={20} color={colors.icon} style={styles.chevron} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handleBlockedContacts}>
            <Ionicons name="ban-outline" size={24} color={iconColor} />
            <ThemedText style={styles.menuText}>Blocked Contacts</ThemedText>
            <Ionicons name="chevron-forward" size={20} color={colors.icon} style={styles.chevron} />
          </TouchableOpacity>

          <ThemedText style={[styles.sectionLabel, { color: colors.textSecondary }]}>Library</ThemedText>

          <TouchableOpacity style={styles.menuItem} onPress={() => handleOption('Archive')}>
            <Ionicons name="archive-outline" size={24} color={iconColor} />
            <ThemedText style={styles.menuText}>Archive</ThemedText>
            <Ionicons name="chevron-forward" size={20} color={colors.icon} style={styles.chevron} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => handleOption('Saved')}>
            <Ionicons name="bookmark-outline" size={24} color={iconColor} />
            <ThemedText style={styles.menuText}>Saved</ThemedText>
            <Ionicons name="chevron-forward" size={20} color={colors.icon} style={styles.chevron} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => handleOption('Close Friends')}>
            <Ionicons name="people-outline" size={24} color={iconColor} />
            <ThemedText style={styles.menuText}>Close Friends</ThemedText>
            <Ionicons name="chevron-forward" size={20} color={colors.icon} style={styles.chevron} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => handleOption('Activity Log')}>
            <Ionicons name="time-outline" size={24} color={iconColor} />
            <ThemedText style={styles.menuText}>Activity Log</ThemedText>
            <Ionicons name="chevron-forward" size={20} color={colors.icon} style={styles.chevron} />
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={24} color={colors.error} />
            <ThemedText style={[styles.menuText, { color: colors.error }]}>Log Out</ThemedText>
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
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  menuContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 18,
    paddingBottom: 34,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: 'rgba(200, 169, 107, 0.28)',
  },
  handleBar: {
    width: 44,
    height: 4,
    backgroundColor: '#666',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  titleWrap: {
    marginBottom: 10,
    paddingHorizontal: 6,
  },
  menuTitle: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  menuSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 6,
    paddingHorizontal: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128, 128, 128, 0.3)',
  },
  menuText: {
    fontSize: 15,
    marginLeft: 14,
    fontWeight: '600',
    flex: 1,
  },
  chevron: {
    marginLeft: 'auto',
  },
  separator: {
    height: 16,
  },
});

