import React, { useState, useEffect } from 'react';
import { TouchableOpacity, Alert, Platform, Modal, View, Text, StyleSheet, useColorScheme, Image, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useSocket } from '@/contexts/SocketContext';

export default function HamburgerMenu() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<any[]>([]);
  const { connect, disconnect } = useSocket();

  useEffect(() => {
    if (modalVisible) {
      AsyncStorage.getItem('saved_accounts').then(str => {
        if (str) setSavedAccounts(JSON.parse(str));
      });
    }
  }, [modalVisible]);

  const handleSettings = () => {
    setModalVisible(false);
    router.push('/profile/settings' as any);
  };

  const handlePrivacy = () => {
    setModalVisible(false);
    Alert.alert('Privacy', 'Privacy screen coming soon');
  };

  const handleLogout = async () => {
    setModalVisible(false);
    
    // Remove current user from saved_accounts if needed, or keep it but just log out. 
    // Typically log out just clears active token.
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('userId');
    if (disconnect) disconnect();
    router.replace('/auth/login');
  };

  const handleAddAccount = () => {
    setModalVisible(false);
    router.push('/auth/login');
  };

  const handleSwitchAccount = async (acc: any) => {
    setModalVisible(false);
    await AsyncStorage.setItem('token', acc.token);
    await AsyncStorage.setItem('userId', acc.userId);
    
    if (disconnect) disconnect();
    if (connect) await connect();
    
    // Trigger deep navigation refresh
    router.replace('/(tabs)' as any);
  };

  const iconColor = colorScheme === 'dark' ? '#fff' : '#000';

  return (
    <>
      <TouchableOpacity onPress={() => setModalVisible(true)}>
        <Ionicons name="menu-outline" size={24} color={iconColor} />
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setModalVisible(false)}>
          <Pressable style={[styles.menuContainer, { backgroundColor: colorScheme === 'dark' ? '#333' : '#fff' }]} onPress={(e) => e.stopPropagation()}>
            
            {savedAccounts.length > 0 && (
              <View style={styles.accountsSection}>
                <Text style={[styles.sectionTitle, { color: iconColor }]}>Switch Account</Text>
                {savedAccounts.map(acc => (
                  <TouchableOpacity key={acc.userId} style={styles.menuItem} onPress={() => handleSwitchAccount(acc)}>
                    <Image source={{ uri: acc.profilePicture }} style={{ width: 30, height: 30, borderRadius: 15 }} />
                    <Text style={[styles.menuText, { color: iconColor }]}>@{acc.username}</Text>
                  </TouchableOpacity>
                ))}
                <View style={[styles.divider, { backgroundColor: colorScheme === 'dark' ? '#555' : '#eee' }]} />
              </View>
            )}

            <TouchableOpacity style={styles.menuItem} onPress={handleAddAccount}>
              <Ionicons name="person-add-outline" size={24} color={iconColor} />
              <Text style={[styles.menuText, { color: iconColor }]}>Add Account</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleSettings}>
              <Ionicons name="settings-outline" size={24} color={iconColor} />
              <Text style={[styles.menuText, { color: iconColor }]}>Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handlePrivacy}>
              <Ionicons name="shield-checkmark-outline" size={24} color={iconColor} />
              <Text style={[styles.menuText, { color: iconColor }]}>Privacy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={24} color="#ff3b30" />
              <Text style={[styles.menuText, { color: '#ff3b30' }]}>Logout</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
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
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 10,
  },
  menuText: {
    fontSize: 18,
    marginLeft: 15,
  },
  accountsSection: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
    paddingHorizontal: 10,
    opacity: 0.6,
  },
  divider: {
    height: 1,
    marginTop: 10,
  },
});
