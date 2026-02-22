import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    const token = await AsyncStorage.getItem('token');
    setIsAuthenticated(!!token);
  };

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        {isAuthenticated && <Stack.Screen name="(tabs)" options={{ headerShown: false }} />}
        {isAuthenticated && <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />}
        {!isAuthenticated && <Stack.Screen name="auth/login" options={{ headerShown: false }} />}
        {!isAuthenticated && <Stack.Screen name="auth/signup" options={{ headerShown: false }} />}
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
