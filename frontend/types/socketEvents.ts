/**
 * Socket Event Types and Validators
 * Ensures all socket events have proper type checking and validation
 */

/**
 * New Message Event
 * Emitted when a user sends a message
 */
export interface NewMessageEvent {
  sender: string;
  receiver: string;
  chat: string;
  bodyText: string;
  msgType: 'text' | 'image' | 'video' | 'audio' | 'file';
  attachments?: Array<{
    public_id: string;
    secure_url: string;
    resource_type: string;
  }>;
  quotedMsgId?: string;
}

export function validateNewMessageEvent(data: any): data is NewMessageEvent {
  if (!data || typeof data !== 'object') return false;

  // Required fields
  if (typeof data.sender !== 'string' || !data.sender.trim()) return false;
  if (typeof data.receiver !== 'string' || !data.receiver.trim()) return false;
  if (typeof data.chat !== 'string' || !data.chat.trim()) return false;
  if (typeof data.bodyText !== 'string') return false;
  if (typeof data.msgType !== 'string') return false;

  // Validate msgType enum
  const validMsgTypes = ['text', 'image', 'video', 'audio', 'file'];
  if (!validMsgTypes.includes(data.msgType)) return false;

  // Optional: validate attachments if present
  if (data.attachments) {
    if (!Array.isArray(data.attachments)) return false;
    for (const att of data.attachments) {
      if (typeof att.public_id !== 'string') return false;
      if (typeof att.secure_url !== 'string') return false;
      if (typeof att.resource_type !== 'string') return false;
    }
  }

  // Optional: validate quotedMsgId
  if (data.quotedMsgId && typeof data.quotedMsgId !== 'string') return false;

  return true;
}

/**
 * Message Read Event
 * Emitted when a user reads a message
 */
export interface MessageReadEvent {
  messageId: string;
  userId: string;
  chatId: string;
}

export function validateMessageReadEvent(data: any): data is MessageReadEvent {
  if (!data || typeof data !== 'object') return false;

  if (typeof data.messageId !== 'string' || !data.messageId.trim()) return false;
  if (typeof data.userId !== 'string' || !data.userId.trim()) return false;
  if (typeof data.chatId !== 'string' || !data.chatId.trim()) return false;

  return true;
}

/**
 * Typing Indicator Event
 * Emitted when a user is typing
 */
export interface TypingEvent {
  chatId: string;
  userId: string;
  username: string;
}

export function validateTypingEvent(data: any): data is TypingEvent {
  if (!data || typeof data !== 'object') return false;

  if (typeof data.chatId !== 'string' || !data.chatId.trim()) return false;
  if (typeof data.userId !== 'string' || !data.userId.trim()) return false;
  if (typeof data.username !== 'string' || !data.username.trim()) return false;

  return true;
}

/**
 * Stop Typing Event
 * Emitted when a user stops typing
 */
export interface StopTypingEvent {
  chatId: string;
  userId: string;
}

export function validateStopTypingEvent(data: any): data is StopTypingEvent {
  if (!data || typeof data !== 'object') return false;

  if (typeof data.chatId !== 'string' || !data.chatId.trim()) return false;
  if (typeof data.userId !== 'string' || !data.userId.trim()) return false;

  return true;
}

/**
 * Message Edited Event
 * Emitted when a user edits a message
 */
export interface MessageEditedEvent {
  messageId: string;
  chatId: string;
  userId: string;
  newText: string;
  editedAt: string;
}

export function validateMessageEditedEvent(
  data: any
): data is MessageEditedEvent {
  if (!data || typeof data !== 'object') return false;

  if (typeof data.messageId !== 'string' || !data.messageId.trim()) return false;
  if (typeof data.chatId !== 'string' || !data.chatId.trim()) return false;
  if (typeof data.userId !== 'string' || !data.userId.trim()) return false;
  if (typeof data.newText !== 'string') return false;
  if (typeof data.editedAt !== 'string') return false;

  return true;
}

/**
 * Message Deleted Event
 * Emitted when a user deletes a message
 */
export interface MessageDeletedEvent {
  messageId: string;
  chatId: string;
  userId: string;
  deletedAt: string;
}

export function validateMessageDeletedEvent(
  data: any
): data is MessageDeletedEvent {
  if (!data || typeof data !== 'object') return false;

  if (typeof data.messageId !== 'string' || !data.messageId.trim()) return false;
  if (typeof data.chatId !== 'string' || !data.chatId.trim()) return false;
  if (typeof data.userId !== 'string' || !data.userId.trim()) return false;
  if (typeof data.deletedAt !== 'string') return false;

  return true;
}

/**
 * Message Reaction Added Event
 * Emitted when a user adds a reaction to a message
 */
export interface ReactionAddedEvent {
  messageId: string;
  chatId: string;
  userId: string;
  emoji: string;
}

export function validateReactionAddedEvent(
  data: any
): data is ReactionAddedEvent {
  if (!data || typeof data !== 'object') return false;

  if (typeof data.messageId !== 'string' || !data.messageId.trim()) return false;
  if (typeof data.chatId !== 'string' || !data.chatId.trim()) return false;
  if (typeof data.userId !== 'string' || !data.userId.trim()) return false;
  if (typeof data.emoji !== 'string' || !data.emoji.trim()) return false;

  // Validate emoji is actually an emoji (very basic check)
  if (data.emoji.length > 2) return false;

  return true;
}

/**
 * Message Reaction Removed Event
 * Emitted when a user removes a reaction from a message
 */
export interface ReactionRemovedEvent {
  messageId: string;
  chatId: string;
  userId: string;
  emoji: string;
}

export function validateReactionRemovedEvent(
  data: any
): data is ReactionRemovedEvent {
  if (!data || typeof data !== 'object') return false;

  if (typeof data.messageId !== 'string' || !data.messageId.trim()) return false;
  if (typeof data.chatId !== 'string' || !data.chatId.trim()) return false;
  if (typeof data.userId !== 'string' || !data.userId.trim()) return false;
  if (typeof data.emoji !== 'string' || !data.emoji.trim()) return false;

  if (data.emoji.length > 2) return false;

  return true;
}

/**
 * User Online Status Event
 * Emitted when a user comes online/goes offline
 */
export interface UserStatusEvent {
  userId: string;
  status: 'online' | 'offline';
  lastSeen?: string;
}

export function validateUserStatusEvent(data: any): data is UserStatusEvent {
  if (!data || typeof data !== 'object') return false;

  if (typeof data.userId !== 'string' || !data.userId.trim()) return false;
  if (!['online', 'offline'].includes(data.status)) return false;

  if (data.lastSeen && typeof data.lastSeen !== 'string') return false;

  return true;
}

/**
 * Chat Updated Event
 * Emitted when chat metadata changes (name, avatar, etc)
 */
export interface ChatUpdatedEvent {
  chatId: string;
  updatedBy: string;
  changes: {
    name?: string;
    avatar?: string;
    description?: string;
  };
  updatedAt: string;
}

export function validateChatUpdatedEvent(data: any): data is ChatUpdatedEvent {
  if (!data || typeof data !== 'object') return false;

  if (typeof data.chatId !== 'string' || !data.chatId.trim()) return false;
  if (typeof data.updatedBy !== 'string' || !data.updatedBy.trim()) return false;
  if (!data.changes || typeof data.changes !== 'object') return false;
  if (typeof data.updatedAt !== 'string') return false;

  // Validate changes object has at least one valid property
  const { name, avatar, description } = data.changes;
  if (
    (name && typeof name !== 'string') ||
    (avatar && typeof avatar !== 'string') ||
    (description && typeof description !== 'string')
  ) {
    return false;
  }

  if (!name && !avatar && !description) return false;

  return true;
}

/**
 * Member Added/Removed Event
 * Emitted when a member is added or removed from a group chat
 */
export interface MemberChangedEvent {
  chatId: string;
  userId: string;
  action: 'added' | 'removed';
  changedBy: string;
  changedAt: string;
}

export function validateMemberChangedEvent(
  data: any
): data is MemberChangedEvent {
  if (!data || typeof data !== 'object') return false;

  if (typeof data.chatId !== 'string' || !data.chatId.trim()) return false;
  if (typeof data.userId !== 'string' || !data.userId.trim()) return false;
  if (!['added', 'removed'].includes(data.action)) return false;
  if (typeof data.changedBy !== 'string' || !data.changedBy.trim()) return false;
  if (typeof data.changedAt !== 'string') return false;

  return true;
}

/**
 * Unread Count Updated Event
 * Emitted when unread message count changes
 */
export interface UnreadCountUpdatedEvent {
  chatId: string;
  unreadCount: number;
  userId: string;
}

export function validateUnreadCountUpdatedEvent(
  data: any
): data is UnreadCountUpdatedEvent {
  if (!data || typeof data !== 'object') return false;

  if (typeof data.chatId !== 'string' || !data.chatId.trim()) return false;
  if (typeof data.unreadCount !== 'number' || data.unreadCount < 0)
    return false;
  if (typeof data.userId !== 'string' || !data.userId.trim()) return false;

  return true;
}
