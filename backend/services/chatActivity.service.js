/**
 * ChatActivity Service
 * 
 * Centralized service for handling all chat activity updates.
 * This ensures single source of truth for chat activity timestamps.
 * 
 * All events (message sent, reaction, delete, edit) should call this service.
 */

const Chat = require('../models/Chat');
const mongoose = require('mongoose');

/**
 * Validate ObjectId and throw meaningful error
 */
function validateId(id, name = 'ID') {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error(`Invalid ${name}: ${id}`);
    }
}

/**
 * Update chat activity when a new message is sent
 * @param {string} chatId - The chat ID
 * @param {string} messageId - The message ID
 * @param {string} senderId - The sender's user ID
 * @param {string} messageText - The message text or description
 * @returns {Promise<Date>} The timestamp of the activity
 */
async function updateChatOnNewMessage(chatId, messageId, senderId, messageText = '') {
    validateId(chatId, 'chatId');
    validateId(messageId, 'messageId');
    validateId(senderId, 'senderId');

    const now = new Date();
    const updated = await Chat.findByIdAndUpdate(chatId, {
        lastMessage: {
            messageId,
            text: messageText,
            createdAt: now,
            sender: senderId
        },
        lastActivityTimestamp: now
    });

    if (!updated) {
        throw new Error(`Chat not found: ${chatId}`);
    }

    return now;
}

/**
 * Update chat activity timestamp (for reactions, edits, deletes)
 * @param {string} chatId - The chat ID
 * @returns {Promise<Date>} The new timestamp
 */
async function updateChatTimestamp(chatId) {
    validateId(chatId, 'chatId');

    const now = new Date();
    const updated = await Chat.findByIdAndUpdate(chatId, {
        lastActivityTimestamp: now
    });

    if (!updated) {
        throw new Error(`Chat not found: ${chatId}`);
    }
    return now;
}

/**
 * Get chat with proper activity timestamp
 * Returns lastActivityTimestamp or falls back to updatedAt
 * @param {string} chatId - The chat ID
 * @returns {Promise<Object>} The chat with computed activity time
 */
async function getChatWithActivity(chatId) {
    validateId(chatId, 'chatId');

    const chat = await Chat.findById(chatId)
        .populate('lastMessage.sender', 'name username profilePicture')
        .populate('participants.user', 'name username profilePicture')
        .lean();
    
    if (!chat) return null;
    
    // Use lastActivityTimestamp if available, otherwise use updatedAt
    chat.lastActivityTimestamp = chat.lastActivityTimestamp || chat.updatedAt;
    
    return chat;
}

module.exports = {
    updateChatOnNewMessage,
    updateChatTimestamp,
    getChatWithActivity
};