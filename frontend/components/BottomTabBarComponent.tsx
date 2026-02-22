import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const tabs = [
  { name: 'index', label: 'Home', icon: 'home-outline' },
  { name: 'explore', label: 'Explore', icon: 'search-outline' },
  { name: 'upload', label: 'Upload', icon: 'add-circle-outline' },
  { name: 'flicks', label: 'Flicks', icon: 'videocam-outline' },
  { name: 'profile', label: 'Profile', icon: 'person-outline' },
];

interface BottomTabBarComponentProps {
  navigation: any;
  state: any;
}

export default function BottomTabBarComponent({ navigation, state }: BottomTabBarComponentProps) {
  const handleTabPress = (tabName: string) => {
    navigation.navigate(tabName);
  };

  return (
    <View style={styles.container}>
      {tabs.map((tab, index) => (
        <TouchableOpacity
          key={tab.name}
          style={styles.tab}
          onPress={() => handleTabPress(tab.name)}
        >
          <Ionicons
            name={tab.icon as any}
            size={24}
            color={state.index === index ? '#007AFF' : '#888'}
          />
          <Text style={[styles.label, state.index === index && styles.activeLabel]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#000',
    paddingVertical: 10,
    paddingBottom: 30, // Account for safe area
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  activeLabel: {
    color: '#007AFF',
  },
});
