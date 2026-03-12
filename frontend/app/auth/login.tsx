import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { post } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [userId, setUserId] = useState('');
  const router = useRouter();
  const { connect } = useSocket();

  const completeLogin = async (data: any) => {
    // Store token and userId before navigation
    await AsyncStorage.setItem('token', data.token);
    await AsyncStorage.setItem('userId', data._id);

    // --- MULTI-ACCOUNT SUPPORT ---
    // Fetch existing saved accounts
    const savedAccountsStr = await AsyncStorage.getItem('saved_accounts');
    let savedAccounts: any[] = [];
    if (savedAccountsStr) {
      try {
        savedAccounts = JSON.parse(savedAccountsStr);
      } catch (e) {
        savedAccounts = [];
      }
    }

    // Check if account already exists in the list to avoid duplicates
    const accountExists = savedAccounts.some((acc: any) => acc.userId === data._id);
    
    if (!accountExists) {
      // Add new account to the list
      savedAccounts.push({
        userId: data._id,
        token: data.token,
        username: data.username || data.name || email.split('@')[0], // Fallback if backend doesn't return username
        profilePicture: data.profilePicture || 'https://via.placeholder.com/40' // Fallback image
      });
      await AsyncStorage.setItem('saved_accounts', JSON.stringify(savedAccounts));
    } else {
      // If it exists, update the token just in case it refreshed
      const updatedAccounts = savedAccounts.map((acc: any) => 
        acc.userId === data._id ? { ...acc, token: data.token } : acc
      );
      await AsyncStorage.setItem('saved_accounts', JSON.stringify(updatedAccounts));
    }
    
    // Connect to socket before navigation
    await connect();
    
    // Navigate only after storage operations complete
    router.replace('/(tabs)' as any);
  };

  const handleLogin = async () => {
    if (requires2FA) {
      if (!mfaToken.trim()) {
        Alert.alert('Error', 'Please enter your 2FA code');
        return;
      }
      setLoading(true);
      try {
        const data = await post('/auth/2fa/login', { userId, token: mfaToken });
        await completeLogin(data);
      } catch (error: any) {
        Alert.alert('Error', error.response?.data?.message || 'Invalid 2FA token');
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (!email.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const data = await post('/auth/login', { email, password });
      
      // Check if 2FA is required first
      if (data.requires2FA) {
        setRequires2FA(true);
        setUserId(data.userId);
        setLoading(false);
        return;
      }
      
      // Otherwise, complete the login normally
      await completeLogin(data);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Login failed. Please check your credentials and try again.');
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{requires2FA ? 'Enter 2FA Code' : 'Login'}</Text>
      
      {!requires2FA ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </>
      ) : (
        <TextInput
          style={styles.input}
          placeholder="6-digit Authenticator Code"
          value={mfaToken}
          onChangeText={setMfaToken}
          keyboardType="number-pad"
          maxLength={6}
        />
      )}

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? (requires2FA ? 'Verifying...' : 'Logging in...') : (requires2FA ? 'Verify Code' : 'Login')}</Text>
      </TouchableOpacity>
      
      {!requires2FA && (
        <TouchableOpacity onPress={() => router.push('/auth/signup')}>
          <Text style={styles.link}>Don't have an account? Sign up</Text>
        </TouchableOpacity>
      )}
      {requires2FA && (
        <TouchableOpacity onPress={() => { setRequires2FA(false); setMfaToken(''); }}>
          <Text style={[styles.link, { marginTop: 10 }]}>Back to Login</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    marginBottom: 10,
    borderRadius: 5,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  link: {
    textAlign: 'center',
    color: '#007AFF',
  },
});

