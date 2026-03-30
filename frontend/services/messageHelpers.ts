/**
 * Chat & Messaging Helpers for New Backend Schema
 * 
 * Utilities for handling new message fields:
 * - status: 'sending' | 'sent' | 'delivered' | 'read'
 * - reactions: MessageReaction[]
 * - readBy: MessageReceipt[]
 * - deliveredTo: MessageReceipt[]
 */

import { Message, MessageReaction } from './types';

/**
 * Get readable status indicator for message
 */
export function getMessageStatusIndicator(status?: string): string {
  switch (status) {
    case 'sending':
      return '↻'; // Sending
    case 'sent':
      return '✓'; // Sent
    case 'delivered':
      return '✓✓'; // Delivered
    case 'read':
      return '✓✓'; // Read (shown in blue)
    default:
      return '';
  }
}

/**
 * Check if message is read by recipient
 */
export function isMessageRead(message: Message): boolean {
  return message.readBy && message.readBy.length > 0;
}

/**
 * Check if message is delivered to recipient
 */
export function isMessageDelivered(message: Message): boolean {
  return message.deliveredTo && message.deliveredTo.length > 0;
}

/**
 * Check if user has reacted to a message with specific emoji
 */
export function userHasReacted(
  message: Message,
  userId: string,
  emoji: string
): boolean {
  const reaction = message.reactions?.find(r => r.emoji === emoji);
  return reaction?.users?.includes(userId) ?? false;
}

/**
 * Get reaction count for specific emoji
 */
export function getReactionCount(
  reactions: MessageReaction[] | undefined,
  emoji: string
): number {
  return reactions?.find(r => r.emoji === emoji)?.users?.length ?? 0;
}

/**
 * Get all unique emoji from reactions
 */
export function getUniqueEmojis(reactions: MessageReaction[] | undefined): string[] {
  return reactions?.map(r => r.emoji) ?? [];
}

/**
 * Format read status for display
 */
export function formatReadStatus(message: Message): string {
  if (!message.readBy || message.readBy.length === 0) {
    if (!message.deliveredTo || message.deliveredTo.length === 0) {
      return 'Sent';
    }
    return 'Delivered';
  }
  return 'Read';
}

/**
 * Get time when message was read (if read by any recipient)
 */
export function getReadTime(message: Message): Date | null {
  if (!message.readBy || message.readBy.length === 0) {
    return null;
  }
  
  // Return most recent read time
  return message.readBy.reduce((latest, receipt) => {
    if (!receipt.readAt) return latest;
    const readDate = new Date(receipt.readAt);
    return !latest || readDate > latest ? readDate : latest;
  }, null as Date | null);
}

/**
 * Check if message has attachments
 */
export function hasAttachments(message: Message): boolean {
  return message.attachments && message.attachments.length > 0;
}

/**
 * Get total reaction count
 */
export function getTotalReactionCount(reactions: MessageReaction[] | undefined): number {
  return reactions?.reduce((sum, r) => sum + (r.users?.length ?? 0), 0) ?? 0;
}

/**
 * Check if message is edited
 */
export function isMessageEdited(message: Message): boolean {
  return !!message.editedAt;
}

/**
 * Check if message is unsent
 */
export function isMessageUnsent(message: Message): boolean {
  return !!message.unsentAt;
}

/**
 * Get message display text (handle unsent/edited)
 */
export function getMessageDisplayText(message: Message): string {
  if (message.unsentAt) {
    return 'This message was unsent';
  }

  if (!message.content && !message.attachments?.length) {
    return '[Empty message]';
  }

  if (message.content) {
    let text = message.content;
    if (message.editedAt) {
      text += ' (edited)';
    }
    return text;
  }

  if (hasAttachments(message)) {
    return `[${message.attachments.length} attachment${message.attachments.length > 1 ? 's' : ''}]`;
  }

  return '[Message]';
}

/**
 * Build reaction summary (e.g., "👍 John, Jane + 1 more")
 */
export function buildReactionSummary(
  reaction: MessageReaction,
  userMap: Map<string, { name: string; username: string }>
): string {
  if (!reaction.users || reaction.users.length === 0) {
    return '';
  }

  const names = reaction.users
    .slice(0, 2)
    .map(userId => {
      const user = userMap.get(userId);
      return user?.name || user?.username || 'Unknown';
    })
    .join(', ');

  const extra = reaction.users.length > 2 ? ` + ${reaction.users.length - 2} more` : '';

  return `${reaction.emoji} ${names}${extra}`;
}

/**
 * Check if two messages are from same user (for grouping in UI)
 */
export function isSameUser(message1: Message, message2: Message): boolean {
  return String(message1.sender._id) === String(message2.sender._id);
}

/**
 * Check if messages are close in time (within 2 minutes)
 */
export function isCloseInTime(message1: Message, message2: Message, minutes = 2): boolean {
  const time1 = new Date(message1.createdAt).getTime();
  const time2 = new Date(message2.createdAt).getTime();
  const diffMs = Math.abs(time2 - time1);
  return diffMs < minutes * 60 * 1000;
}

/**
 * Determine if messages should be grouped (same user, close in time)
 */
export function shouldGroupMessages(message1: Message, message2: Message): boolean {
  return isSameUser(message1, message2) && isCloseInTime(message1, message2);
}

/**
 * Get formatted read receipts for tooltip
 */
export function getReadReceiptsList(message: Message): string[] {
  if (!message.readBy || message.readBy.length === 0) {
    return [];
  }

  return message.readBy.map(receipt => {
    if (!receipt.readAt) return 'Read';
    const date = new Date(receipt.readAt);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `Read at ${hours}:${minutes}`;
  });
}

/**
 * Validate message integrity (check for required fields)
 */
export function validateMessage(message: any): message is Message {
  return (
    message &&
    typeof message._id === 'string' &&
    typeof message.chatId === 'string' &&
    message.sender &&
    typeof message.sender._id === 'string'
  );
}

/**
 * Get message badge count (reactions, reads, etc.)
 */
export function getMessageBadgeCount(message: Message): number {
  let count = 0;
  if (message.reactions && message.reactions.length > 0) {
    count += message.reactions.reduce((sum, r) => sum + (r.users?.length ?? 0), 0);
  }
  if (message.readBy && message.readBy.length > 0) {
    count += 1; // Just count as "read" once
  }
  return count;
}

/**
 * Check if user can edit message
 * (Usually: owner + within 15 minutes)
 */
export function canEditMessage(
  message: Message,
  currentUserId: string,
  timeWindowMinutes = 15
): boolean {
  // Must be owner
  if (String(message.sender._id) !== String(currentUserId)) {
    return false;
  }

  // Must not be unsent
  if (message.unsentAt) {
    return false;
  }

  // Check time window
  const createdTime = new Date(message.createdAt).getTime();
  const nowTime = new Date().getTime();
  const diffMinutes = (nowTime - createdTime) / (1000 * 60);

  return diffMinutes <= timeWindowMinutes;
}

/**
 * Check if user can unsend message
 * (Usually: owner + within 60 minutes)
 */
export function canUnsendMessage(
  message: Message,
  currentUserId: string,
  timeWindowMinutes = 60
): boolean {
  // Must be owner
  if (String(message.sender._id) !== String(currentUserId)) {
    return false;
  }

  // Must not already be unsent
  if (message.unsentAt) {
    return false;
  }

  // Check time window
  const createdTime = new Date(message.createdAt).getTime();
  const nowTime = new Date().getTime();
  const diffMinutes = (nowTime - createdTime) / (1000 * 60);

  return diffMinutes <= timeWindowMinutes;
}

/**
 * Sort reactions by popularity (most reacted first)
 */
export function sortReactionsByPopularity(reactions: MessageReaction[]): MessageReaction[] {
  return [...reactions].sort((a, b) => {
    const countA = a.users?.length ?? 0;
    const countB = b.users?.length ?? 0;
    return countB - countA;
  });
}

export default {
  getMessageStatusIndicator,
  isMessageRead,
  isMessageDelivered,
  userHasReacted,
  getReactionCount,
  getUniqueEmojis,
  formatReadStatus,
  getReadTime,
  hasAttachments,
  getTotalReactionCount,
  isMessageEdited,
  isMessageUnsent,
  getMessageDisplayText,
  buildReactionSummary,
  isSameUser,
  isCloseInTime,
  shouldGroupMessages,
  getReadReceiptsList,
  validateMessage,
  getMessageBadgeCount,
  canEditMessage,
  canUnsendMessage,
  sortReactionsByPopularity,
};
