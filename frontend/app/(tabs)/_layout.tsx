import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      router.replace('/auth/login');
    }
  };

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="user-profile" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="followers-list" options={{ headerShown: true, presentation: 'modal', title: 'Followers' }} />
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
