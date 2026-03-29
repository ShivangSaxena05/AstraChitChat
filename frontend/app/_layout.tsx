import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { SocketProvider } from '@/contexts/SocketContext';
import { CallProvider } from '@/contexts/CallContext';
import { ThemeProvider as CustomThemeProvider } from '@/contexts/ThemeContext';
import CallOverlay from '@/components/CallOverlay';
import { validateToken } from '@/services/tokenManager';
import { useTheme } from '@/hooks/use-theme-color';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Auth State Management - Separate from route logic
interface AuthState {
  isLoading: boolean;
  isSignedIn: boolean;
  userToken: string | null;
}

// Root Layout Content (wrapped by providers)
function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const colors = useTheme();
  const [authState, setAuthState] = useState<AuthState>({
    isLoading: true,
    isSignedIn: false,
    userToken: null,
  });
  const router = useRouter();

  useEffect(() => {
    const bootAsync = async () => {
      try {
        await restoreToken();
      } catch (e) {
        // Restoring token failed
        console.error('[Auth] Token restoration failed:', e);
      } finally {
        // Delay for splash screen visibility
        setTimeout(() => {
          setAuthState((prev) => ({ ...prev, isLoading: false }));
        }, 500);
      }
    };

    bootAsync();
  }, []);

  const restoreToken = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      
      if (!token) {
        setAuthState({
          isLoading: true,
          isSignedIn: false,
          userToken: null,
        });
        return;
      }

      // ✅ FIX 1.1: Validate token with backend
      const isValid = await validateToken(token);
      
      if (isValid) {
        setAuthState({
          isLoading: true,
          isSignedIn: true,
          userToken: token,
        });
      } else {
        // Token is invalid or expired - clear it
        await AsyncStorage.removeItem('token');
        await AsyncStorage.removeItem('userId');
        
        setAuthState({
          isLoading: true,
          isSignedIn: false,
          userToken: null,
        });
      }
    } catch (error) {
      console.error('[Auth] Error validating token:', error);
      // Default to not signed in on error
      setAuthState({
        isLoading: true,
        isSignedIn: false,
        userToken: null,
      });
    }
  };

  // Show splash screen while checking auth status
  if (authState.isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        {authState.isSignedIn ? (
          <>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="chat/detail" />
          </>
        ) : (
          <>
            <Stack.Screen name="auth/login" />
            <Stack.Screen name="auth/signup" />
          </>
        )}
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
      <CallOverlay />
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <CustomThemeProvider>
      <SocketProvider>
        <CallProvider>
          <RootLayoutContent />
        </CallProvider>
      </SocketProvider>
    </CustomThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
