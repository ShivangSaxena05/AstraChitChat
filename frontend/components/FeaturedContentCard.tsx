import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function FeaturedContentCard() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Featured Content</Text>
      {/* Placeholder for featured content */}
      <Text style={styles.placeholder}>Featured posts will appear here</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#000',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  placeholder: {
    color: '#888',
    fontSize: 14,
  },
});
