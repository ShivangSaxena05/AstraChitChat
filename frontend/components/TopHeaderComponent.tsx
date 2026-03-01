import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface TopHeaderComponentProps {
  showPlusIcon?: boolean;
  onPlusPress?: () => void;
}

export default function TopHeaderComponent({ showPlusIcon = false, onPlusPress }: TopHeaderComponentProps) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        {/* Title removed per user request */}
        <View /> {/* Spacer to keep plus button on right if needed, or flex container handles it */}
        {showPlusIcon && (
          <TouchableOpacity style={styles.plusButton} onPress={onPlusPress}>
            <Ionicons name="add" size={24} color="white" />
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#000',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 10,
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
