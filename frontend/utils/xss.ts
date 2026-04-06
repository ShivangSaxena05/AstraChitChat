/**
 * XSS Prevention Utility
 * All user-generated content must be sanitized before rendering
 * This module provides centralized HTML escaping and message validation
 */

const HTML_ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#x60;',
  '/': '&#x2F;',
};

/**
 * Escape all HTML special characters
 * Safe for rendering in <Text> components
 * 
 * @param text - Raw text that may contain HTML special characters
 * @returns HTML-escaped text safe for rendering
 * 
 * @example
 * escapeHtml('<script>alert(1)</script>') 
 * // Returns: '&lt;script&gt;alert(1)&lt;&#x2F;script&gt;'
 */
export const escapeHtml = (text: string): string => {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/[&<>"'`\/]/g, (char) => HTML_ENTITY_MAP[char] || char);
};

/**
 * Sanitize message text
 * Escapes all HTML and trims whitespace
 * 
 * @param text - Message text to sanitize
 * @returns Sanitized message text
 */
export const sanitizeMessage = (text: string): string => {
  return escapeHtml(text).trim();
};

/**
 * Message interface matching the app's Message type
 */
interface Message {
  _id: string;
  bodyText?: string;
  content?: string;
  quotedMessage?: {
    _id: string;
    bodyText?: string;
    sender?: {
      _id: string;
      username: string;
    };
    msgType?: string;
  };
  [key: string]: any;
}

/**
 * Sanitize entire message object
 * Includes quoted messages (recursive sanitization)
 * Preserves all other properties unchanged
 * 
 * @param msg - Message object to sanitize
 * @returns New message object with sanitized text fields
 * 
 * @example
 * sanitizeMessageObject({
 *   _id: '123',
 *   bodyText: '<script>alert(1)</script>',
 *   quotedMessage: { bodyText: '<img src=x onerror="alert(2)">' }
 * })
 * // Returns: {
 * //   _id: '123',
 * //   bodyText: '&lt;script&gt;alert(1)&lt;/script&gt;',
 * //   quotedMessage: { bodyText: '&lt;img src=x onerror="alert(2)"&gt;' }
 * // }
 */
export const sanitizeMessageObject = (msg: any): any => {
  if (!msg || typeof msg !== 'object') return msg;

  return {
    ...msg,
    bodyText: msg.bodyText ? sanitizeMessage(msg.bodyText) : (msg.bodyText || ''),
    content: msg.content ? sanitizeMessage(msg.content) : (msg.content || ''),
    quotedMessage: msg.quotedMessage
      ? {
          ...msg.quotedMessage,
          bodyText: msg.quotedMessage.bodyText ? sanitizeMessage(msg.quotedMessage.bodyText) : (msg.quotedMessage.bodyText || ''),
        }
      : msg.quotedMessage,
  };
};

/**
 * Validate message doesn't contain dangerous content patterns
 * Defense-in-depth: even after escaping, reject suspicious patterns
 * This prevents protocol-based XSS and other advanced attacks
 * 
 * @param text - Message text to validate
 * @returns true if message passes validation, false if suspicious
 * 
 * @example
 * validateMessageContent('<script>alert(1)</script>') // false
 * validateMessageContent('Hello world') // true
 * validateMessageContent('javascript:void(0)') // false
 */
export const validateMessageContent = (text: string): boolean => {
  if (!text || typeof text !== 'string') return false;

  // Check for unescaped HTML-like content
  // Look for angle brackets that would indicate tags
  const htmlTagRegex = /<[^>]*>/;
  if (htmlTagRegex.test(text)) {
    console.warn(
      '[Security] Message contains HTML-like content:',
      text.substring(0, 100)
    );
    return false;
  }

  // Check for script-like patterns (case-insensitive)
  if (/javascript:|on\w+=|<script|eval\(|function\(/i.test(text)) {
    console.warn('[Security] Message contains suspicious script patterns');
    return false;
  }

  // Check for protocol handlers that can trigger execution
  if (/data:|vbscript:|about:|chrome:|file:|blob:|intent:/i.test(text)) {
    console.warn('[Security] Message contains dangerous protocol');
    return false;
  }

  // Check for Unicode escape sequences that could bypass filters
  if (/\\u[0-9a-f]{4}|\\x[0-9a-f]{2}/i.test(text)) {
    console.warn('[Security] Message contains suspicious Unicode escapes');
    return false;
  }

  return true;
};

/**
 * Comprehensive message validation for incoming messages
 * Combines type validation, size validation, and content validation
 * Fail-closed: invalid messages are rejected
 * 
 * @param message - Any incoming message object
 * @returns true if message passes all validation checks, false if invalid
 * 
 * Security checks:
 * - Message ID must be a non-empty string
 * - Body text must be a string (can be empty after sending)
 * - Created at must be a valid date string
 * - Message size limited to 10,000 characters (prevents DOS)
 * - Content must not contain suspicious patterns
 * - Quoted messages (if present) also validated recursively
 */
export const validateIncomingMessage = (message: any): boolean => {
  try {
    // Type validation
    if (!message || typeof message !== 'object') {
      console.warn('[Security] Invalid message type');
      return false;
    }

    // Message ID validation
    if (!message._id || typeof message._id !== 'string') {
      console.warn('[Security] Invalid or missing message ID');
      return false;
    }

    // Body text type validation (must be string, can be empty)
    if (message.bodyText && typeof message.bodyText !== 'string') {
      console.warn('[Security] Invalid bodyText type');
      return false;
    }

    // Created at validation
    if (!message.createdAt || typeof message.createdAt !== 'string') {
      console.warn('[Security] Invalid or missing createdAt');
      return false;
    }

    // Verify createdAt is a valid ISO date
    if (isNaN(new Date(message.createdAt).getTime())) {
      console.warn('[Security] createdAt is not a valid date:', message.createdAt);
      return false;
    }

    // Size validation (prevent DOS attacks)
    const messageLength = (message.bodyText || '').length;
    if (messageLength > 10000) {
      console.warn('[Security] Message too large:', messageLength, 'bytes');
      return false;
    }

    // Content validation (detect XSS patterns)
    if (message.bodyText && !validateMessageContent(message.bodyText)) {
      return false;
    }

    // Quote validation (if present)
    if (message.quotedMessage) {
      if (!message.quotedMessage._id || typeof message.quotedMessage._id !== 'string') {
        console.warn('[Security] Invalid quoted message ID');
        return false;
      }

      if (message.quotedMessage.bodyText && typeof message.quotedMessage.bodyText !== 'string') {
        console.warn('[Security] Invalid quoted message bodyText type');
        return false;
      }

      const quotedLength = (message.quotedMessage.bodyText || '').length;
      if (quotedLength > 10000) {
        console.warn('[Security] Quoted message too large:', quotedLength, 'bytes');
        return false;
      }

      if (message.quotedMessage.bodyText && !validateMessageContent(message.quotedMessage.bodyText)) {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('[Security] Message validation exception:', error);
    return false; // Fail closed on any exception
  }
};

/**
 * Validate sender information to prevent impersonation
 * 
 * @param sender - Sender object to validate
 * @returns true if sender object is valid
 */
export const validateSender = (sender: any): boolean => {
  if (!sender || typeof sender !== 'object') return false;
  if (!sender._id || typeof sender._id !== 'string') return false;
  if (!sender.username || typeof sender.username !== 'string') return false;
  return true;
};

/**
 * Security logging utility
 * Logs security events with structured format
 * Useful for monitoring and debugging security issues
 */
export const logSecurityEvent = (
  eventType: 'xss_attempt' | 'injection_attempt' | 'protocol_attack' | 'size_violation' | 'validation_failure',
  details: Record<string, any>,
  severity: 'low' | 'medium' | 'high' | 'critical' = 'high'
) => {
  const timestamp = new Date().toISOString();
  console.warn(`[Security][${severity.toUpperCase()}] ${eventType}`, {
    timestamp,
    ...details,
  });

  // In production, could send to error tracking service (Sentry, etc.)
  // Example: Sentry.captureMessage(`Security: ${eventType}`, 'warning');
};
