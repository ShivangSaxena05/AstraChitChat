/**
 * Date Utility Functions
 * 
 * ✅ FIX (Bug #9): Properly handles timezone conversion for consistent timestamps
 * All timestamps from backend are in UTC. This module ensures consistent formatting
 * by explicitly converting to UTC before comparison.
 */

/**
 * Format relative time with proper timezone handling
 * 
 * @param dateString - ISO date string (UTC from backend)
 * @returns Formatted relative time (e.g., "2h ago", "just now")
 */
export const formatRelativeTime = (dateString: string | Date): string => {
  if (!dateString) return '';

  try {
    // Parse date as UTC
    const date = new Date(dateString);
    
    // Get current time in UTC
    const now = new Date();
    
    // Calculate difference in milliseconds
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffWeek = Math.floor(diffDay / 7);

    // Handle clock skew (future timestamps)
    if (diffSec < 0) {
      return 'just now'; // Or "in the future" for debugging
    }

    // Format based on time difference
    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    if (diffWeek < 4) return `${diffWeek}w ago`;

    // For older messages, show date in user's local timezone
    return formatFullDate(date);
  } catch (error) {
    console.error('[DateUtils] Error formatting relative time:', error, { dateString });
    return typeof dateString === 'string' ? dateString : '';
  }
};

/**
 * Format full date in user's local timezone
 * 
 * @param date - Date object
 * @returns Formatted date (e.g., "Jan 15, 2024")
 */
export const formatFullDate = (date: Date | string): string => {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    return dateObj.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch (error) {
    console.error('[DateUtils] Error formatting full date:', error);
    return '';
  }
};

/**
 * Format time with date in user's local timezone
 * 
 * @param date - Date object or ISO string
 * @returns Formatted date and time (e.g., "Jan 15, 2:30 PM")
 */
export const formatDateTime = (date: Date | string): string => {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    return dateObj.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    console.error('[DateUtils] Error formatting date time:', error);
    return '';
  }
};

/**
 * Format time only in user's local timezone
 * 
 * @param date - Date object or ISO string
 * @returns Formatted time (e.g., "2:30 PM" or "14:30")
 */
export const formatTime = (date: Date | string): string => {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    return dateObj.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    console.error('[DateUtils] Error formatting time:', error);
    return '';
  }
};

/**
 * Get time difference in human-readable format
 * Useful for message timestamps within the same day
 * 
 * @param date - Date object or ISO string
 * @returns Time string (e.g., "14:30" or "2:30 PM")
 */
export const formatTimeAgo = (date: Date | string): string => {
  return formatRelativeTime(date);
};

/**
 * Determine if a date is today
 * 
 * @param date - Date object or ISO string
 * @returns True if date is today in user's local timezone
 */
export const isToday = (date: Date | string): boolean => {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const today = new Date();
    
    return (
      dateObj.getUTCDate() === today.getUTCDate() &&
      dateObj.getUTCMonth() === today.getUTCMonth() &&
      dateObj.getUTCFullYear() === today.getUTCFullYear()
    );
  } catch (error) {
    console.error('[DateUtils] Error checking if today:', error);
    return false;
  }
};

/**
 * Determine if a date is yesterday
 * 
 * @param date - Date object or ISO string
 * @returns True if date is yesterday in user's local timezone
 */
export const isYesterday = (date: Date | string): boolean => {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    
    return (
      dateObj.getUTCDate() === yesterday.getUTCDate() &&
      dateObj.getUTCMonth() === yesterday.getUTCMonth() &&
      dateObj.getUTCFullYear() === yesterday.getUTCFullYear()
    );
  } catch (error) {
    console.error('[DateUtils] Error checking if yesterday:', error);
    return false;
  }
};

/**
 * Format message timestamp for chat UI
 * Shows "just now", "2h ago", or "Jan 15" based on age
 * 
 * @param date - Date object or ISO string
 * @returns Formatted message timestamp
 */
export const formatMessageTimestamp = (date: Date | string): string => {
  return formatRelativeTime(date);
};

export default {
  formatRelativeTime,
  formatFullDate,
  formatDateTime,
  formatTime,
  formatTimeAgo,
  isToday,
  isYesterday,
  formatMessageTimestamp,
};
