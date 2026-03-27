import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, AppState, AppStateStatus } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const appState = useRef(AppState.currentState);

  // Check auth status on component mount
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, []);

  // Also check auth status when screen is focused (when returning from other screens)
  useFocusEffect(
    React.useCallback(() => {
      verifyAuthStatus();
    }, [])
  );

  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    // If the app is coming to foreground from background/inactive state
    if (
      appState.current.match(/inactive|background/) &&
      nextAppState === 'active'
    ) {
      // Verify auth status when app resumes
      await verifyAuthStatus();
    }

    appState.current = nextAppState;
  };

  const verifyAuthStatus = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        // If token is missing, redirect to login
        router.replace('/auth/login');
      }
    } catch (error) {
      console.error('Error verifying auth status:', error);
      router.replace('/auth/login');
    }
  };

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="profile/[userId]" options={{ headerShown: false }} />
      <Stack.Screen name="user-profile" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="chat" options={{ headerShown: false, presentation: 'modal' }} />
    </Stack>
  );

}

const styles = StyleSheet.create({
  uploadButton: {
    top: -10,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    borderWidth: 3,
    borderColor: '#007AFF',
  },
});
