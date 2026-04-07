import React, { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { SocketProvider, useSocket } from '@/contexts/SocketContext';
import { CallProvider } from '@/contexts/CallContext';
import { ThemeProvider as CustomThemeProvider } from '@/contexts/ThemeContext';
import { NetworkProvider } from '@/contexts/NetworkContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import CallOverlay from '@/components/CallOverlay';
import NetworkMonitoringWrapper from '@/components/NetworkMonitoringWrapper';
import OfflineStatusIndicator from '@/components/OfflineStatusIndicator';
import { useTheme } from '@/hooks/use-theme-color';

export const unstable_settings = {
  anchor: '(tabs)',
};

/**
 * PRODUCTION ERROR BOUNDARY
 * Catches all unhandled errors and prevents app crashes
 * Shows user-friendly error screen with recovery options
 */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[CRITICAL] Uncaught error:', error);
    console.error('[CRITICAL] Error info:', errorInfo);
    
    // Log to analytics/monitoring service in production
    if (typeof __DEV__ === 'boolean' && !__DEV__) {
      // Send to error tracking service (e.g., Sentry)
    }
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallbackScreen error={this.state.error} onReset={() => this.setState({ hasError: false, error: null })} />;
    }
    return this.props.children;
  }
}

/**
 * Error Fallback Screen - User-friendly error display
 */
function ErrorFallbackScreen({ error, onReset }: { error: Error | null; onReset: () => void }) {
  const colors = useTheme();

  return (
    <View style={[styles.errorContainer, { backgroundColor: colors.background }]}>
      <View style={styles.errorContent}>
        <Ionicons name="alert-circle" size={56} color="#FF6B6B" style={styles.errorIcon} />
        
        <Text style={[styles.errorTitle, { color: colors.text }]}>
          Oops! Something went wrong
        </Text>
        
        <Text style={[styles.errorMessage, { color: colors.textMuted }]}>
          We've encountered an unexpected error. Please try again.
        </Text>

        {__DEV__ && error && (
          <View style={[styles.devErrorBox, { backgroundColor: '#FF6B6B20', borderColor: '#FF6B6B' }]}>
            <Text style={[styles.devErrorTitle, { color: '#FF6B6B' }]}>Debug Info:</Text>
            <Text style={[styles.devErrorText, { color: colors.text }]}>
              {error.message}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.errorButton, { backgroundColor: colors.tint }]}
          onPress={onReset}
          activeOpacity={0.8}
        >
          <Ionicons name="reload" size={18} color="white" />
          <Text style={styles.errorButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * RootLayoutContent
 * 
 * Reads auth state from AuthContext (single source of truth).
 * No local auth state — AuthContext.tsx handles session restore on startup.
 */
function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const colors = useTheme();
  const { isLoading, isSignedIn } = useAuth();
  const router = useRouter();

  // ✅ FIX: Force navigation to login if not signed in
  // This ensures that even if screens were previously rendered, we navigate to login
  // Must be before the early return to follow React Rules of Hooks
  useEffect(() => {
    if (!isSignedIn && !isLoading) {
      console.log('[RootLayout] isSignedIn changed to false — navigating to login');
      router.replace('/auth/login');
    }
  }, [isSignedIn, isLoading, router]);

  // Show splash while auth check runs (happens inside AuthContext on mount)
  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <NetworkMonitoringWrapper>
        <View style={styles.appContainer}>
          <Stack screenOptions={{ headerShown: false }} initialRouteName={isSignedIn ? '(tabs)' : 'auth/login'}>
            {isSignedIn ? (
              <>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="chat/detail" />
                <Stack.Screen name="chat/info" />
                <Stack.Screen name="chat/add" />
                <Stack.Screen name="chat/index" />
                <Stack.Screen name="profile/[userId]" />
                <Stack.Screen name="profile/edit" />
                <Stack.Screen name="profile/settings" />
                <Stack.Screen name="profile/admin" />
                <Stack.Screen name="profile/follow-requests" />
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
          <OfflineStatusIndicator />
          <StatusBar style="auto" />
        </View>
      </NetworkMonitoringWrapper>
    </ThemeProvider>
  );
}

// Inner component that uses useAuth — only rendered AFTER AuthProvider is set up
function RootLayoutWithProviders() {
  const { handleAuthError } = useAuth();

  return (
    <SocketProvider onAuthError={handleAuthError}>
      <CallProvider>
        <RootLayoutContent />
      </CallProvider>
    </SocketProvider>
  );
}

export default function RootLayout() {
  return (
    <RootErrorBoundary>
      <CustomThemeProvider>
        <NetworkProvider>
          <AuthProvider>
            <RootLayoutWithProviders />
          </AuthProvider>
        </NetworkProvider>
      </CustomThemeProvider>
    </RootErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  appContainer: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorContent: {
    alignItems: 'center',
    maxWidth: 400,
  },
  errorIcon: {
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },
  devErrorBox: {
    width: '100%',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20,
  },
  devErrorTitle: {
    fontWeight: '600',
    marginBottom: 8,
  },
  devErrorText: {
    fontSize: 12,
  },
  errorButton: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    gap: 8,
  },
  errorButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
});
