/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

// ✨ PROFESSIONAL COLOR PALETTE - REDESIGNED FOR BEAUTY
const tintColorLight = '#0a7ea4';
const tintColorDark = '#00d4ff';

export const Colors = {
  light: {
    // 🎨 TEXT COLORS - Professional & Clear
    text: '#1a1a1a',                // Deep black for primary text
    textSecondary: '#555555',        // Medium gray for secondary text
    textTertiary: '#888888',         // Light gray for tertiary text
    textMuted: '#aaaaaa',            // Muted text for disabled/inactive
    
    // 🎨 BACKGROUNDS - Clean & Professional
    background: '#f8f9fa',           // Soft off-white background
    backgroundSecondary: '#eeeeee',  // Light gray secondary
    backgroundTertiary: '#e8e8e8',   // Slightly darker gray
    
    // 🎨 CARDS & CONTAINERS - Elevated & Clean
    card: '#ffffff',                 // Pure white for cards
    cardSecondary: '#f5f5f5',        // Slightly tinted card
    
    // 🎨 BORDERS & DIVIDERS
    border: '#e0e0e0',               // Light border
    borderSecondary: '#d0d0d0',      // Darker border
    borderLight: '#f0f0f0',          // Very light border
    
    // 🎨 FORM ELEMENTS
    input: '#ffffff',                // White input fields
    inputBorder: '#cccccc',          // Light input border
    inputBackground: '#f8f9fa',      // Slightly tinted input bg
    placeholder: '#999999',          // Placeholder text
    
    // 🎨 ACCENT & STATUS COLORS
    tint: tintColorLight,            // Primary accent: bright blue
    accent: '#0084d4',               // Secondary accent: deeper blue
    
    // 🎨 ICONS
    icon: '#555555',                 // Medium gray icons
    iconSecondary: '#888888',        // Light gray icons
    iconMuted: '#cccccc',            // Disabled icons
    
    // 🎨 TAB NAVIGATION
    tabIconDefault: '#888888',       // Inactive tab icon
    tabIconSelected: tintColorLight, // Active tab icon
    tabBackground: '#ffffff',        // Tab bar background
    
    // 🎨 STATUS COLORS - Vivid & Clear
    error: '#d32f2f',                // Vivid red
    success: '#388e3c',              // Vivid green
    warning: '#f57c00',              // Vivid orange
    info: '#0a7ea4',                 // Vivid blue
    
    // 🎨 SHADOWS & EFFECTS
    shadow: '#00000008',             // Subtle shadow
    shadowMedium: '#00000012',       // Medium shadow
    shadowStrong: '#00000020',       // Stronger shadow
  },
  dark: {
    // 🎨 TEXT COLORS - Optimized for Dark Mode
    text: '#ffffff',                 // Pure white text
    textSecondary: '#b8b8b8',        // Light gray secondary
    textTertiary: '#888888',         // Medium gray tertiary
    textMuted: '#666666',            // Muted text for disabled
    
    // 🎨 BACKGROUNDS - Dark & Comfortable
    background: '#121212',           // Primary dark background
    backgroundSecondary: '#1e1e1e',  // Slightly lighter dark
    backgroundTertiary: '#2a2a2a',   // Even lighter dark
    
    // 🎨 CARDS & CONTAINERS - Elevated Dark
    card: '#1e1e1e',                 // Dark card background
    cardSecondary: '#252525',        // Slightly lighter card
    
    // 🎨 BORDERS & DIVIDERS - Subtle
    border: '#333333',               // Dark border
    borderSecondary: '#404040',      // Darker border
    borderLight: '#282828',          // Very subtle border
    
    // 🎨 FORM ELEMENTS - Dark Themed
    input: '#252525',                // Dark input field
    inputBorder: '#404040',          // Dark input border
    inputBackground: '#1a1a1a',      // Darker input background
    placeholder: '#666666',          // Placeholder text
    
    // 🎨 ACCENT & STATUS COLORS
    tint: tintColorDark,             // Bright cyan: very visible
    accent: '#00b8ff',               // Bright cyan secondary
    
    // 🎨 ICONS - Bright for Visibility
    icon: '#b8b8b8',                 // Light gray icons
    iconSecondary: '#888888',        // Medium gray icons
    iconMuted: '#555555',            // Disabled icons
    
    // 🎨 TAB NAVIGATION
    tabIconDefault: '#666666',       // Inactive tab icon
    tabIconSelected: tintColorDark,  // Active tab icon (bright)
    tabBackground: '#1e1e1e',        // Tab bar background
    
    // 🎨 STATUS COLORS - Bright & Clear
    error: '#ff6b6b',                // Bright red for dark mode
    success: '#51cf66',              // Bright green for dark mode
    warning: '#ffa94d',              // Bright orange for dark mode
    info: '#00d4ff',                 // Bright cyan for dark mode
    
    // 🎨 SHADOWS & EFFECTS
    shadow: '#00000030',             // Visible shadow in dark
    shadowMedium: '#00000050',       // Medium shadow
    shadowStrong: '#00000080',       // Strong shadow
  },
};


export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
