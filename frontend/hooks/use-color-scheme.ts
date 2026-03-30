import { useColorScheme as useRNColorScheme } from 'react-native';
import { useThemeMode } from '@/contexts/ThemeContext';

/**
 * Hook to get the current color scheme, respecting manual theme selection
 */
export function useColorScheme() {
  const systemScheme = useRNColorScheme();
  
  try {
    const { themeMode } = useThemeMode();
    
    if (themeMode === 'light') {
      return 'light';
    } else if (themeMode === 'dark') {
      return 'dark';
    }
    // themeMode === 'system'
    return systemScheme;
  } catch (error) {
    // ThemeProvider not available, use system scheme
    return systemScheme;
  }
}
