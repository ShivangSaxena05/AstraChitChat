import React, { useState } from 'react';
import { TouchableOpacity, Alert, Platform, Modal, View, Text, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

export default function HamburgerMenu() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const [modalVisible, setModalVisible] = useState(false);

  const handleSettings = () => {
    setModalVisible(false);
    Alert.alert('Settings', 'Settings screen coming soon');
  };

  const handlePrivacy = () => {
    setModalVisible(false);
    Alert.alert('Privacy', 'Privacy screen coming soon');
  };

  const handleLogout = async () => {
    setModalVisible(false);
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('userId');
    router.replace('/auth/login');
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
        <View style={styles.overlay}>
          <View style={[styles.menuContainer, { backgroundColor: colorScheme === 'dark' ? '#333' : '#fff' }]}>
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
            <TouchableOpacity style={styles.cancelItem} onPress={() => setModalVisible(false)}>
              <Text style={[styles.cancelText, { color: iconColor }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  cancelItem: {
    alignItems: 'center',
    paddingVertical: 15,
    marginTop: 10,
  },
  cancelText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});
