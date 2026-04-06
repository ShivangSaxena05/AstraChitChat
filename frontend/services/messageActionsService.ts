import { get, post, put, del } from './api';

/**
 * Message operations service - handles all REST API calls for message features
 * Works in tandem with Socket.IO for real-time updates
 */

// ============ REACTIONS ============

export async function addMessageReaction(
  messageId: string,
  emoji: string
): Promise<any> {
  try {
    console.log(`[messageActionsService] Adding reaction: ${emoji} to message ${messageId}`);
    return await post(`/chats/messages/${messageId}/reactions`, { emoji });
  } catch (error) {
    console.error('[messageActionsService] addMessageReaction failed:', error);
    throw error;
  }
}

export async function removeMessageReaction(
  messageId: string,
  emoji: string
): Promise<any> {
  try {
    console.log(`[messageActionsService] Removing reaction: ${emoji} from message ${messageId}`);
    return await del(`/chats/messages/${messageId}/reactions/${emoji}`);
  } catch (error) {
    console.error('[messageActionsService] removeMessageReaction failed:', error);
    throw error;
  }
}

export async function getMessageReactions(messageId: string): Promise<any> {
  try {
    console.log(`[messageActionsService] Getting reactions for message ${messageId}`);
    return await get(`/chats/messages/${messageId}/reactions`);
  } catch (error) {
    console.error('[messageActionsService] getMessageReactions failed:', error);
    throw error;
  }
}

// ============ MESSAGE EDIT ============

export async function editMessage(
  messageId: string,
  bodyText: string
): Promise<any> {
  try {
    if (!bodyText || bodyText.trim().length === 0) {
      throw new Error('Message cannot be empty');
    }
    console.log(`[messageActionsService] Editing message ${messageId}`);
    return await put(`/chats/messages/${messageId}`, { bodyText });
  } catch (error) {
    console.error('[messageActionsService] editMessage failed:', error);
    throw error;
  }
}

// ============ MESSAGE DELETE ============

export async function deleteMessage(messageId: string): Promise<any> {
  try {
    console.log(`[messageActionsService] Deleting message ${messageId}`);
    return await del(`/chats/messages/${messageId}`);
  } catch (error) {
    console.error('[messageActionsService] deleteMessage failed:', error);
    throw error;
  }
}

export async function unsendMessage(messageId: string): Promise<any> {
  try {
    console.log(`[messageActionsService] Unsending message ${messageId}`);
    return await del(`/chats/messages/${messageId}/unsend`);
  } catch (error) {
    console.error('[messageActionsService] unsendMessage failed:', error);
    throw error;
  }
}

// ============ MESSAGE STATUS ============

export async function markMessageAsRead(messageId: string): Promise<any> {
  try {
    console.log(`[messageActionsService] Marking message ${messageId} as read`);
    return await post(`/chats/messages/${messageId}/read`, {});
  } catch (error) {
    console.error('[messageActionsService] markMessageAsRead failed:', error);
    throw error;
  }
}

export async function getMessageReceipts(messageId: string): Promise<any> {
  try {
    console.log(`[messageActionsService] Getting receipts for message ${messageId}`);
    return await get(`/chats/messages/${messageId}/receipts`);
  } catch (error) {
    console.error('[messageActionsService] getMessageReceipts failed:', error);
    throw error;
  }
}

// ============ GROUP MANAGEMENT ============

export async function leaveGroupChat(chatId: string): Promise<any> {
  try {
    console.log(`[messageActionsService] Leaving group chat ${chatId}`);
    return await post(`/chats/${chatId}/leave`, {});
  } catch (error) {
    console.error('[messageActionsService] leaveGroupChat failed:', error);
    throw error;
  }
}

export async function addGroupMember(
  chatId: string,
  userId: string
): Promise<any> {
  try {
    console.log(`[messageActionsService] Adding member ${userId} to chat ${chatId}`);
    return await post(`/chats/${chatId}/add-member`, { userId });
  } catch (error) {
    console.error('[messageActionsService] addGroupMember failed:', error);
    throw error;
  }
}

export async function removeGroupMember(
  chatId: string,
  userId: string
): Promise<any> {
  try {
    console.log(`[messageActionsService] Removing member ${userId} from chat ${chatId}`);
    return await post(`/chats/${chatId}/remove-member`, { userId });
  } catch (error) {
    console.error('[messageActionsService] removeGroupMember failed:', error);
    throw error;
  }
}

export default {
  addMessageReaction,
  removeMessageReaction,
  getMessageReactions,
  editMessage,
  deleteMessage,
  unsendMessage,
  markMessageAsRead,
  getMessageReceipts,
  leaveGroupChat,
  addGroupMember,
  removeGroupMember,
};
