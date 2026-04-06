import React, { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/use-theme-color';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary Component
 * Catches errors in child components and displays a user-friendly error screen
 * Prevents app crashes and allows recovery
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Error caught:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}

/**
 * Error Fallback UI
 */
function ErrorFallback({ 
  error, 
  onReset 
}: { 
  error: Error | null; 
  onReset: () => void;
}) {
  const colors = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.contentContainer}>
        <Ionicons 
          name="alert-circle" 
          size={64} 
          color={colors.error}
          style={styles.icon}
        />
        
        <Text style={[styles.title, { color: colors.text }]}>
          Oops! Something went wrong
        </Text>
        
        <Text style={[styles.message, { color: colors.textMuted }]}>
          We're sorry for the inconvenience. The app encountered an unexpected error.
        </Text>

        {__DEV__ && error && (
          <View 
            style={[
              styles.errorDetailsBox, 
              { 
                backgroundColor: colors.error + '20',
                borderColor: colors.error,
              }
            ]}
          >
            <Text style={[styles.errorDetailsTitle, { color: colors.error }]}>
              Error Details (Development):
            </Text>
            <Text style={[styles.errorDetailsText, { color: colors.text }]}>
              {error.message}
            </Text>
          </View>
        )}

        <View style={styles.suggestionsContainer}>
          <Text style={[styles.suggestionsTitle, { color: colors.text }]}>
            Try the following:
          </Text>
          <Text style={[styles.suggestionItem, { color: colors.textMuted }]}>
            • Tap the button below to try again
          </Text>
          <Text style={[styles.suggestionItem, { color: colors.textMuted }]}>
            • Restart the app if the problem persists
          </Text>
          <Text style={[styles.suggestionItem, { color: colors.textMuted }]}>
            • Check your internet connection
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.tint }]}
          onPress={onReset}
          activeOpacity={0.8}
        >
          <Ionicons name="reload" size={20} color="white" />
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  contentContainer: {
    alignItems: 'center',
  },
  icon: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 24,
  },
  errorDetailsBox: {
    width: '100%',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20,
  },
  errorDetailsTitle: {
    fontWeight: '600',
    marginBottom: 8,
  },
  errorDetailsText: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  suggestionsContainer: {
    width: '100%',
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  suggestionsTitle: {
    fontWeight: '600',
    marginBottom: 8,
  },
  suggestionItem: {
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
});
