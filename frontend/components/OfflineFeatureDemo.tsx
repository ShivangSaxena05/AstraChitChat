import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNetworkStatus } from '@/contexts/NetworkContext';
import { useOfflineData, useQueueSize, useOfflineMutation } from '@/hooks/useOfflineData';
import { useTheme } from '@/hooks/use-theme-color';
import offlineAPI from '@/services/offlineAPI';
import offlineStorage, { CACHE_KEYS } from '@/services/offlineStorage';
interface NetworkStatus {
    type: string | null;
    isInternetReachable: boolean | null;
}

interface CacheData {
    data: any;
    loading: boolean;
    error: Error | null;
    isFromCache: boolean;
    refresh: () => Promise<void>;
    isSyncing: boolean;
}

interface MutationOptions {
    cacheKeyToInvalidate: string;
    onSuccess: () => void;
    onError: (error: any) => void;
}

interface MutationResult {
    execute: (data: any) => Promise<void>;
    loading: boolean;
    success: boolean;
    isQueued: boolean;
}

interface QueueStatus {
    queueSize: number;
    hasQueue: boolean;
}

interface TestData {
    message: string;
    timestamp: number;
}

interface SyncResult {
    successful: number;
    failed: number;
}

interface ThemeColors {
    background: string;
    text: string;
    tint: string;
    border: string;
}
/**
 * OfflineFeatureDemo - Demonstration of all offline-first features
 * 
 * This component showcases:
 * - Network status monitoring
 * - Data fetching with cache
 * - Mutation with queue
 * - Queue management
 * - Manual sync
 */
export const OfflineFeatureDemo: React.FC = () => {
  const { isOnline, isOffline, networkStatus, checkConnection } = useNetworkStatus();
  const colors = useTheme();
  const { queueSize, hasQueue } = useQueueSize();
  const [testData, setTestData] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  // Example 1: Fetch data with caching
  const {
    data: cachedData,
    loading: dataLoading,
    error: dataError,
    isFromCache: dataFromCache,
    refresh: refreshData,
    isSyncing,
  } = useOfflineData(
    async () => {
      // Simulate API call
      const response = await offlineAPI.get('/example-data', CACHE_KEYS.POSTS);
      return response;
    },
    [],
    {
      cacheKey: 'demo_data',
      cacheTTL: 5 * 60 * 1000, // 5 minutes
    }
  );

  // Example 2: Mutation with queue
  const { execute: sendDemoData, loading: mutationLoading, success, isQueued } =
    useOfflineMutation(
      async (data: any) => {
        return offlineAPI.post('/example-data', data);
      },
      {
        cacheKeyToInvalidate: CACHE_KEYS.POSTS,
        onSuccess: () => {
          Alert.alert('Success', isQueued ? 'Data queued' : 'Data sent!');
          setLastUpdate(new Date().toLocaleTimeString());
        },
        onError: (error: any) => {
          Alert.alert('Error', error.message);
        },
      }
    );

  const handleSendData = async () => {
    const demoData = {
      message: `Demo at ${new Date().toLocaleTimeString()}`,
      timestamp: Date.now(),
    };
    await sendDemoData(demoData);
    setTestData(demoData);
  };

  const handleManualSync = async () => {
    try {
      const result = await offlineAPI.syncQueue();
      Alert.alert('Sync Complete', `${result.successful} synced, ${result.failed} failed`);
    } catch (error) {
      Alert.alert('Sync Failed', (error as any).message);
    }
  };

  const handleClearQueue = async () => {
    await offlineAPI.clearQueue();
    Alert.alert('Queue cleared');
  };

  const handleClearCache = async () => {
    await offlineAPI.clearCache();
    Alert.alert('Cache cleared');
  };

  const handleCheckConnection = async () => {
    const isReachable = await checkConnection();
    Alert.alert('Connection', isReachable ? 'Online!' : 'Offline');
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.contentContainer}
    >
      <Text style={[styles.title, { color: colors.text }]}>Offline-First Demo</Text>

      {/* Network Status Section */}
      <Section title="Network Status" color={colors}>
        <StatusRow
          label="Status"
          value={isOnline ? '🟢 Online' : '🔴 Offline'}
          color={colors}
        />
        <StatusRow
          label="Connected"
          value={networkStatus.isConnected ? '✅ Yes' : '❌ No'}
          color={colors}
        />
        <StatusRow
          label="Internet Reachable"
          value={
            networkStatus.isInternetReachable === true
              ? '✅ Yes'
              : networkStatus.isInternetReachable === false
              ? '❌ No'
              : '❓ Unknown'
          }
          color={colors}
        />
        <Button
          title="Check Connection"
          onPress={handleCheckConnection}
          color={colors.tint}
        />
      </Section>

      {/* Queue Status Section */}
      <Section title="Queue Status" color={colors}>
        <StatusRow
          label="Pending Requests"
          value={queueSize.toString()}
          color={colors}
        />
        <StatusRow
          label="Has Queue"
          value={hasQueue ? '⚠️ Yes' : '✅ No'}
          color={colors}
        />
        <Button
          title={`Manual Sync (${queueSize})`}
          onPress={handleManualSync}
          disabled={queueSize === 0}
          color={colors.tint}
        />
        <Button
          title="Clear Queue"
          onPress={handleClearQueue}
          disabled={queueSize === 0}
          color="#FF6B6B"
        />
      </Section>

      {/* Cache Status Section */}
      <Section title="Cache Status" color={colors}>
        <StatusRow
          label="Data Loading"
          value={dataLoading ? '⏳ Loading' : '✅ Ready'}
          color={colors}
        />
        <StatusRow
          label="From Cache"
          value={dataFromCache ? '📋 Yes' : '🌐 Network'}
          color={colors}
        />
        {dataFromCache && (
          <Text style={[styles.infoText, { color: colors.tint }]}>
            📋 This data is from cache and may be outdated
          </Text>
        )}
        {dataError && (
          <Text style={[styles.errorText, { color: '#FF6B6B' }]}>
            ❌ Error: {(dataError as any).message}
          </Text>
        )}
        <Button
          title={dataLoading ? 'Refreshing...' : 'Refresh Data'}
          onPress={refreshData}
          disabled={dataLoading}
          color={colors.tint}
        />
        <Button
          title="Clear Cache"
          onPress={handleClearCache}
          color="#FF6B6B"
        />
      </Section>

      {/* Mutation Demo Section */}
      <Section title="Mutation Demo" color={colors}>
        <StatusRow
          label="Last Update"
          value={lastUpdate || 'Never'}
          color={colors}
        />
        <StatusRow
          label="Status"
          value={
            mutationLoading
              ? '⏳ Sending...'
              : isQueued
              ? '⏳ Queued'
              : success
              ? '✅ Sent'
              : '⚪ Ready'
          }
          color={colors}
        />
        {isQueued && (
          <Text style={[styles.infoText, { color: '#FFA500' }]}>
            ⏳ Request is queued and will be sent when online
          </Text>
        )}
        {success && !isQueued && (
          <Text style={[styles.infoText, { color: '#51CF66' }]}>
            ✅ Request sent successfully!
          </Text>
        )}
        <Button
          title={mutationLoading ? 'Sending...' : 'Send Data'}
          onPress={handleSendData}
          disabled={mutationLoading}
          color={colors.tint}
        />
      </Section>

      {/* Test Scenario Section */}
      <Section title="Test Scenarios" color={colors}>
        <Text style={[styles.scenarioText, { color: colors.text }]}>
          ✅ Go offline and try:
        </Text>
        <Text style={[styles.bulletPoint, { color: colors.text }]}>
          • Refresh data → See cached data
        </Text>
        <Text style={[styles.bulletPoint, { color: colors.text }]}>
          • Send data → See queued status
        </Text>
        <Text style={[styles.bulletPoint, { color: colors.text }]}>
          • Check queue size → Should increase
        </Text>
        <Text style={[styles.bulletPoint, { color: colors.text }]}>
          🟢 Come back online and:
        </Text>
        <Text style={[styles.bulletPoint, { color: colors.text }]}>
          • Manual sync → Queue should clear
        </Text>
        <Text style={[styles.bulletPoint, { color: colors.text }]}>
          • Auto-sync → Should happen automatically
        </Text>
      </Section>

      {/* Data Display Section */}
      {testData && (
        <Section title="Last Sent Data" color={colors}>
          <Text style={[styles.jsonText, { color: colors.text }]}>
            {JSON.stringify(testData, null, 2)}
          </Text>
        </Section>
      )}

      {/* Cache Data Display Section */}
      {cachedData && (
        <Section title="Cached Data" color={colors}>
          <Text style={[styles.jsonText, { color: colors.text }]}>
            {JSON.stringify(cachedData, null, 2)}
          </Text>
        </Section>
      )}
    </ScrollView>
  );
};

// Helper Components

const Section: React.FC<{
  title: string;
  color: any;
  children: React.ReactNode;
}> = ({ title, color, children }) => (
  <View style={[styles.section, { borderBottomColor: color.border }]}>
    <Text style={[styles.sectionTitle, { color: color.text }]}>{title}</Text>
    {children}
  </View>
);

const StatusRow: React.FC<{
  label: string;
  value: string;
  color: any;
}> = ({ label, value, color }) => (
  <View style={styles.statusRow}>
    <Text style={[styles.statusLabel, { color: color.text }]}>{label}</Text>
    <Text style={[styles.statusValue, { color: color.tint }]}>{value}</Text>
  </View>
);

const Button: React.FC<{
  title: string;
  onPress: () => void;
  disabled?: boolean;
  color: string;
}> = ({ title, onPress, disabled, color }) => (
  <TouchableOpacity
    style={[
      styles.button,
      { backgroundColor: disabled ? '#CCCCCC' : color },
    ]}
    onPress={onPress}
    disabled={disabled}
  >
    <Text style={styles.buttonText}>{title}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    padding: 16,
    textAlign: 'center',
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  infoText: {
    fontSize: 13,
    marginTop: 8,
    paddingHorizontal: 8,
    fontStyle: 'italic',
  },
  errorText: {
    fontSize: 13,
    marginTop: 8,
    paddingHorizontal: 8,
    fontStyle: 'italic',
  },
  scenarioText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  bulletPoint: {
    fontSize: 13,
    marginLeft: 8,
    marginVertical: 4,
  },
  jsonText: {
    fontSize: 11,
    fontFamily: 'monospace',
    backgroundColor: '#F5F5F5',
    padding: 8,
    borderRadius: 4,
  },
});

export default OfflineFeatureDemo;
