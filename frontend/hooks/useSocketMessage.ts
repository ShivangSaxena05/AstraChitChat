import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useSocket } from '@/contexts/SocketContext';

/**
 * ✅ FIX: Hook for safe message sending with offline queuing
 * 
 * Provides utilities to:
 * 1. Check if socket is connected before sending
 * 2. Queue messages if offline
 * 3. Show user-friendly feedback
 */
export const useSocketMessage = () => {
  const { socket, isConnected, queueMessage } = useSocket();

  /**
   * Send message or queue if offline
   * Returns true if message was sent, false if queued
   */
  const sendOrQueueMessage = useCallback(
    async (
      messageData: any,
      onSend?: () => void,
      onQueue?: () => void
    ): Promise<boolean> => {
      if (!socket) {
        console.warn('[Socket Message] Socket not initialized');
        Alert.alert('Error', 'Socket connection not initialized. Please try again.');
        return false;
      }

      if (socket.connected) {
        // ✅ Send immediately if online
        console.log('[Socket Message] Socket connected, sending message');
        try {
          socket.emit('new message', messageData);
          onSend?.();
          return true;
        } catch (error) {
          console.error('[Socket Message] Error sending message:', error);
          // Queue as fallback on error
          queueMessage(messageData);
          onQueue?.();
          return false;
        }
      } else {
        // ✅ Queue if offline
        console.log('[Socket Message] Socket disconnected, queueing message');
        queueMessage(messageData);
        
        Alert.alert(
          'Offline Mode',
          'You\'re currently offline. Your message has been saved and will be sent when you reconnect.',
          [{ text: 'OK' }]
        );
        
        onQueue?.();
        return false;
      }
    },
    [socket, queueMessage]
  );

  /**
   * Check socket connection status and alert user if needed
   */
  const ensureConnected = useCallback(async (): Promise<boolean> => {
    if (!socket) {
      Alert.alert('Error', 'Socket connection not available');
      return false;
    }

    if (!socket.connected && socket.disconnected) {
      // Try to reconnect
      console.log('[Socket Message] Socket disconnected, attempting reconnection');
      socket.connect();
      
      // Wait a bit for reconnection
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(socket.connected);
        }, 2000);
      });
    }

    return socket.connected;
  }, [socket]);

  return {
    sendOrQueueMessage,
    ensureConnected,
    isSocketConnected: isConnected,
  };
};

export default useSocketMessage;
