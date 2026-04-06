import { useState } from 'react';
import { Alert } from 'react-native';
import * as messageActionsService from '@/services/messageActionsService';

interface UseMessageActionsProps {
  messageId: string;
  onSuccess?: () => void;
}

/**
 * Hook to manage message actions (reactions, edit, delete, etc.)
 * Handles loading states and error cases
 */
export function useMessageActions({ messageId, onSuccess }: UseMessageActionsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApiCall = async (
    apiCall: () => Promise<any>,
    successMessage?: string
  ) => {
    try {
      setIsLoading(true);
      setError(null);
      await apiCall();
      if (successMessage) {
        console.log(`[useMessageActions] Success: ${successMessage}`);
      }
      onSuccess?.();
    } catch (error: any) {
      const message = error.message || 'Operation failed';
      setError(message);
      console.error('[useMessageActions] Error:', error);
      
      // Handle specific errors
      if (error.type === 'AUTH_ERROR') {
        // Already handled by api.ts - redirects to login
        console.log('[useMessageActions] Auth error detected');
        return;
      }
      
      if (error.type === 'PERMISSION_ERROR') {
        Alert.alert('Cannot perform action', 'You do not have permission');
      } else if (error.type === 'NOT_FOUND') {
        Alert.alert('Error', 'Message not found or has been deleted');
      } else {
        Alert.alert('Error', message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const addReaction = (emoji: string) =>
    handleApiCall(() => messageActionsService.addMessageReaction(messageId, emoji));

  const removeReaction = (emoji: string) =>
    handleApiCall(() => messageActionsService.removeMessageReaction(messageId, emoji));

  const editMessage = (newText: string) =>
    handleApiCall(
      () => messageActionsService.editMessage(messageId, newText),
      'Message updated'
    );

  const deleteMessage = () =>
    handleApiCall(
      () => messageActionsService.deleteMessage(messageId),
      'Message deleted'
    );

  const unsendMessage = () =>
    handleApiCall(
      () => messageActionsService.unsendMessage(messageId),
      'Message unsent'
    );

  const getReactions = async () => {
    try {
      setIsLoading(true);
      const reactions = await messageActionsService.getMessageReactions(messageId);
      return reactions;
    } catch (error: any) {
      console.error('[useMessageActions] getReactions error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const getReceipts = async () => {
    try {
      setIsLoading(true);
      const receipts = await messageActionsService.getMessageReceipts(messageId);
      return receipts;
    } catch (error: any) {
      console.error('[useMessageActions] getReceipts error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    error,
    addReaction,
    removeReaction,
    editMessage,
    deleteMessage,
    unsendMessage,
    getReactions,
    getReceipts,
  };
}
