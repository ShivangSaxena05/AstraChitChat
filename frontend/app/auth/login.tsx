import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { post } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { handleErrorResponse } from '@/services/errorHandler';
import { useTheme } from '@/hooks/use-theme-color';
import secureTokenManager from '@/services/secureTokenManager';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [userId, setUserId] = useState('');
  const [mfaTimer, setMfaTimer] = useState(300); // 5 minutes
  const { signIn } = useAuth();
  const router = useRouter();
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

  // ✅ FIX 1.2: Improved account handling with validation and secure token storage
  const completeLogin = async (data: any) => {
    try {
      console.log('[Login] 🔐 Completing login...');
      
      // Backend returns accessToken, frontend also accepts token
      const token = data.token || data.accessToken;
      
      console.log('[Login] Received data:', {
        hasToken: !!token,
        tokenLength: token?.length,
        hasId: !!data._id,
        userId: data._id,
      });

      if (!token || !data._id) {
        throw new Error('Invalid response from server: missing token or user ID');
      }

      console.log('[Login] 💾 Storing token in secure storage...');
      // ✅ SECURE: Store token in encrypted storage (Keychain/Keystore)
      await secureTokenManager.setToken(token);
      console.log('[Login] ✅ Token stored successfully');

      // ✅ SECURE: Store refresh token if provided
      if (data.refreshToken) {
        console.log('[Login] 💾 Storing refresh token...');
        await secureTokenManager.setRefreshToken(data.refreshToken);
        console.log('[Login] ✅ Refresh token stored');
      }

      // ✅ SECURE: Store user ID
      await secureTokenManager.setUserId(data._id);
      console.log('[Login] ✅ User ID stored');

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

      // ⚠️ SECURITY: DO NOT STORE TOKEN IN ACCOUNTS
      // Tokens are stored in secure storage only
      const accountData = {
        userId: data._id,
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

      // After storing credentials, trigger signIn() which flips isSignedIn
      // in AuthContext — _layout.tsx re-renders and switches to authenticated routes.
      // ✅ Socket connection happens automatically in SocketProvider after auth
      console.log('[Login] ✅ Calling signIn() to switch to authenticated routes...');
      await signIn();
    } catch (error: any) {
      console.error('[Login] ❌ Login error:', error);
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
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              editable={!loading}
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowPassword(!showPassword)}
              disabled={loading}
            >
              <Ionicons
                name={showPassword ? 'eye' : 'eye-off'}
                size={24}
                color={colors.text}
              />
            </TouchableOpacity>
          </View>
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
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 10,
    paddingRight: 12,
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
  },
  eyeIcon: {
    padding: 8,
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