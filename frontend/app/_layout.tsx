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
import CallOverlay from '@/components/CallOverlay';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isLoading, setIsLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState<'(tabs)' | 'auth/login'>('(tabs)');
  const router = useRouter();

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      // Check if user has a valid token stored
      const token = await AsyncStorage.getItem('token');
      
      if (token) {
        // User is logged in
        setInitialRoute('(tabs)');
      } else {
        // User is not logged in
        setInitialRoute('auth/login');
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setInitialRoute('auth/login');
    } finally {
      // Add a small delay to show splash screen nicely
      setTimeout(() => {
        setIsLoading(false);
      }, 500);
    }
  };

  // Show splash screen while checking auth status
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SocketProvider>
        <CallProvider>
          <Stack screenOptions={{ headerShown: false }}>
            {initialRoute === '(tabs)' ? (
              <Stack.Screen 
                name="(tabs)"
              />
            ) : (
              <Stack.Screen 
                name="auth/login"
              />
            )}
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            <Stack.Screen name="auth/login" />
            <Stack.Screen name="auth/signup" />
            <Stack.Screen name="chat/detail" />
          </Stack>
          <CallOverlay />
          <StatusBar style="auto" />
        </CallProvider>
      </SocketProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
