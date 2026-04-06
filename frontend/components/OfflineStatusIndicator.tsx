import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNetworkStatus } from '@/contexts/NetworkContext';
import { useQueueSize } from '@/hooks/useOfflineData';
import { useTheme } from '@/hooks/use-theme-color';
import offlineAPI from '@/services/offlineAPI';

interface OfflineStatusIndicatorProps {
  onSyncPress?: () => void;
}

export const OfflineStatusIndicator: React.FC<OfflineStatusIndicatorProps> = ({
  onSyncPress,
}) => {
  const { isOnline, isOffline } = useNetworkStatus();
  const { queueSize, hasQueue } = useQueueSize();
  const [isSyncing, setIsSyncing] = useState(false);
  const colors = useTheme();
  const slideAnim = new Animated.Value(isOnline ? 0 : -100);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOnline && !hasQueue ? 0 : -100,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isOnline, hasQueue]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await offlineAPI.syncQueue();
      console.log('Sync result:', result);
    } finally {
      setIsSyncing(false);
      onSyncPress?.();
    }
  };

  if (isOnline && !hasQueue) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          backgroundColor: isOffline ? '#FF6B6B' : '#FFA500',
        },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.info}>
          {isOffline ? (
            <>
              <Ionicons name="cloud-offline" size={18} color="#FFF" />
              <Text style={styles.text}>You're offline</Text>
            </>
          ) : (
            <>
              <Ionicons name="cloud-upload" size={18} color="#FFF" />
              <Text style={styles.text}>{queueSize} pending</Text>
            </>
          )}
        </View>

        {hasQueue && isOnline && (
          <TouchableOpacity
            onPress={handleSync}
            disabled={isSyncing}
            style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
          >
            {isSyncing ? (
              <Ionicons name="hourglass" size={18} color="#FFF" />
            ) : (
              <Ionicons name="cloud-upload" size={18} color="#FFF" />
            )}
            <Text style={styles.syncButtonText}>{isSyncing ? 'Syncing...' : 'Sync'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FF6B6B',
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 6,
  },
  syncButtonDisabled: {
    opacity: 0.6,
  },
  syncButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default OfflineStatusIndicator;
