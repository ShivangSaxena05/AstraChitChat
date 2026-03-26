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
 * Increment unread count for all participants except sender
 * @param {string} chatId - The chat ID
 * @param {string} senderId - The sender's user ID (excluded from unread)
 * @returns {Promise<void>}
 */
async function incrementUnreadCount(chatId, senderId, participantIds) {
    validateId(chatId, 'chatId');
    validateId(senderId, 'senderId');
    participantIds.forEach(id => validateId(id, 'participantId'));

    const updateObj = {};
    participantIds
        .filter(id => id !== senderId)
        .forEach(id => {
            updateObj[`unreadCount.${id}`] = 1;
        });

    if (Object.keys(updateObj).length > 0) {
        await Chat.findByIdAndUpdate(chatId, { $inc: updateObj });
    }
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
 * Mark messages as read for a user
 * @param {string} chatId - The chat ID
 * @param {string} userId - The user's ID
 * @returns {Promise<void>}
 */
async function markChatAsRead(chatId, userId) {
    validateId(chatId, 'chatId');
    validateId(userId, 'userId');

    // Set the user's unread count to 0
    await Chat.findByIdAndUpdate(chatId, {
        $set: { [`unreadCount.${userId}`]: 0 }
    });
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

/**
 * Pin/Unpin chat for a user
 * @param {string} chatId - The chat ID
 * @param {string} userId - The user's ID
 * @param {boolean} isPinned - Whether to pin or unpin
 * @returns {Promise<void>}
 */
async function togglePinChat(chatId, userId, isPinned) {
    validateId(chatId, 'chatId');
    validateId(userId, 'userId');

    const update = isPinned
        ? { $addToSet: { isPinnedBy: userId } }
        : { $pull: { isPinnedBy: userId } };
    
    const updated = await Chat.findByIdAndUpdate(chatId, update);
    if (!updated) {
        throw new Error(`Chat not found: ${chatId}`);
    }
}

module.exports = {
    updateChatOnNewMessage,
    incrementUnreadCount,
    updateChatTimestamp,
    markChatAsRead,
    getChatWithActivity,
    togglePinChat
};