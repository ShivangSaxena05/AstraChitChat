import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/use-theme-color';

export default function FeaturedContentCard() {
  const colors = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <Text style={[styles.title, { color: colors.text }]}>Featured Content</Text>
      {/* Placeholder for featured content */}
      <Text style={[styles.placeholder, { color: colors.textTertiary }]}>Featured posts will appear here</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  placeholder: {
    fontSize: 14,
  },
});
