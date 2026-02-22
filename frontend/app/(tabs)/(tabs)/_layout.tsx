import { Tabs } from 'expo-router';
import React from 'react';

import BottomTabBarComponent from '@/components/BottomTabBarComponent';
import HamburgerMenu from '@/components/HamburgerMenu';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}
      tabBar={(props) => <BottomTabBarComponent {...props} />}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="magnifyingglass" color={color} />,
        }}
      />
      <Tabs.Screen
        name="upload"
        options={{
          title: '',
          tabBarIcon: ({ color }) => <IconSymbol size={32} name="plus.circle.fill" color="#007AFF" />,
        }}
      />
      <Tabs.Screen
        name="flicks"
        options={{
          title: 'Flicks',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="video.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.fill" color={color} />,
          headerShown: true,
          headerRight: () => <HamburgerMenu />,
        }}
      />
    </Tabs>
  );
}
