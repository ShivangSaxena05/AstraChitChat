import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  isDarkMode: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [isHydrated, setIsHydrated] = useState(false);

  // Load theme preference from storage on mount
  useEffect(() => {
    const loadThemeMode = async () => {
      try {
        const savedMode = await AsyncStorage.getItem('themeMode');
        if (savedMode && (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system')) {
          setThemeModeState(savedMode);
        }
      } catch (error) {
        console.error('Error loading theme mode:', error);
      } finally {
        setIsHydrated(true);
      }
    };

    loadThemeMode();
  }, []);

  // Update theme mode and save to storage
  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    try {
      setThemeModeState(mode);
      await AsyncStorage.setItem('themeMode', mode);
    } catch (error) {
      console.error('Error saving theme mode:', error);
    }
  }, []);

  // Determine if dark mode is active
  // During hydration, use system default; after hydration, use saved preference
  const isDarkMode =
    !isHydrated
      ? systemColorScheme === 'dark'          // system default while loading
      : themeMode === 'dark' || (themeMode === 'system' && systemColorScheme === 'dark');

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode, isDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useThemeMode = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within ThemeProvider');
  }
  return context;
};
