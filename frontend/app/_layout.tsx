import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = await AsyncStorage.getItem('token');

      if (!token) {
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }

      // Validate token by checking if it exists and is not expired
      // Decode the JWT to check expiration
      const tokenParts = token.split('.');
      if (tokenParts.length === 3) {
        // atob() is not available in React Native — use Buffer instead
        const base64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
        const currentTime = Date.now() / 1000;

        if (payload.exp && payload.exp < currentTime) {
          // Token is expired, remove it and set as not authenticated
          await AsyncStorage.removeItem('token');
          await AsyncStorage.removeItem('userId');
          setIsAuthenticated(false);
        } else {
          // Token is valid
          setIsAuthenticated(true);
        }
      } else {
        // Invalid token format
        await AsyncStorage.removeItem('token');
        await AsyncStorage.removeItem('userId');
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      // On error, default to not authenticated
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading screen while checking auth status
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

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

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
