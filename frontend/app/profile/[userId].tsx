import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import OtherProfileScreen from '../(tabs)/(tabs)/other-profile';

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();

  if (!userId) {
    return null;
  }

  return <OtherProfileScreen userId={userId} />;
}
