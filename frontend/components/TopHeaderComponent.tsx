import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, FlatList, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useSocket } from '@/contexts/SocketContext';
import { get } from '@/services/api';

interface SavedAccount {
  userId: string;
  token: string;
  username: string;
  profilePicture: string;
}

interface TopHeaderComponentProps {
  showPlusIcon?: boolean;
  onPlusPress?: () => void;
}

export default function TopHeaderComponent({ showPlusIcon = false, onPlusPress }: TopHeaderComponentProps) {
  const router = useRouter();
  const { connect } = useSocket();
  
  const [currentUsername, setCurrentUsername] = useState<string>('Loading...');
  const [isAccountModalVisible, setIsAccountModalVisible] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    try {
      const data = await get('/profile/me');
      if (data && data.user && data.user.username) {
        setCurrentUsername(data.user.username);
      } else if (data && data.username) {
        setCurrentUsername(data.username);
      }
    } catch (error) {
      console.log('Error fetching user profile for header:', error);
      setCurrentUsername('Profile');
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

  const handleOpenAccountSwitcher = () => {
    loadSavedAccounts();
    setIsAccountModalVisible(true);
  };

  const handleSwitchAccount = async (account: SavedAccount) => {
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
        [{ text: "OK", onPress: () => router.replace('/(tabs)') }]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to switch accounts');
    }
  };

  const handleAddAccount = () => {
    setIsAccountModalVisible(false);
    router.push('/auth/login');
  };

  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.usernameHeaderSelector} 
          activeOpacity={0.7}
          onPress={handleOpenAccountSwitcher}
        >
          <Text style={styles.usernameHeaderText}>{currentUsername}</Text>
          <Ionicons name="chevron-down" size={20} color="white" style={styles.usernameHeaderIcon} />
        </TouchableOpacity>

        {showPlusIcon && (
          <TouchableOpacity style={styles.plusButton} onPress={onPlusPress}>
            <Ionicons name="add" size={24} color="white" />
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={isAccountModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsAccountModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsAccountModalVisible(false)}
        >
          <View style={styles.bottomSheetModal}>
            <View style={styles.modalDragIndicator} />
            <Text style={styles.modalTitle}>Switch Account</Text>
            
            <FlatList
              data={savedAccounts}
              keyExtractor={(item) => item.userId}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.accountRow}
                  onPress={() => handleSwitchAccount(item)}
                >
                  <Image source={{ uri: item.profilePicture }} style={styles.accountAvatar} />
                  <Text style={styles.accountUsername}>{item.username}</Text>
                  {item.username === currentUsername && (
                    <Ionicons name="checkmark-circle" size={24} color="#4ADDAE" />
                  )}
                </TouchableOpacity>
              )}
            />

            <TouchableOpacity style={styles.addAccountButton} onPress={handleAddAccount}>
              <Ionicons name="add-circle-outline" size={24} color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.addAccountText}>Add Account</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#000',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center', // Centered for the username
    position: 'relative',
  },
  usernameHeaderSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    zIndex: 15,
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
  plusButton: {
    padding: 8,
    position: 'absolute',
    right: 16,
    top: 50,
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
