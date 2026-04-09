/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Chat Sanitizer Utility
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Normalize and sanitize chat data before sending to frontend
 * - Ensures no null/undefined crashes
 * - Provides consistent data structure for direct & group chats
 * - Extracts easy-access fields (otherUser for direct, consistent display names)
 * - Validates all nested objects are properly populated
 * 
 * Usage:
 *   const sanitized = sanitizeChatForResponse(chat, userId);
 *   res.json(sanitized);
 */

const { applyUserDefaults } = require('./lazyDefaults');

/**
 * ✅ MAIN SANITIZER FUNCTION
 * 
 * Normalizes a chat object for API response:
 * - Fixes empty groupName to null for direct chats
 * - Extracts otherUser for direct chats (easy frontend access)
 * - Ensures groupName/groupAvatar exist for group chats
 * - Validates participants are populated
 * - Ensures lastMessage sender is populated
 * - Applies user defaults to all user objects
 * 
 * @param {Object} chat - Chat document (can be Mongoose document or plain object)
 * @param {String|ObjectId} userId - Current user ID (for extracting otherUser)
 * @returns {Object} Sanitized chat object safe for frontend consumption
 */
function sanitizeChatForResponse(chat, userId) {
  if (!chat) return null;

  // Convert to plain object if Mongoose document
  let chatObj = chat.toObject?.() || { ...chat };

  // Ensure basic structure
  if (!chatObj._id) chatObj._id = chatObj._id || null;
  if (!chatObj.convoType) chatObj.convoType = 'direct';
  if (!chatObj.participants) chatObj.participants = [];
  if (!chatObj.createdAt) chatObj.createdAt = new Date();
  if (!chatObj.updatedAt) chatObj.updatedAt = new Date();

  // ✅ CRITICAL FIX #1: Handle empty groupName for direct chats
  // Problem: Some direct chats have groupName: "" instead of null
  if (chatObj.convoType === 'direct') {
    // Remove empty/null groupName for direct chats
    if (!chatObj.groupName || (typeof chatObj.groupName === 'string' && chatObj.groupName.trim().length === 0)) {
      chatObj.groupName = null;
    }
    // Direct chats should not have groupAvatar
    if (!chatObj.groupAvatar || Object.keys(chatObj.groupAvatar || {}).length === 0) {
      chatObj.groupAvatar = null;
    }
  }

  // ✅ CRITICAL FIX #2: Ensure group chats have groupName
  if (chatObj.convoType === 'group') {
    if (!chatObj.groupName || (typeof chatObj.groupName === 'string' && chatObj.groupName.trim().length === 0)) {
      // Extract from first few participants' names if groupName missing
      const participantNames = chatObj.participants
        ?.slice(0, 3)
        ?.map(p => {
          if (p?.user?.name) return p.user.name;
          if (p?.user?.username) return p.user.username;
          return 'User';
        })
        ?.filter(Boolean) || [];

      chatObj.groupName = participantNames.length > 0 
        ? participantNames.join(', ')
        : 'Group Chat';
    }

    // Ensure groupAvatar structure or null
    if (chatObj.groupAvatar && typeof chatObj.groupAvatar === 'object') {
      if (!chatObj.groupAvatar.secure_url) {
        chatObj.groupAvatar = null;  // Invalid avatar object
      }
    } else {
      chatObj.groupAvatar = null;
    }
  }

  // ✅ Normalize participants array
  const normalizedParticipants = (chatObj.participants || [])
    .map(p => {
      // Handle both old format (raw ObjectId) and new format (object with user)
      if (!p) return null;

      const participantObj = {
        user: null,
        role: p.role || 'member',
        joinedAt: p.joinedAt || new Date(),
        lastReadMsgId: p.lastReadMsgId || null,
      };

      // Extract user object
      if (p.user) {
        participantObj.user = p.user;
      }

      // Apply lazy defaults if user is populated
      if (participantObj.user && typeof participantObj.user === 'object' && participantObj.user._id) {
        participantObj.user = applyUserDefaults(participantObj.user);
      }

      return participantObj;
    })
    .filter(p => p && p.user); // Filter out invalid participants

  // ✅ CRITICAL FIX #3: Extract otherUser for direct chats
  let otherUser = null;
  if (chatObj.convoType === 'direct' && normalizedParticipants.length > 0) {
    // For direct chats, find the user that is NOT the current user
    const currentUserStr = userId?.toString?.() || userId?.toString() || userId;
    const other = normalizedParticipants.find(
      p => p.user?._id?.toString() !== currentUserStr
    );

    if (other?.user) {
      otherUser = applyUserDefaults(other.user);
    }

    // Fallback: If only one participant (shouldn't happen), use that if it's not the current user
    if (!otherUser && normalizedParticipants.length === 1) {
      if (normalizedParticipants[0].user?._id?.toString() !== currentUserStr) {
        otherUser = applyUserDefaults(normalizedParticipants[0].user);
      }
    }
  }

  // ✅ Normalize lastMessage
  let lastMessageObj = null;
  if (chatObj.lastMessage) {
    lastMessageObj = {
      _id: chatObj.lastMessage._id || undefined,
      text: chatObj.lastMessage.text || '[Message]',
      bodyText: chatObj.lastMessage.bodyText || chatObj.lastMessage.text || '[Message]',
      msgType: chatObj.lastMessage.msgType || 'text',
      sender: null,
      createdAt: chatObj.lastMessage.createdAt || new Date(),
    };

    // Ensure lastMessage sender is populated with user details
    if (chatObj.lastMessage.sender) {
      if (typeof chatObj.lastMessage.sender === 'object' && chatObj.lastMessage.sender._id) {
        lastMessageObj.sender = applyUserDefaults(chatObj.lastMessage.sender);
      } else {
        // Just ObjectId - try to set something
        lastMessageObj.sender = {
          _id: chatObj.lastMessage.sender,
          username: 'User',
          profilePicture: '',
          name: 'User',
        };
      }
    }
  }

  // ✅ Build final sanitized response
  const sanitized = {
    _id: chatObj._id,
    convoType: chatObj.convoType,
    participants: normalizedParticipants,
    
    // ✅ FIX: Include display-friendly fields
    groupName: chatObj.groupName,
    groupAvatar: chatObj.groupAvatar,
    otherUser: otherUser,  // For direct chats, quick access to the chat partner
    
    lastMessage: lastMessageObj,
    lastActivityTimestamp: chatObj.lastActivityTimestamp || chatObj.updatedAt || new Date(),
    createdAt: chatObj.createdAt,
    updatedAt: chatObj.updatedAt,
    
    // Include other important fields if present
    unreadCount: chatObj.unreadCount || 0,
    lastReadMsgId: chatObj.lastReadMsgId || null,
    unreadCounts: chatObj.unreadCounts || [],
  };

  return sanitized;
}

/**
 * ✅ BATCH SANITIZER
 * 
 * Sanitizes an array of chats efficiently
 * 
 * @param {Array} chats - Array of chat documents
 * @param {String|ObjectId} userId - Current user ID
 * @returns {Array} Array of sanitized chats
 */
function sanitizeChatsForResponse(chats, userId) {
  if (!Array.isArray(chats)) return [];
  return chats.map(chat => sanitizeChatForResponse(chat, userId)).filter(c => c !== null);
}

/**
 * ✅ SAFE MESSAGE SENDER GETTER
 * 
 * Ensures message sender is properly populated with user details
 * 
 * @param {Object} message - Message document
 * @returns {Object} Message with properly populated sender
 */
function ensureMessageSenderPopulated(message) {
  if (!message) return null;

  const msg = message.toObject?.() || { ...message };

  if (msg.sender) {
    if (typeof msg.sender === 'object' && msg.sender._id) {
      msg.sender = applyUserDefaults(msg.sender);
    } else {
      // Just ObjectId - create minimal user object
      msg.sender = {
        _id: msg.sender,
        username: 'Unknown User',
        profilePicture: '',
        name: 'Unknown',
      };
    }
  }

  // Also ensure quotedMsgId sender is populated
  if (msg.quotedMsgId && typeof msg.quotedMsgId === 'object' && msg.quotedMsgId.sender) {
    if (typeof msg.quotedMsgId.sender === 'object' && msg.quotedMsgId.sender._id) {
      msg.quotedMsgId.sender = applyUserDefaults(msg.quotedMsgId.sender);
    }
  }

  return msg;
}

module.exports = {
  sanitizeChatForResponse,
  sanitizeChatsForResponse,
  ensureMessageSenderPopulated,
};
