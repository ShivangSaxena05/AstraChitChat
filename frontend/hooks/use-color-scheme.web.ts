import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { useThemeMode } from '@/contexts/ThemeContext';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 * Also respects manual theme selection
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);
  const systemColorScheme = useRNColorScheme();

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  try {
    const { themeMode } = useThemeMode();
    
    if (hasHydrated) {
      if (themeMode === 'light') {
        return 'light';
      } else if (themeMode === 'dark') {
        return 'dark';
      }
      return systemColorScheme;
    }
  } catch (error) {
    // ThemeProvider not available
  }

  return 'light';
}
