/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Chat Data Helpers - Safe Access Layer for Frontend
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Safely extract and transform chat display data with comprehensive null checks
 * - Works for both direct and group chats
 * - All functions include type guards and fallbacks
 * - Prevents null crashes when displaying chat data
 * - No external dependencies - pure TypeScript utilities
 */

/**
 * Chat interface from backend response
 */
export interface Chat {
  _id: string;
  convoType: 'direct' | 'group';
  participants: Array<{
    user: {
      _id: string;
      username?: string;
      name?: string;
      profilePicture?: string;
      isOnline?: boolean;
      bio?: string;
    };
    role: string;
    joinedAt: string;
    lastReadMsgId: string | null;
  }>;
  groupName?: string | null;
  groupAvatar?: {
    secure_url?: string;
    public_id?: string;
  } | null;
  otherUser?: {
    _id: string;
    username?: string;
    name?: string;
    profilePicture?: string;
  } | null;
  lastMessage?: {
    text?: string;
    bodyText?: string;
    sender?: {
      _id: string;
      username?: string;
      name?: string;
    };
    createdAt?: string;
  } | null;
  unreadCount?: number;
  lastActivityTimestamp?: string;
  lastReadMsgId?: string | null;
}

/**
 * ✅ SAFE: Get display name for a chat
 * 
 * For direct chats: other user's username
 * For group chats: group name
 * Always returns a safe, non-empty string
 * 
 * @param chat - Chat object from API
 * @returns Display name safe for rendering
 */
export function getChatDisplayName(chat: Chat | null | undefined): string {
  if (!chat) return 'Chat';

  // Direct chat: use other user's username
  if (chat.convoType === 'direct') {
    // Prefer the pre-extracted otherUser if available (backend optimization)
    if (chat.otherUser?.username && chat.otherUser.username.trim().length > 0) {
      return chat.otherUser.username;
    }

    // Fallback: extract from participants
    if (Array.isArray(chat.participants) && chat.participants.length > 0) {
      const otherUser = chat.participants[0]?.user;
      if (otherUser?.username && otherUser.username.trim().length > 0) {
        return otherUser.username;
      }
      if (otherUser?.name && otherUser.name.trim().length > 0) {
        return otherUser.name;
      }
    }

    return 'Direct Chat';
  }

  // Group chat: use group name
  if (chat.convoType === 'group') {
    if (chat.groupName && typeof chat.groupName === 'string' && chat.groupName.trim().length > 0) {
      return chat.groupName;
    }
    return 'Group Chat';
  }

  return 'Chat';
}

/**
 * ✅ SAFE: Get avatar URL for a chat
 * 
 * For direct chats: other user's profile picture
 * For group chats: group avatar
 * Always returns a valid HTTP(S) URL or null
 * 
 * @param chat - Chat object from API
 * @returns Avatar URL (HTTPS) or null if not available
 */
export function getChatDisplayAvatar(chat: Chat | null | undefined): string | null {
  if (!chat) return null;

  // Direct chat: use other user's profile picture
  if (chat.convoType === 'direct') {
    // Prefer the pre-extracted otherUser if available
    if (chat.otherUser?.profilePicture && isValidImageUrl(chat.otherUser.profilePicture)) {
      return ensureHttps(chat.otherUser.profilePicture);
    }

    // Fallback: extract from participants
    if (Array.isArray(chat.participants) && chat.participants.length > 0) {
      const profilePicture = chat.participants[0]?.user?.profilePicture;
      if (profilePicture && isValidImageUrl(profilePicture)) {
        return ensureHttps(profilePicture);
      }
    }

    return null;
  }

  // Group chat: use group avatar
  if (chat.convoType === 'group') {
    if (
      chat.groupAvatar &&
      typeof chat.groupAvatar === 'object' &&
      chat.groupAvatar.secure_url &&
      isValidImageUrl(chat.groupAvatar.secure_url)
    ) {
      return ensureHttps(chat.groupAvatar.secure_url);
    }

    return null;
  }

  return null;
}

/**
 * ✅ SAFE: Get the other user in a direct chat
 * 
 * @param chat - Chat object from API
 * @param currentUserId - Current user's ID to filter out
 * @returns Other user object or null
 */
export function getChatOtherUser(
  chat: Chat | null | undefined,
  currentUserId: string | null | undefined
): Chat['otherUser'] | null {
  if (!chat || chat.convoType !== 'direct') return null;

  // Use pre-extracted otherUser if available (backend optimization)
  if (chat.otherUser?._id && currentUserId && chat.otherUser._id !== currentUserId) {
    return chat.otherUser;
  }

  // Fallback: extract from participants
  if (!Array.isArray(chat.participants) || !currentUserId) return null;

  const currentUserStr = String(currentUserId);
  const other = chat.participants.find(p => String(p?.user?._id) !== currentUserStr);

  return other?.user ? safifyUser(other.user) : null;
}

/**
 * ✅ SAFE: Get formatted last message preview text
 * 
 * @param chat - Chat object from API
 * @returns Formatted message text or default
 */
export function getLastMessagePreview(chat: Chat | null | undefined): string {
  if (!chat?.lastMessage?.text && !chat?.lastMessage?.bodyText) {
    return 'No messages yet';
  }

  const text = (chat.lastMessage?.text || chat.lastMessage?.bodyText || '').trim();
  if (text.length === 0) return 'No messages yet';

  // Limit length for preview
  return text.length > 100 ? text.substring(0, 100) + '...' : text;
}

/**
 * ✅ SAFE: Get last message sender's display name
 * 
 * @param chat - Chat object from API
 * @returns Sender's display name or "Unknown"
 */
export function getLastMessageSenderDisplay(chat: Chat | null | undefined): string {
  if (!chat?.lastMessage?.sender) return 'Unknown';

  const sender = chat.lastMessage.sender;
  if (sender.username && sender.username.trim().length > 0) {
    return sender.username;
  }
  if (sender.name && sender.name.trim().length > 0) {
    return sender.name;
  }
  return 'Unknown';
}

/**
 * ✅ SAFE: Format relative time for display
 * 
 * @param dateString - ISO date string
 * @returns Formatted relative time or empty string
 */
export function formatRelativeTime(dateString: string | undefined): string {
  if (!dateString) return '';

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 0) return 'now';
    if (diffSec < 60) return 'now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * ✅ SAFE: Get formatted display info for a chat (combines everything)
 * 
 * @param chat - Chat object from API
 * @param currentUserId - Current user's ID
 * @returns Formatted display object with all safe data
 */
export function formatChatForDisplay(
  chat: Chat | null | undefined,
  currentUserId: string | null | undefined
) {
  if (!chat) {
    return {
      displayName: 'Chat',
      displayAvatar: null,
      lastMessagePreview: 'No messages',
      lastMessageSender: 'You',
      timestamp: '',
      isGroup: false,
      otherUser: null,
    };
  }

  return {
    displayName: getChatDisplayName(chat),
    displayAvatar: getChatDisplayAvatar(chat),
    lastMessagePreview: getLastMessagePreview(chat),
    lastMessageSender: getLastMessageSenderDisplay(chat),
    timestamp: formatRelativeTime(chat.lastActivityTimestamp || chat.lastMessage?.createdAt),
    isGroup: chat.convoType === 'group',
    otherUser: getChatOtherUser(chat, currentUserId),
  };
}

/**
 * ✅ SAFE: Get participant avatar (for group chats, show participant avatars)
 * 
 * @param participant - Participant object from chat.participants
 * @returns Avatar URL (HTTPS) or null
 */
export function getParticipantAvatar(
  participant: Chat['participants'][0] | null | undefined
): string | null {
  if (!participant?.user?.profilePicture) return null;

  const picture = participant.user.profilePicture;
  if (isValidImageUrl(picture)) {
    return ensureHttps(picture);
  }

  return null;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PRIVATE UTILITY FUNCTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Check if a URL is a valid image URL
 */
function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;

  const trimmed = url.trim();
  if (trimmed.length === 0) return false;

  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

/**
 * Ensure URL uses HTTPS
 */
function ensureHttps(url: string): string {
  if (url.startsWith('https://')) return url;
  if (url.startsWith('http://')) return url.replace(/^http:/, 'https:');
  return url;
}

/**
 * Safely convert user object with fallbacks
 */
function safifyUser(user: any): Chat['otherUser'] {
  return {
    _id: user?._id || '',
    username: user?.username || 'Unknown',
    name: user?.name || user?.username || 'Unknown',
    profilePicture: user?.profilePicture || undefined,
  };
}
