/**
 * Type Definitions & Utilities for Updated Backend Schema
 * 
 * This file contains TypeScript interfaces that match the new backend
 * schema with lazy-loaded defaults and computed fields.
 */

// ────────────────────────────────────────────────────────────────────────────
// USER TYPES
// ────────────────────────────────────────────────────────────────────────────

export interface UserStats {
  postsCount: number;
  followersCount: number;
  followingCount: number;
  totalLikesCount: number;
}

export interface User {
  _id: string;
  name: string;
  username: string;
  email: string;
  profilePicture?: string;
  coverPhoto?: string;
  bio?: string;
  location?: string;
  website?: string;
  pronouns?: string;
  encryptionPublicKey?: string;
  
  // Lazy-loaded fields (set on first read)
  isOnline: boolean;
  lastSeen: Date;
  
  // Computed stats fields
  postsCount: number;
  followersCount: number;
  followingCount: number;
  totalLikesCount: number;
  
  // User preferences
  isPrivate: boolean;
  isVerified: boolean;
  
  // Arrays
  blockedUsers: string[];
  mutedUsers: string[];
  followRequests: string[];
  
  // Metadata
  role?: 'user' | 'admin' | 'moderator';
  createdAt: Date;
  updatedAt: Date;
}

// ────────────────────────────────────────────────────────────────────────────
// CHAT TYPES
// ────────────────────────────────────────────────────────────────────────────

export interface ChatParticipant {
  _id: string;
  user: User; // Populated user object with lazy defaults
  role: 'admin' | 'member'; // Lazy-loaded default
  joinedAt: Date; // Lazy-loaded timestamp
}

export interface Chat {
  _id: string;
  participants: ChatParticipant[];
  lastMessage?: Message;
  lastActivityTimestamp: Date; // When chat was last active
  isGroup: boolean;
  name?: string; // For group chats
  description?: string; // For group chats
  groupPicture?: string; // For group chats
  
  // User preferences
  unreadCount?: number;
  mutedBy?: string[]; // User IDs who muted this chat
  isPinnedBy?: string[]; // User IDs who pinned this chat
  
  createdAt: Date;
  updatedAt: Date;
}

// ────────────────────────────────────────────────────────────────────────────
// MESSAGE TYPES
// ────────────────────────────────────────────────────────────────────────────

export interface MessageReaction {
  emoji: string;
  users: string[]; // User IDs who reacted
}

export interface MessageReceipt {
  _id: string;
  readAt?: Date;
  deliveredAt?: Date;
}

export interface MessageAttachment {
  url: string;
  type: 'image' | 'video' | 'audio' | 'file';
  mediaKey?: string;
}

export interface Message {
  _id: string;
  chatId: string;
  sender: {
    _id: string;
    name: string;
    username: string;
    profilePicture: string;
  };
  
  // Core content
  content: string; // Main message text
  attachments: MessageAttachment[];
  
  // Message status - set lazily by backend
  status: 'sending' | 'sent' | 'delivered' | 'read';
  
  // Read & Delivery tracking
  readBy: MessageReceipt[]; // Who read the message and when
  deliveredTo: MessageReceipt[]; // Who received the message and when
  
  // Reactions (set lazily)
  reactions: MessageReaction[];
  
  // Optional fields
  quotedMsgId?: string; // ID of quoted message
  editedAt?: Date; // When message was last edited
  unsentAt?: Date; // When message was unsent
  unsentBy?: string; // User ID who unsent it
  
  // Encryption (optional)
  encryptedBody?: string;
  nonce?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

// ────────────────────────────────────────────────────────────────────────────
// POST TYPES
// ────────────────────────────────────────────────────────────────────────────

export interface Post {
  _id: string;
  user: User | string; // Can be populated or just ID
  caption: string;
  mediaUrl?: string;
  mediaKey?: string;
  mediaType?: 'image' | 'video' | 'audio';
  
  // Stats
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  savedCount: number;
  viewsCount: number;
  
  // Content
  hashtags: string[];
  location?: string;
  visibility: 'public' | 'private' | 'friends';
  
  // Tracking
  isDeleted: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

// ────────────────────────────────────────────────────────────────────────────
// COMMENT TYPES
// ────────────────────────────────────────────────────────────────────────────

export interface Comment {
  _id: string;
  postId: string;
  user: User;
  content: string;
  likesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Ensures all lazy-loaded fields have safe defaults
 * Frontend can use this to guarantee field existence
 */
export function ensureUserDefaults(user: Partial<User>): User {
  return {
    _id: user._id || '',
    name: user.name || 'Unknown',
    username: user.username || 'unknown',
    email: user.email || '',
    profilePicture: user.profilePicture || '',
    coverPhoto: user.coverPhoto || '',
    bio: user.bio || '',
    location: user.location || '',
    website: user.website || '',
    pronouns: user.pronouns || '',
    encryptionPublicKey: user.encryptionPublicKey,
    
    // Lazy-loaded - backend provides safe defaults
    isOnline: user.isOnline ?? false,
    lastSeen: user.lastSeen ? new Date(user.lastSeen) : new Date(),
    
    // Computed stats - default to 0
    postsCount: user.postsCount ?? 0,
    followersCount: user.followersCount ?? 0,
    followingCount: user.followingCount ?? 0,
    totalLikesCount: user.totalLikesCount ?? 0,
    
    // Preferences
    isPrivate: user.isPrivate ?? false,
    isVerified: user.isVerified ?? false,
    
    // Arrays
    blockedUsers: user.blockedUsers ?? [],
    mutedUsers: user.mutedUsers ?? [],
    followRequests: user.followRequests ?? [],
    
    // Role
    role: user.role ?? 'user',
    
    // Dates
    createdAt: user.createdAt ? new Date(user.createdAt) : new Date(),
    updatedAt: user.updatedAt ? new Date(user.updatedAt) : new Date(),
  };
}

/**
 * Ensures chat has all required fields with defaults
 */
export function ensureChatDefaults(chat: Partial<Chat>): Chat {
  return {
    _id: chat._id || '',
    participants: chat.participants ?? [],
    lastMessage: chat.lastMessage,
    lastActivityTimestamp: chat.lastActivityTimestamp 
      ? new Date(chat.lastActivityTimestamp) 
      : new Date(),
    isGroup: chat.isGroup ?? false,
    name: chat.name,
    description: chat.description,
    groupPicture: chat.groupPicture,
    unreadCount: chat.unreadCount ?? 0,
    mutedBy: chat.mutedBy ?? [],
    isPinnedBy: chat.isPinnedBy ?? [],
    createdAt: chat.createdAt ? new Date(chat.createdAt) : new Date(),
    updatedAt: chat.updatedAt ? new Date(chat.updatedAt) : new Date(),
  };
}

/**
 * Ensures message has all required fields with defaults
 */
export function ensureMessageDefaults(message: Partial<Message>): Message {
  return {
    _id: message._id || '',
    chatId: message.chatId || '',
    sender: message.sender || {
      _id: '',
      name: 'Unknown',
      username: 'unknown',
      profilePicture: '',
    },
    content: message.content ?? '',
    attachments: message.attachments ?? [],
    status: message.status ?? 'sent',
    readBy: message.readBy ?? [],
    deliveredTo: message.deliveredTo ?? [],
    reactions: message.reactions ?? [],
    quotedMsgId: message.quotedMsgId,
    editedAt: message.editedAt,
    unsentAt: message.unsentAt,
    unsentBy: message.unsentBy,
    encryptedBody: message.encryptedBody,
    nonce: message.nonce,
    createdAt: message.createdAt ? new Date(message.createdAt) : new Date(),
    updatedAt: message.updatedAt ? new Date(message.updatedAt) : new Date(),
  };
}

/**
 * Format user for display (handles null/undefined gracefully)
 */
export function formatUser(user: Partial<User> | null | undefined) {
  if (!user) {
    return {
      displayName: 'Unknown User',
      username: 'unknown',
      avatar: '',
      isOnline: false,
      lastSeen: new Date(),
    };
  }

  return {
    displayName: user.name || user.username || 'Unknown User',
    username: user.username || 'unknown',
    avatar: user.profilePicture || '',
    isOnline: user.isOnline ?? false,
    lastSeen: user.lastSeen ? new Date(user.lastSeen) : new Date(),
  };
}

/**
 * Format message for display (handles null/undefined gracefully)
 */
export function formatMessage(message: Partial<Message> | null | undefined) {
  if (!message) {
    return {
      content: '',
      status: 'sent' as const,
      reactions: [],
      readBy: [],
    };
  }

  return {
    content: message.content ?? '',
    status: message.status ?? 'sent',
    reactions: message.reactions ?? [],
    readBy: message.readBy ?? [],
    attachments: message.attachments ?? [],
  };
}

/**
 * Check if message is read by current user
 */
export function isMessageReadByUser(message: Message, userId: string): boolean {
  return message.readBy?.some(receipt => receipt._id === userId) ?? false;
}

/**
 * Check if message has reactions
 */
export function hasReactions(message: Message): boolean {
  return (message.reactions?.length ?? 0) > 0;
}

/**
 * Get user names who reacted with emoji
 */
export function getReactorNames(
  reaction: MessageReaction,
  users: Map<string, User>
): string[] {
  return reaction.users
    .map(userId => {
      const user = users.get(userId);
      return user?.name || user?.username || 'Unknown';
    })
    .filter(Boolean);
}

/**
 * Format relative time (e.g., "2h ago", "just now")
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffWeek < 4) return `${diffWeek}w ago`;

  // Fallback to date
  return then.toLocaleDateString();
}

export default {
  ensureUserDefaults,
  ensureChatDefaults,
  ensureMessageDefaults,
  formatUser,
  formatMessage,
  isMessageReadByUser,
  hasReactions,
  getReactorNames,
  formatRelativeTime,
};
