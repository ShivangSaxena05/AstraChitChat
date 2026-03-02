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
  const router = useRouter();
  const { connect } = useSocket();

  const handleLogin = async () => {
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
      const accountExists = savedAccounts.some(acc => acc.userId === data._id);
      
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
        const updatedAccounts = savedAccounts.map(acc => 
          acc.userId === data._id ? { ...acc, token: data.token } : acc
        );
        await AsyncStorage.setItem('saved_accounts', JSON.stringify(updatedAccounts));
      }
      
      // Connect to socket before navigation
      await connect();
      
      // Navigate only after storage operations complete
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Login failed. Please check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login</Text>
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
      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Logging in...' : 'Login'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push('/auth/signup')}>
        <Text style={styles.link}>Don't have an account? Sign up</Text>
      </TouchableOpacity>
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
