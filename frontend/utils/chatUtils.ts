/**
 * Sanitize message text for XSS prevention
 * Escapes HTML special characters
 */
export const sanitizeMessage = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/`/g, '&#x60;')
    .trim();
};

/**
 * Format last seen timestamp to readable string
 * Examples: "Online", "2 minutes ago", "Yesterday at 3:45 PM"
 */
export const formatLastSeen = (lastSeen: string | null): string => {
  if (!lastSeen) return 'Last seen: unknown';

  const lastSeenDate = new Date(lastSeen);
  const now = new Date();
  const diffMs = now.getTime() - lastSeenDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) {
    return 'Last seen just now';
  } else if (diffMins < 60) {
    return `Last seen ${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `Last seen ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `Last seen ${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else {
    return `Last seen ${lastSeenDate.toLocaleDateString()}`;
  }
};

/**
 * Check if a message is read by the other user
 */
export const isMessageRead = (
  message: any,
  currentUserId: string | null,
  otherUserId: string,
): boolean => {
  if (String(message.sender._id) === String(currentUserId)) {
    return message.readBy?.includes(otherUserId);
  }
  return false;
};
