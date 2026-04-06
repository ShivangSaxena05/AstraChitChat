import React, { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Alert, Modal, TouchableOpacity, View, Text, FlatList, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { get } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme-color';
import secureTokenManager from '@/services/secureTokenManager';

export interface SavedAccount {
  userId: string;
  username: string;
  profilePicture: string;
  // ⚠️ REMOVED: token - tokens are now stored securely in SecureStore only
}

export function useAccountSwitcher() {
  const [currentUsername, setCurrentUsername] = useState<string>('User');
  const [isAccountModalVisible, setIsAccountModalVisible] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const router = useRouter();
  const { connect, disconnect, setConversations } = useSocket();
  const { endCall } = useCall();
  const { handleAuthError } = useAuth();

  // Fetch current username on mount
  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    try {
      console.log('[useAccountSwitcher] 🔄 Fetching user profile...');
      const data = await get('/profile/me');
      if (data?.user?.username) {
        console.log('[useAccountSwitcher] ✅ Profile fetched:', data.user.username);
        setCurrentUsername(data.user.username);
      } else if (data?.username) {
        console.log('[useAccountSwitcher] ✅ Profile fetched:', data.username);
        setCurrentUsername(data.username);
      } else {
        console.warn('[useAccountSwitcher] ⚠️ No username in profile data:', data);
      }
    } catch (error: any) {
      // Network error = server not reachable (ERR_CONNECTION_REFUSED)
      // Don't redirect to login — the server may just be starting up or the user is offline
      if (error?.type === 'NETWORK_ERROR' || error?.originalError?.code === 'ERR_NETWORK') {
        console.warn('[useAccountSwitcher] ⚠️ Server unreachable — will show cached username');
        // Try to show saved username from AsyncStorage as fallback
        try {
          const accountsStr = await AsyncStorage.getItem('saved_accounts');
          if (accountsStr) {
            const accounts = JSON.parse(accountsStr);
            if (Array.isArray(accounts) && accounts.length > 0) {
              const savedUserId = await secureTokenManager.getUserId();
              const current = accounts.find((a: any) => a.userId === savedUserId) || accounts[0];
              if (current?.username) setCurrentUsername(current.username);
            }
          }
        } catch (_) { /* ignore fallback errors */ }
        return;
      }

      // Auth error = token expired/invalid → redirect to login
      if (error?.isAuthError || error?.type === 'AUTH_ERROR') {
        console.log('[useAccountSwitcher] 🔐 Auth error — redirecting to login');
        await handleAuthError(error?.message || 'Your session has expired. Please log in again.');
        return;
      }

      // Any other error — log cleanly with message only
      console.error('[useAccountSwitcher] ❌ Error fetching user profile:', error?.message || 'Unknown error');
    }
  };

  const loadSavedAccounts = async () => {
    try {
      const accountsStr = await AsyncStorage.getItem('saved_accounts');
      if (accountsStr) {
        setSavedAccounts(JSON.parse(accountsStr));
      }
    } catch (error) {
      console.error('Error loading saved accounts:', error);
    }
  };

  const openAccountSwitcher = useCallback(() => {
    loadSavedAccounts();
    setIsAccountModalVisible(true);
  }, []);

  // ✅ FIX: Reset all account state before switching
  const resetAccountState = async () => {
    console.log('[AccountSwitcher] Resetting account state for all systems');
    
    try {
      // 1. End any active calls
      try {
        endCall();
        console.log('[AccountSwitcher] Active call ended');
      } catch (error) {
        console.warn('[AccountSwitcher] Error ending call:', error);
      }
      
      // 2. Disconnect socket (will clear conversations and online status)
      try {
        disconnect();
        console.log('[AccountSwitcher] Socket disconnected');
      } catch (error) {
        console.warn('[AccountSwitcher] Error disconnecting socket:', error);
      }
      
      // 3. Clear conversations state
      try {
        setConversations([]);
        console.log('[AccountSwitcher] Conversations cleared');
      } catch (error) {
        console.warn('[AccountSwitcher] Error clearing conversations:', error);
      }
      
      // 4. Wait a moment for all state resets to settle
      await new Promise((resolve) => setTimeout(resolve, 300));
      
      console.log('[AccountSwitcher] Account state reset complete');
    } catch (error) {
      console.error('[AccountSwitcher] Error during state reset:', error);
      throw error;
    }
  };

  const switchAccount = async (account: SavedAccount) => {
    try {
      const currentUserId = await secureTokenManager.getUserId();
      if (currentUserId === account.userId) {
        console.log('[AccountSwitcher] Already on this account');
        setIsAccountModalVisible(false);
        return;
      }

      console.log('[AccountSwitcher] Switching from', currentUserId, 'to', account.userId);

      // ⚠️ SECURITY: Cannot retrieve token from saved_accounts (it's not stored there)
      // For account switching, require user to log in again
      Alert.alert(
        'Re-authentication Required',
        `For security reasons, please log in again to switch to ${account.username}.`,
        [
          {
            text: 'Cancel',
            onPress: () => setIsAccountModalVisible(false),
          },
          {
            text: 'OK',
            onPress: async () => {
              try {
                // 1. Reset state FIRST (before navigation)
                await resetAccountState();
                
                // 2. Clear tokens to force re-login
                await secureTokenManager.clearAll();
                console.log('[AccountSwitcher] Tokens cleared, navigating to login');
                
                // 3. Close modal
                setIsAccountModalVisible(false);
                
                // 4. Navigate to login (with account info pre-filled if backend supports it)
                router.replace('/auth/login' as any);
              } catch (error: any) {
                console.error('[AccountSwitcher] Error during switch:', error);
                Alert.alert('Error', 'Failed to switch accounts. Please try again.');
                setIsAccountModalVisible(false);
              }
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('[AccountSwitcher] Account switch error:', error);
      Alert.alert('Error', error.message || 'Failed to switch accounts');
      setIsAccountModalVisible(false);
    }
  };

  const addAccount = () => {
    setIsAccountModalVisible(false);
    router.push('/auth/login');
  };

  const closeAccountModal = () => {
    setIsAccountModalVisible(false);
  };

  return {
    currentUsername,
    isAccountModalVisible,
    savedAccounts,
    openAccountSwitcher,
    switchAccount,
    addAccount,
    closeAccountModal,
    setCurrentUsername,
  };
}

// Usage: 
// const { currentUsername, openAccountSwitcher } = useAccountSwitcher();
// <UsernameHeader username={currentUsername} onPress={openAccountSwitcher} />
// Use AccountSwitcherModal separately with the returned state/methods

export function UsernameHeader({ username, onPress }: { username: string, onPress: () => void }) {
  const colors = useTheme();
  
  return (
    <TouchableOpacity 
      style={styles.usernameHeaderSelector} 
      activeOpacity={0.7}
      onPress={onPress}
    >
      <Text style={[styles.usernameHeaderText, { color: colors.text }]}>{username}</Text>
      <Ionicons name="chevron-down" size={20} color={colors.text} style={styles.usernameHeaderIcon} />
    </TouchableOpacity>
  );
}

// Account Switcher Modal Component (reusable)

interface AccountSwitcherModalProps {
  visible: boolean;
  accounts: SavedAccount[];
  currentUsername: string;
  onSwitch: (account: SavedAccount) => void;
  onAddAccount: () => void;
  onClose: () => void;
}

export function AccountSwitcherModal({
  visible,
  accounts,
  currentUsername,
  onSwitch,
  onAddAccount,
  onClose,
}: AccountSwitcherModalProps) {
  const colors = useTheme();

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={[styles.modalOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={[styles.bottomSheetModal, { backgroundColor: colors.card }]}>
          <View style={styles.modalDragIndicator} />
          <Text style={[styles.modalTitle, { color: colors.text }]}>Switch Account</Text>
          
          <FlatList
            data={accounts}
            keyExtractor={(item) => item.userId}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[styles.accountRow, { borderBottomColor: colors.border }]}
                onPress={() => onSwitch(item)}
              >
                <Image source={{ uri: item.profilePicture }} style={styles.accountAvatar} />
                <Text style={[styles.accountUsername, { color: colors.text }]}>{item.username}</Text>
                {item.username === currentUsername && (
                  <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                )}
              </TouchableOpacity>
            )}
          />

          <TouchableOpacity style={[styles.addAccountButton, { borderTopColor: colors.border }]} onPress={onAddAccount}>
            <Ionicons name="add-circle-outline" size={24} color={colors.text} style={{ marginRight: 10 }} />
            <Text style={[styles.addAccountText, { color: colors.text }]}>Add Account</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  usernameHeaderSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  usernameHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginRight: 4,
  },
  usernameHeaderIcon: {
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bottomSheetModal: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 10,
    minHeight: 250,
  },
  modalDragIndicator: {
    width: 40,
    height: 5,
    backgroundColor: 'rgba(100,100,100,0.5)',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  accountAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 15,
  },
  accountUsername: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  addAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    marginTop: 10,
    borderTopWidth: 1,
  },
  addAccountText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

