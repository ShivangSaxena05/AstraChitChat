import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCall } from '@/contexts/CallContext';
import { ThemedText } from './themed-text';

export default function CallOverlay() {
  const { isCalling, incomingCall, acceptCall, declineCall, endCall, isMuted, toggleMute, isSpeaker, toggleSpeaker } = useCall();
  const [callDuration, setCallDuration] = useState(0);

  // Timer for active calls
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isCalling && !incomingCall) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCalling, incomingCall]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Render Incoming Call Screen
  if (incomingCall) {
    return (
      <View style={styles.incomingContainer}>
        <View style={styles.incomingModal}>
          <Ionicons name="call" size={48} color="#fff" style={styles.pulseIcon} />
          <ThemedText style={styles.incomingTitle}>Incoming Call</ThemedText>
          <Text style={styles.callerInfo}>E2EE Audio Connection</Text>

          <View style={styles.actionsContainer}>
            <TouchableOpacity style={[styles.actionBtn, styles.declineBtn]} onPress={declineCall}>
              <Ionicons name="close" size={32} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.acceptBtn]} onPress={acceptCall}>
              <Ionicons name="call" size={32} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Render Active Call Controls
  if (isCalling) {
    return (
      <View pointerEvents="box-none" style={styles.activeCallContainer}>
        <View style={styles.floatingControls}>
          <View style={styles.callHeader}>
            <Ionicons name="lock-closed" size={12} color="#4ADDAE" style={{marginRight: 4}} />
            <Text style={styles.durationText}>{formatTime(callDuration)}</Text>
          </View>
          
          <View style={styles.controlRow}>
            <TouchableOpacity 
              style={[styles.controlBtn, isMuted && styles.controlBtnActive]} 
              onPress={toggleMute}
            >
              <Ionicons name={isMuted ? "mic-off" : "mic"} size={24} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.controlBtn, styles.endBtn]} 
              onPress={endCall}
            >
              <Ionicons name="call" size={24} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.controlBtn, isSpeaker && styles.controlBtnActive]} 
              onPress={toggleSpeaker}
            >
              <Ionicons name={isSpeaker ? "volume-high" : "volume-medium"} size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  incomingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  incomingModal: {
    width: '80%',
    padding: 32,
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  pulseIcon: {
    marginBottom: 24,
  },
  incomingTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  callerInfo: {
    color: '#999',
    fontSize: 16,
    marginBottom: 40,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 20,
  },
  actionBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineBtn: {
    backgroundColor: '#ff4444',
  },
  acceptBtn: {
    backgroundColor: '#00C851',
  },
  activeCallContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9998,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 60, // Avoid safe area / status bar
  },
  floatingControls: {
    backgroundColor: 'rgba(26,26,26,0.95)',
    padding: 16,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  callHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(74, 221, 174, 0.1)',
    borderRadius: 12,
  },
  durationText: {
    color: '#4ADDAE',
    fontSize: 14,
    fontWeight: 'bold',
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  controlBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlBtnActive: {
    backgroundColor: '#555',
  },
  endBtn: {
    backgroundColor: '#ff4444',
    width: 56,
    height: 56,
    borderRadius: 28,
  },
});
