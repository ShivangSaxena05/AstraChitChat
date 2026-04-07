/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Chat & Message Data Normalizer
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Handles null/missing values in Chat and Message data from the API.
 * Use this in your frontend to ensure data consistency before rendering.
 * 
 * Usage:
 *   import { normalizeChat, normalizeMessage } from '@/utils/dataNormalizer';
 *   
 *   const chat = normalizeChat(apiResponse.chat);
 *   const message = normalizeMessage(apiResponse.message);
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * Normalize Chat document
 * - Handles missing/null fields
 * - Ensures type compliance
 * - Provides sensible defaults
 */
export const normalizeChat = (chat) => {
    if (!chat) {
        throw new Error('Chat document is required');
    }

    return {
        // Required fields
        _id: chat._id,
        convoType: chat.convoType || 'direct',
        participants: Array.isArray(chat.participants) ? chat.participants : [],
        createdAt: chat.createdAt || new Date(),
        updatedAt: chat.updatedAt || new Date(),
        __v: chat.__v ?? 0,

        // Direct chat fields
        groupName: chat.convoType === 'direct' ? '' : (chat.groupName || ''),
        groupAvatar: chat.groupAvatar || null,

        // Last message for preview
        lastMessage: chat.lastMessage
            ? {
                  text: chat.lastMessage.text || '',
                  sender: chat.lastMessage.sender,
                  msgType: chat.lastMessage.msgType || 'text',
                  createdAt: chat.lastMessage.createdAt || new Date(),
              }
            : null,

        // Activity tracking
        lastActivityTimestamp: chat.lastActivityTimestamp || chat.updatedAt || new Date(),
    };
};

/**
 * Normalize Message document
 * - Handles missing/null fields
 * - Ensures type compliance
 * - Provides sensible defaults
 */
export const normalizeMessage = (message) => {
    if (!message) {
        throw new Error('Message document is required');
    }

    return {
        // Required fields
        _id: message._id,
        chat: message.chat,
        sender: message.sender,
        receiver: message.receiver || null,
        createdAt: message.createdAt || new Date(),
        updatedAt: message.updatedAt || new Date(),
        __v: message.__v ?? 0,

        // Content fields
        bodyText: message.bodyText || '',
        msgType: ['text', 'image', 'video', 'file', 'audio'].includes(message.msgType)
            ? message.msgType
            : 'text',

        // Media attachments
        attachments: Array.isArray(message.attachments) ? message.attachments : [],

        // Read & delivery receipts
        readBy: Array.isArray(message.readBy) ? message.readBy : [],
        deliveredTo: Array.isArray(message.deliveredTo) ? message.deliveredTo : [],

        // Soft delete
        isDeleted: message.isDeleted === true,
        deletedFor: Array.isArray(message.deletedFor) ? message.deletedFor : [],

        // Reply/Quote functionality
        replyTo: message.replyTo || null,
        replyPreview: message.replyPreview || null,
        quotedMsgId: message.quotedMsgId || null,
        quotedMessage: message.quotedMessage || null,

        // Message status
        status: ['sending', 'sent', 'delivered', 'read', 'failed'].includes(message.status)
            ? message.status
            : 'sent',

        // Editing & unsending
        editedAt: message.editedAt || null,
        unsentAt: message.unsentAt || null,
        unsentBy: message.unsentBy || null,

        // Encryption fields
        encryptedBody: message.encryptedBody || null,
        nonce: message.nonce || null,
    };
};

/**
 * Normalize array of Chat documents
 */
export const normalizeChats = (chats) => {
    if (!Array.isArray(chats)) {
        return [];
    }
    return chats.map(normalizeChat);
};

/**
 * Normalize array of Message documents
 */
export const normalizeMessages = (messages) => {
    if (!Array.isArray(messages)) {
        return [];
    }
    return messages.map(normalizeMessage);
};

/**
 * Validate chat data before using
 * Returns validation result: { isValid: boolean, errors: string[] }
 */
export const validateChat = (chat) => {
    const errors = [];

    if (!chat._id) errors.push('Missing _id');
    if (!chat.participants || !Array.isArray(chat.participants)) {
        errors.push('Missing or invalid participants array');
    }
    if (!['direct', 'group'].includes(chat.convoType)) {
        errors.push(`Invalid convoType: ${chat.convoType}`);
    }
    if (chat.convoType === 'group' && !chat.groupName) {
        errors.push('Group chat missing groupName');
    }

    return {
        isValid: errors.length === 0,
        errors,
    };
};

/**
 * Validate message data before using
 * Returns validation result: { isValid: boolean, errors: string[] }
 */
export const validateMessage = (message) => {
    const errors = [];

    if (!message._id) errors.push('Missing _id');
    if (!message.chat) errors.push('Missing chat reference');
    if (!message.sender) errors.push('Missing sender');
    if (!['text', 'image', 'video', 'file', 'audio'].includes(message.msgType)) {
        errors.push(`Invalid msgType: ${message.msgType}`);
    }
    if (!['sending', 'sent', 'delivered', 'read', 'failed'].includes(message.status)) {
        errors.push(`Invalid status: ${message.status}`);
    }
    if (typeof message.isDeleted !== 'boolean') {
        errors.push('isDeleted should be boolean');
    }

    return {
        isValid: errors.length === 0,
        errors,
    };
};
