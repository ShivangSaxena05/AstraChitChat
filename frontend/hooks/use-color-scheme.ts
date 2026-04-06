import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * Hook to get the current color scheme, respecting manual theme selection
 * Note: This hook only returns the system color scheme to avoid circular dependencies.
 * Theme override is handled directly in ThemeContext.
 */
export function useColorScheme() {
  const systemScheme = useRNColorScheme();
  return systemScheme;
}
