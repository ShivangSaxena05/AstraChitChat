import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { post } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';

export default function SignupScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { connect } = useSocket();

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (!email.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }

    setLoading(true);
    try {
      const data = await post('/auth/register', { name, email, password });
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
      await connect();
      router.replace('/(tabs)');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign Up</Text>
      <TextInput
        style={styles.input}
        placeholder="Name"
        value={name}
        onChangeText={setName}
      />
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
      <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Signing up...' : 'Sign Up'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push('/auth/login')}>
        <Text style={styles.link}>Already have an account? Login</Text>
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
