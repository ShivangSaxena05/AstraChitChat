import React, { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Alert, Modal, TouchableOpacity, View, Text, FlatList, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { get } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';

export interface SavedAccount {
  userId: string;
  token: string;
  username: string;
  profilePicture: string;
}

export function useAccountSwitcher() {
  const [currentUsername, setCurrentUsername] = useState<string>('User');
  const [isAccountModalVisible, setIsAccountModalVisible] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const router = useRouter();
  const { connect } = useSocket();

  // Fetch current username on mount
  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    try {
      const data = await get('/profile/me');
      if (data?.user?.username) {
        setCurrentUsername(data.user.username);
      } else if (data?.username) {
        setCurrentUsername(data.username);
      }
    } catch (error) {
      console.log('Error fetching user profile:', error);
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

  const switchAccount = async (account: SavedAccount) => {
    try {
      const currentUserId = await AsyncStorage.getItem('userId');
      if (currentUserId === account.userId) {
        setIsAccountModalVisible(false);
        return;
      }

      await AsyncStorage.setItem('token', account.token);
      await AsyncStorage.setItem('userId', account.userId);
      setCurrentUsername(account.username);
      setIsAccountModalVisible(false);
      
      await connect(true);
      
      Alert.alert(
        "Account Switched",
        `Switched to ${account.username}`,
        [{ text: "OK", onPress: () => router.replace('/(tabs)' as any) }]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to switch accounts');
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
  return (
    <TouchableOpacity 
      style={styles.usernameHeaderSelector} 
      activeOpacity={0.7}
      onPress={onPress}
    >
      <Text style={styles.usernameHeaderText}>{username}</Text>
      <Ionicons name="chevron-down" size={20} color="white" style={styles.usernameHeaderIcon} />
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
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.bottomSheetModal}>
          <View style={styles.modalDragIndicator} />
          <Text style={styles.modalTitle}>Switch Account</Text>
          
          <FlatList
            data={accounts}
            keyExtractor={(item) => item.userId}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.accountRow}
                onPress={() => onSwitch(item)}
              >
                <Image source={{ uri: item.profilePicture }} style={styles.accountAvatar} />
                <Text style={styles.accountUsername}>{item.username}</Text>
                {item.username === currentUsername && (
                  <Ionicons name="checkmark-circle" size={24} color="#4ADDAE" />
                )}
              </TouchableOpacity>
            )}
          />

          <TouchableOpacity style={styles.addAccountButton} onPress={onAddAccount}>
            <Ionicons name="add-circle-outline" size={24} color="#fff" style={{ marginRight: 10 }} />
            <Text style={styles.addAccountText}>Add Account</Text>
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
    color: '#fff',
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
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  bottomSheetModal: {
    backgroundColor: '#1c1c1e',
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
    backgroundColor: '#3a3a3c',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#fff',
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
    borderBottomColor: '#2c2c2e',
  },
  accountAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 15,
  },
  accountUsername: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  addAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    marginTop: 10,
  },
  addAccountText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

