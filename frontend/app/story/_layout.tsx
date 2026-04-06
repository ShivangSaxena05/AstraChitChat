import React from 'react';
import { Stack } from 'expo-router';

export default function StoryLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false
      }}
    >
      <Stack.Screen
        name="create"
        options={{
          presentation: 'fullScreenModal'
        }}
      />
    </Stack>
  );
}
