import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { post } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import { handleErrorResponse } from '@/services/errorHandler';
import { useTheme } from '@/hooks/use-theme-color';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [userId, setUserId] = useState('');
  const [mfaTimer, setMfaTimer] = useState(300); // 5 minutes
  const router = useRouter();
  const { connect } = useSocket();
  const colors = useTheme();

  // ✅ FIX 1.3: 2FA Timeout protection
  useEffect(() => {
    if (!requires2FA) return;

    const interval = setInterval(() => {
      setMfaTimer((prev) => {
        if (prev <= 1) {
          // Timeout - reset 2FA
          setRequires2FA(false);
          setMfaToken('');
          Alert.alert('2FA Timeout', '2FA code expired. Please login again.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [requires2FA]);

  const formatMFATimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // ✅ FIX 1.2: Improved account handling with validation
  const completeLogin = async (data: any) => {
    try {
      if (!data.token || !data._id) {
        throw new Error('Invalid response from server: missing token or user ID');
      }

      // Store token and userId
      await AsyncStorage.setItem('token', data.token);
      await AsyncStorage.setItem('userId', data._id);

      // Multi-account support with validation
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

      // Validate account structure
      const accountExists = savedAccounts.some((acc: any) => 
        acc && acc.userId && acc.userId === data._id
      );

      const accountData = {
        userId: data._id,
        token: data.token,
        username: data.username?.trim() || data.name?.trim() || email.split('@')[0],
        profilePicture: data.profilePicture || 'https://via.placeholder.com/40',
      };

      if (!accountExists) {
        savedAccounts.push(accountData);
      } else {
        // Update existing account
        savedAccounts = savedAccounts.map((acc) =>
          acc.userId === data._id ? accountData : acc
        );
      }

      await AsyncStorage.setItem('saved_accounts', JSON.stringify(savedAccounts));

      // ✅ FIX 1.4: Wait for socket connection before navigation
      try {
        await connect();
        // Give socket time to establish connection
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.warn('Socket connection failed, proceeding anyway:', error);
        // Continue even if socket fails
      }

      // Navigate only after all operations complete
      router.replace('/(tabs)' as any);
    } catch (error: any) {
      Alert.alert('Login Error', error.message || 'Failed to complete login');
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (requires2FA) {
      if (!mfaToken.trim()) {
        Alert.alert('Error', 'Please enter your 2FA code');
        return;
      }
      
      if (mfaToken.length !== 6) {
        Alert.alert('Error', 'Please enter a valid 6-digit code');
        return;
      }

      setLoading(true);
      try {
        const data = await post('/auth/2fa/login', { userId, token: mfaToken });
        await completeLogin(data);
      } catch (error: any) {
        const errorMsg = handleErrorResponse(error);
        Alert.alert('2FA Error', errorMsg);
        setLoading(false);
      }
      return;
    }

    // Validate input
    if (!email.trim() || !password.trim()) {
      Alert.alert('Validation Error', 'Please fill in all fields');
      return;
    }

    if (!email.includes('@') || !email.includes('.')) {
      Alert.alert('Validation Error', 'Please enter a valid email address');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Validation Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      const data = await post('/auth/login', { email: email.toLowerCase(), password });

      if (data.requires2FA) {
        setRequires2FA(true);
        setUserId(data.userId);
        setMfaTimer(300);
        setLoading(false);
        return;
      }

      await completeLogin(data);
    } catch (error: any) {
      const errorMsg = handleErrorResponse(error);
      Alert.alert('Login Failed', errorMsg);
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{requires2FA ? 'Two-Factor Authentication' : 'Login'}</Text>

      {!requires2FA ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="6-digit Authenticator Code"
            value={mfaToken}
            onChangeText={setMfaToken}
            keyboardType="number-pad"
            maxLength={6}
            editable={!loading}
          />
          <Text style={styles.timer}>Code expires in: {formatMFATimer(mfaTimer)}</Text>
        </>
      )}

      <TouchableOpacity 
        style={[styles.button, loading && styles.buttonDisabled]} 
        onPress={handleLogin} 
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.card} />
        ) : (
          <Text style={styles.buttonText}>
            {requires2FA ? 'Verify Code' : 'Login'}
          </Text>
        )}
      </TouchableOpacity>

      {!requires2FA && (
        <TouchableOpacity onPress={() => router.push('/auth/signup')} disabled={loading}>
          <Text style={styles.link}>Don't have an account? Sign up</Text>
        </TouchableOpacity>
      )}

      {requires2FA && (
        <TouchableOpacity 
          onPress={() => { setRequires2FA(false); setMfaToken(''); }} 
          disabled={loading}
        >
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
    fontSize: 14,
  },
  timer: {
    textAlign: 'center',
    fontSize: 14,
    marginBottom: 10,
  },
});

