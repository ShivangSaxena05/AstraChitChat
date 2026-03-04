import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { get, put } from '@/services/api';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, TouchableOpacity, View, useColorScheme } from 'react-native';

interface Report {
  _id: string;
  reportedUser: {
    _id: string;
    username: string;
  };
  reportedBy: {
    _id: string;
    username: string;
  };
  reason: string;
  description: string;
  status: 'pending' | 'reviewed' | 'resolved';
  createdAt: string;
}

export default function AdminScreen() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const colorScheme = useColorScheme();

  useFocusEffect(
    useCallback(() => {
      fetchReports();
    }, [])
  );

  const fetchReports = async () => {
    try {
      setLoading(true);
      const res = await get('/report');
      setReports(res.reports || []);
    } catch (error: any) {
      console.error('Fetch reports error:', error);
      Alert.alert('Error', 'Failed to fetch reports. Are you an admin?');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (reportId: string, newStatus: string) => {
    try {
      await put(`/report/${reportId}`, { status: newStatus });
      setReports(prev => prev.map(r => r._id === reportId ? { ...r, status: newStatus as any } : r));
    } catch (error: any) {
      Alert.alert('Error', 'Failed to update report status');
    }
  };

  const renderReport = ({ item }: { item: Report }) => (
    <View style={styles.reportCard}>
      <View style={styles.reportHeader}>
        <ThemedText style={styles.reportTitle}>Reason: {item.reason}</ThemedText>
        <ThemedText style={[
          styles.statusBadge, 
          item.status === 'resolved' ? styles.statusResolved : 
          item.status === 'reviewed' ? styles.statusReviewed : styles.statusPending
        ]}>
          {item.status.toUpperCase()}
        </ThemedText>
      </View>
      <ThemedText style={styles.detailText}>Reported User: @{item.reportedUser?.username || 'Unknown'}</ThemedText>
      <ThemedText style={styles.detailText}>Reported By: @{item.reportedBy?.username || 'Unknown'}</ThemedText>
      {item.description ? <ThemedText style={styles.description}>Notes: {item.description}</ThemedText> : null}

      <View style={styles.actionRow}>
        {item.status !== 'reviewed' && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FFA500' }]} onPress={() => handleUpdateStatus(item._id, 'reviewed')}>
            <ThemedText style={styles.actionText}>Mark Reviewed</ThemedText>
          </TouchableOpacity>
        )}
        {item.status !== 'resolved' && (
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#4ADDAE' }]} onPress={() => handleUpdateStatus(item._id, 'resolved')}>
            <ThemedText style={styles.actionText}>Mark Resolved</ThemedText>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    reportCard: {
      backgroundColor: colorScheme === 'dark' ? '#111' : '#fff',
      margin: 10,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colorScheme === 'dark' ? '#333' : '#eee',
    },
    reportHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    reportTitle: {
      fontWeight: 'bold',
      fontSize: 16,
      textTransform: 'capitalize',
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 'bold',
      overflow: 'hidden',
    },
    statusPending: {
      backgroundColor: '#ff4444',
      color: 'white',
    },
    statusReviewed: {
      backgroundColor: '#FFA500',
      color: 'white',
    },
    statusResolved: {
      backgroundColor: '#4ADDAE',
      color: 'white',
    },
    detailText: {
      color: 'gray',
      marginBottom: 4,
    },
    description: {
      marginTop: 8,
      fontStyle: 'italic',
      color: colorScheme === 'dark' ? '#ccc' : '#444',
    },
    actionRow: {
      flexDirection: 'row',
      marginTop: 16,
      gap: 10,
    },
    actionBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: 'center',
    },
    actionText: {
      color: 'white',
      fontWeight: 'bold',
      fontSize: 12,
    },
    emptyText: {
      textAlign: 'center',
      marginTop: 40,
      color: 'gray',
    }
  }), [colorScheme]);

  if (loading && reports.length === 0) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={reports}
        keyExtractor={item => item._id}
        renderItem={renderReport}
        ListEmptyComponent={<ThemedText style={styles.emptyText}>No reports to review.</ThemedText>}
      />
    </ThemedView>
  );
}
