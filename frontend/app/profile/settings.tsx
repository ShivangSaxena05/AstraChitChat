import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { get, post, put } from '@/services/api';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Share, StyleSheet, Switch, TouchableOpacity, View, useColorScheme, Modal, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface BlockedUser {
  _id: string;
  name: string;
  username: string;
  profilePicture: string;
}

  // ... existing code ...
export default function SettingsScreen() {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [mutedUsers, setMutedUsers] = useState<BlockedUser[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [setup2FAData, setSetup2FAData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const colorScheme = useColorScheme();
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      fetchUsers();
    }, [])
  );

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const [blockedRes, mutedRes, profileRes] = await Promise.all([
        get('/users/blocked'),
        get('/users/muted'),
        get('/profile/me'),
      ]);
      setBlockedUsers(blockedRes);
      setMutedUsers(mutedRes);
      setIsPrivate(profileRes.isPrivate || false);
      setIsAdmin(profileRes.role === 'admin');
      setIs2FAEnabled(profileRes.isTwoFactorEnabled || false);
    } catch (error: any) {
      console.error('Fetch settings error:', error);
      Alert.alert('Error', 'Failed to fetch settings data');
    } finally {
      setLoading(false);
    }
  };

  const togglePrivacy = async (value: boolean) => {
    setIsPrivate(value);
    try {
      await put('/profile/me', { isPrivate: value });
    } catch (error: any) {
      setIsPrivate(!value); // revert
      Alert.alert('Error', 'Failed to update privacy settings');
    }
  };

  const toggle2FA = async (value: boolean) => {
    if (value) {
      // Enable 2FA -> Show Modal
      try {
        setLoading(true);
        const res = await post('/auth/2fa/setup', {});
        setSetup2FAData(res);
        setTokenInput('');
        setShow2FAModal(true);
      } catch (error: any) {
        Alert.alert('Error', 'Failed to initiate 2FA setup');
      } finally {
        setLoading(false);
      }
    } else {
      // Disable 2FA
      setSetup2FAData(null);
      setTokenInput('');
      setShow2FAModal(true); // show modal to prompt for token to disable
    }
  };

  const handleVerify2FA = async () => {
    try {
      if (!is2FAEnabled) {
        // We are enabling
        await post('/auth/2fa/verify-setup', { token: tokenInput });
        setIs2FAEnabled(true);
        setShow2FAModal(false);
        Alert.alert('Success', 'Two-Factor Authentication is now enabled');
      } else {
        // We are disabling
        await post('/auth/2fa/disable', { token: tokenInput });
        setIs2FAEnabled(false);
        setShow2FAModal(false);
        Alert.alert('Success', 'Two-Factor Authentication is now disabled');
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Invalid token');
    }
  };

  const handleUnblock = async (userId: string) => {
    try {
      const res = await post(`/users/${userId}/block`, {});
      if (!res.isBlocked) {
        setBlockedUsers(prev => prev.filter(u => u._id !== userId));
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to unblock user');
    }
  };

  const handleUnmute = async (userId: string) => {
    try {
      const res = await post(`/users/${userId}/mute`, {});
      if (!res.isMuted) {
        setMutedUsers(prev => prev.filter(u => u._id !== userId));
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to unmute user');
    }
  };

  const renderUser = ({ item, isBlocked }: { item: BlockedUser, isBlocked: boolean }) => (
    <View key={item._id} style={styles.userRow}>
      <Image source={{ uri: item.profilePicture || 'https://i.pravatar.cc/150' }} style={styles.avatar} />
      <View style={styles.userInfo}>
        <ThemedText style={styles.username}>{item.username}</ThemedText>
        <ThemedText style={styles.name}>{item.name}</ThemedText>
      </View>
      <TouchableOpacity 
        style={styles.actionButton} 
        onPress={() => isBlocked ? handleUnblock(item._id) : handleUnmute(item._id)}
      >
        <ThemedText style={styles.actionButtonText}>
          {isBlocked ? 'Unblock' : 'Unmute'}
        </ThemedText>
      </TouchableOpacity>
    </View>
  );

  const handleExportData = async () => {
    try {
      setLoading(true);
      const data = await get('/users/export');
      await Share.share({
        message: JSON.stringify(data, null, 2),
        title: 'My AstraChitChat Data Transport',
      });
    } catch (error: any) {
      Alert.alert('Error', 'Failed to export data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you absolutely sure? This action is permanent and will delete all your data, posts, and messages. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete Permanently', 
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await fetch('http://localhost:5000/api/users/me', {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${await AsyncStorage.getItem('token')}` }
              }); // basic fetch fallback
              await AsyncStorage.removeItem('token');
              await AsyncStorage.removeItem('userId');
              router.replace('/(auth)/login' as any);
            } catch (error: any) {
              setLoading(false);
              Alert.alert('Error', 'Failed to delete account');
            }
          }
        }
      ]
    );
  };

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
    },
    modalContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 20,
    },
    modalText: {
      fontSize: 16,
      textAlign: 'center',
      marginBottom: 10,
      color: colorScheme === 'dark' ? '#ccc' : '#444',
    },
    qrCode: {
      width: 200,
      height: 200,
      marginVertical: 10,
    },
    input: {
      borderWidth: 1,
      borderColor: colorScheme === 'dark' ? '#333' : '#ccc',
      borderRadius: 12,
      padding: 16,
      width: '100%',
      fontSize: 24,
      textAlign: 'center',
      marginBottom: 20,
      color: colorScheme === 'dark' ? '#fff' : '#000',
    },
    modalButtons: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      width: '100%',
    },
    modalButton: {
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
      backgroundColor: colorScheme === 'dark' ? '#333' : '#eee',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sectionHeader: {
      fontSize: 18,
      fontWeight: 'bold',
      padding: 16,
      backgroundColor: colorScheme === 'dark' ? '#222' : '#f5f5f5',
    },
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colorScheme === 'dark' ? '#333' : '#ccc',
    },
    avatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      marginRight: 12,
    },
    userInfo: {
      flex: 1,
    },
    username: {
      fontWeight: 'bold',
      fontSize: 16,
    },
    name: {
      fontSize: 14,
      color: 'gray',
    },
    actionButton: {
      backgroundColor: colorScheme === 'dark' ? '#444' : '#efefef',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
    },
    actionButtonText: {
      fontWeight: 'bold',
    },
    emptyText: {
      padding: 16,
      fontStyle: 'italic',
      color: 'gray',
    }
  }), [colorScheme]);

  if (loading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView>
        <ThemedText style={styles.sectionHeader}>Account Privacy</ThemedText>
        <View style={styles.userRow}>
          <View style={styles.userInfo}>
            <ThemedText style={styles.username}>Private Account</ThemedText>
            <ThemedText style={styles.name}>Only followers can see your posts and followers list.</ThemedText>
          </View>
          <Switch value={isPrivate} onValueChange={togglePrivacy} />
        </View>

        <ThemedText style={styles.sectionHeader}>Blocked Users</ThemedText>
        {blockedUsers.length === 0 && <ThemedText style={styles.emptyText}>No blocked users</ThemedText>}
        {blockedUsers.map(user => renderUser({ item: user, isBlocked: true }))}
        
        <ThemedText style={styles.sectionHeader}>Muted Users</ThemedText>
        {mutedUsers.length === 0 && <ThemedText style={styles.emptyText}>No muted users</ThemedText>}
        {mutedUsers.map(user => renderUser({ item: user, isBlocked: false }))}

        <ThemedText style={styles.sectionHeader}>Account Control</ThemedText>
        <View style={styles.userRow}>
          <View style={styles.userInfo}>
            <ThemedText style={styles.username}>Two-Factor Auth</ThemedText>
            <ThemedText style={styles.name}>Enhance your account security.</ThemedText>
          </View>
          <Switch value={is2FAEnabled} onValueChange={toggle2FA} />
        </View>
        <TouchableOpacity style={styles.userRow} onPress={handleExportData}>
          <ThemedText style={[styles.username, { color: '#4ADDAE' }]}>Export My Data</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.userRow} onPress={handleDeleteAccount}>
          <ThemedText style={[styles.username, { color: '#ff4444' }]}>Delete Account</ThemedText>
        </TouchableOpacity>

        {isAdmin && (
          <>
            <ThemedText style={styles.sectionHeader}>Administration</ThemedText>
            <TouchableOpacity style={styles.userRow} onPress={() => router.push('/profile/admin' as any)}>
              <ThemedText style={[styles.username, { color: '#ffbd2e' }]}>Admin Dashboard</ThemedText>
            </TouchableOpacity>
          </>
        )}
        <View style={{height: 50}}/>
      </ScrollView>

      {/* 2FA Modal */}
      <Modal visible={show2FAModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShow2FAModal(false)}>
        <ThemedView style={styles.modalContainer}>
          <ThemedText style={styles.modalTitle}>
            {is2FAEnabled ? 'Disable 2FA' : 'Enable 2FA'}
          </ThemedText>
          
          {!is2FAEnabled && setup2FAData ? (
            <>
              <ThemedText style={styles.modalText}>
                1. Scan this QR code with your authenticator app (like Google Authenticator or Authy).
              </ThemedText>
              <Image source={{ uri: setup2FAData.qrCode }} style={styles.qrCode} />
              <ThemedText style={styles.modalText}>
                Or manually enter this code: {setup2FAData.secret}
              </ThemedText>
              <ThemedText style={styles.modalText}>
                2. Enter the 6-digit code generated by the app below to confirm.
              </ThemedText>
            </>
          ) : (
            <ThemedText style={styles.modalText}>
              Enter the 6-digit code from your authenticator app to disable 2FA.
            </ThemedText>
          )}

          <TextInput
            style={styles.input}
            placeholder="000000"
            placeholderTextColor="gray"
            keyboardType="number-pad"
            maxLength={6}
            value={tokenInput}
            onChangeText={setTokenInput}
          />

          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.modalButton} onPress={() => setShow2FAModal(false)}>
              <ThemedText>Cancel</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalButton, { backgroundColor: '#4ADDAE' }]} onPress={handleVerify2FA}>
              <ThemedText style={{ color: '#fff', fontWeight: 'bold' }}>Verify</ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}
