import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/use-theme-color';

const { width: screenWidth } = Dimensions.get('window');

const tabs = [
  { name: 'index', label: 'Home', icon: 'home-outline' },
  { name: 'chat-list', label: 'Chat', icon: 'chatbubble-outline' },
  // Create button is handled separately as FAB
  { name: 'notifications', label: 'Notification', icon: 'notifications-outline' },
  { name: 'profile', label: 'Profile', icon: 'person-outline' },
];

interface BottomTabBarComponentProps {
  navigation: any;
  state: any;
}

export default function BottomTabBarComponent({ navigation, state }: BottomTabBarComponentProps) {
  const router = useRouter();
  const colors = useTheme();
  
  // HIGH FIX: Sync current index with state more reliably
  const getCurrentIndex = () => {
    if (!state || !state.routes || state.index === undefined) {
      return 0;
    }

    const routeName = state.routes[state.index]?.name;
    
    // Map route names to tab indices more explicitly
    if (routeName === 'chat-list') return 1;
    if (routeName === 'notifications') return 2;
    if (routeName === 'profile') return 3;
    return 0; // Home/index is default
  };

  const currentIndex = getCurrentIndex();

  const handleTabPress = (tabName: string) => {
    navigation.navigate(tabName);
  };

  const handleCreatePress = () => {
    // Navigate to upload screen
    router.push('/(tabs)/upload');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      {/* Main Tab Bar */}
      <View style={[styles.tabBar, { borderTopColor: colors.border }]}>
        {tabs.map((tab, index) => (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={() => handleTabPress(tab.name)}
          >
            <Ionicons
              name={tab.icon as any}
              size={24}
              color={currentIndex === index ? colors.tint : colors.icon}
            />
            <Text style={[styles.label, currentIndex === index && { color: colors.tint }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Floating Create Button */}
      <TouchableOpacity
        style={styles.fabContainer}
        onPress={handleCreatePress}
        activeOpacity={0.8}
      >
        <View style={[styles.fab, { backgroundColor: colors.tint, borderColor: colors.card }]}>
          <Ionicons name="add" size={32} color={colors.background} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 10,
    paddingBottom: 30, // Account for safe area
    borderTopWidth: 1,
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
  },
  label: {
    fontSize: 12,
    marginTop: 2,
  },
  activeLabel: {
    // Color will be applied via inline style
  },
  fabContainer: {
    position: 'absolute',
    top: -25, // Slightly raised above the tab bar
    alignSelf: 'center',
    zIndex: 10,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'rgba(0,0,0,0.3)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 3,
  },
});
