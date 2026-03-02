import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

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
  
  // Map state index to tab name
  const getIndexFromState = () => {
    const routeName = state.routes[state.index]?.name;
    if (routeName === 'chat-list') return 1;
    if (routeName === 'notifications') return 2;
    if (routeName === 'profile') return 3;
    return 0; // Home
  };

  const currentIndex = getIndexFromState();

  const handleTabPress = (tabName: string) => {
    navigation.navigate(tabName);
  };

  const handleCreatePress = () => {
    // Navigate to upload screen
    navigation.navigate('upload');
  };

  return (
    <View style={styles.container}>
      {/* Main Tab Bar */}
      <View style={styles.tabBar}>
        {tabs.map((tab, index) => (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={() => handleTabPress(tab.name)}
          >
            <Ionicons
              name={tab.icon as any}
              size={24}
              color={currentIndex === index ? '#4ADDAE' : '#888'}
            />
            <Text style={[styles.label, currentIndex === index && styles.activeLabel]}>
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
        <View style={styles.fab}>
          <Ionicons name="add" size={32} color="#fff" />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    paddingTop: 10,
    paddingBottom: 30, // Account for safe area
    borderTopWidth: 1,
    borderTopColor: '#333',
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
    color: '#888',
    marginTop: 2,
  },
  activeLabel: {
    color: '#4ADDAE',
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
    backgroundColor: '#4ADDAE',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4ADDAE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 3,
    borderColor: '#000',
  },
});
