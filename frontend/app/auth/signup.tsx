import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { post } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import { handleErrorResponse } from '@/services/errorHandler';
import { useTheme } from '@/hooks/use-theme-color';

export default function SignupScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { connect } = useSocket();
  const colors = useTheme();

  const validateInput = (): boolean => {
    if (!name.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      Alert.alert('Validation Error', 'Please fill in all fields');
      return false;
    }

    if (name.length < 2) {
      Alert.alert('Validation Error', 'Name must be at least 2 characters');
      return false;
    }

    if (!email.includes('@') || !email.includes('.')) {
      Alert.alert('Validation Error', 'Please enter a valid email address');
      return false;
    }

    if (password.length < 8) {
      Alert.alert('Validation Error', 'Password must be at least 8 characters');
      return false;
    }

    if (password !== confirmPassword) {
      Alert.alert('Validation Error', 'Passwords do not match');
      return false;
    }

    // Check password strength
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    
    if (!hasUppercase || !hasLowercase || !hasNumber) {
      Alert.alert(
        'Weak Password',
        'Password must contain uppercase, lowercase, and numbers'
      );
      return false;
    }

    return true;
  };

  const handleSignup = async () => {
    if (!validateInput()) {
      return;
    }

    setLoading(true);
    try {
      // DEBUG: Log the request
      console.log('🔄 Signup request:', { name: name.trim(), email: email.toLowerCase().trim() });

      const data = await post('/auth/register', {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password,
      });

      // DEBUG: Log the response
      console.log('✅ Signup response:', data);

      if (!data || !data.token || !data._id) {
        throw new Error('Invalid response from server: missing token or user ID');
      }

      // Store credentials
      await AsyncStorage.setItem('token', data.token);
      await AsyncStorage.setItem('userId', data._id);

      // ✅ FIX 1.2: Save account with validation
      const savedAccountsStr = await AsyncStorage.getItem('saved_accounts');
      let savedAccounts: any[] = [];

      try {
        if (savedAccountsStr) {
          savedAccounts = JSON.parse(savedAccountsStr);
          if (!Array.isArray(savedAccounts)) {
            savedAccounts = [];
          }
        }
      } catch (e) {
        console.warn('Invalid saved_accounts format, resetting');
        savedAccounts = [];
      }

      const accountData = {
        userId: data._id,
        token: data.token,
        username: data.username?.trim() || data.name?.trim() || email.split('@')[0],
        profilePicture: data.profilePicture || 'https://via.placeholder.com/40',
      };

      const accountExists = savedAccounts.some((acc: any) =>
        acc && acc.userId && acc.userId === data._id
      );

      if (!accountExists) {
        savedAccounts.push(accountData);
      } else {
        savedAccounts = savedAccounts.map((acc) =>
          acc.userId === data._id ? accountData : acc
        );
      }

      await AsyncStorage.setItem('saved_accounts', JSON.stringify(savedAccounts));

      // ✅ FIX 1.4: Wait for socket connection
      try {
        await connect();
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.warn('Socket connection failed, proceeding:', error);
      }

      // Clear form and navigate
      setName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');

      router.replace('/(tabs)' as any);
    } catch (error: any) {
      console.error('❌ Signup error:', error);
      
      // FIX: Better error handling with more specific messages
      let errorMsg = 'Signup failed. Please try again.';
      
      if (error.type === 'NETWORK_ERROR') {
        errorMsg = 'Network error. Please check your internet connection and ensure the backend server is running.';
      } else if (error.type === 'RATE_LIMIT') {
        errorMsg = 'Too many signup attempts. Please wait 15 minutes before trying again.';
      } else if (error.originalError?.response?.status === 400) {
        const backendMsg = error.originalError.response.data?.message || error.message;
        if (backendMsg.includes('already exists')) {
          errorMsg = 'Email already registered. Please login or use a different email.';
        } else {
          errorMsg = backendMsg || errorMsg;
        }
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      Alert.alert('Signup Failed', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Create Account</Text>

      <TextInput
        style={[styles.input, { 
          borderColor: colors.inputBorder, 
          backgroundColor: colors.input,
          color: colors.text,
        }]}
        placeholder="Full Name"
        placeholderTextColor={colors.placeholder}
        value={name}
        onChangeText={setName}
        editable={!loading}
      />

      <TextInput
        style={[styles.input, { 
          borderColor: colors.inputBorder, 
          backgroundColor: colors.input,
          color: colors.text,
        }]}
        placeholder="Email"
        placeholderTextColor={colors.placeholder}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!loading}
      />

      <TextInput
        style={[styles.input, { 
          borderColor: colors.inputBorder, 
          backgroundColor: colors.input,
          color: colors.text,
        }]}
        placeholder="Password (min 8 chars, uppercase, lowercase, number)"
        placeholderTextColor={colors.placeholder}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!loading}
      />

      <TextInput
        style={[styles.input, { 
          borderColor: colors.inputBorder, 
          backgroundColor: colors.input,
          color: colors.text,
        }]}
        placeholder="Confirm Password"
        placeholderTextColor={colors.placeholder}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        editable={!loading}
      />

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.tint }, loading && styles.buttonDisabled]}
        onPress={handleSignup}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <Text style={[styles.buttonText, { color: colors.background }]}>Sign Up</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push('/auth/login')} disabled={loading}>
        <Text style={[styles.link, { color: colors.tint }]}>Already have an account? Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    borderRadius: 8,
    fontSize: 16,
  },
  button: {
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  link: {
    textAlign: 'center',
    marginTop: 15,
  },
});
