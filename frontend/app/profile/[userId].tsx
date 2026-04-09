import React, { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import OtherProfileScreen from '../(tabs)/other-profile';
import ProfileScreen from '../(tabs)/profile';
import secureTokenManager from '@/services/secureTokenManager';
import { ActivityIndicator, View } from 'react-native';

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCurrentUserId = async () => {
      try {
        const id = await secureTokenManager.getUserId();
        setCurrentUserId(id);
      } catch (error) {
        console.error('Error fetching current user ID:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCurrentUserId();
  }, []);

  if (!userId) {
    return null;
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // If the userId matches the current user's ID, show their own profile with all edit features
  if (userId === currentUserId) {
    return <ProfileScreen />;
  }

  // Otherwise, show the other user's profile
  return <OtherProfileScreen userId={userId} />;
}
