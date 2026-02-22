import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TopHeaderComponentProps {
  showPlusIcon?: boolean;
  onPlusPress?: () => void;
}

export default function TopHeaderComponent({ showPlusIcon = false, onPlusPress }: TopHeaderComponentProps) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>ChitChat</Text>
      {showPlusIcon && (
        <TouchableOpacity style={styles.plusButton} onPress={onPlusPress}>
          <Ionicons name="add" size={24} color="white" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#000',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  plusButton: {
    padding: 8,
  },
});
