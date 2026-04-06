import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme-color';

export default function FlicksScreen() {
  const colors = useTheme();

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>🎬</Text>
        <ThemedText type="title" style={styles.title}>Flicks</ThemedText>
        <ThemedText style={[styles.subtitle, { color: colors.tint }]}>Coming Soon!</ThemedText>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          Short video content is on its way. Stay tuned for an amazing experience!
        </Text>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 24,
  },
});
