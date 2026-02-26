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
 * Update chat activity when a new message is sent
 * @param {string} chatId - The chat ID
 * @param {string} messageId - The message ID
 * @param {string} senderId - The sender's user ID
 * @returns {Promise<Date>} The timestamp of the activity
 */
async function updateChatOnNewMessage(chatId, messageId, senderId) {
    const now = new Date();
    const User = require('../models/User');
    const sender = await User.findById(senderId).select('username profilePicture');
    await Chat.findByIdAndUpdate(chatId, {
        lastMessage: {
            text: '', // Will be populated from message bodyText
            createdAt: now,
            sender: senderId
        },
        lastActivityTimestamp: now,
        $inc: { [`unreadCount.${senderId}`]: 0 } // Initialize if not exists
    }, { upsert: true });

    return now;
}

/**
 * Increment unread count for all participants except sender
 * @param {string} chatId - The chat ID
 * @param {string} senderId - The sender's user ID (excluded from unread)
 * @returns {Promise<void>}
 */
async function incrementUnreadCount(chatId, senderId) {
    const chat = await Chat.findById(chatId).lean();
    if (!chat) return;

    // Get all participant IDs except sender
    const participantIds = chat.participants
        .map(p => p.user ? p.user.toString() : p.toString())
        .filter(id => id !== senderId);

    // Build update object to increment unread for each participant
    const updateObj = {};
    participantIds.forEach(id => {
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
    const now = new Date();
    await Chat.findByIdAndUpdate(chatId, {
        lastActivityTimestamp: now
    });
    return now;
}

/**
 * Mark messages as read for a user
 * @param {string} chatId - The chat ID
 * @param {string} userId - The user's ID
 * @returns {Promise<void>}
 */
async function markChatAsRead(chatId, userId) {
    // Set the user's unread count to 0
    await Chat.findByIdAndUpdate(chatId, {
        [`unreadCount.${userId}`]: 0
    });
}

/**
 * Get chat with proper activity timestamp
 * Returns lastActivityTimestamp or falls back to updatedAt
 * @param {string} chatId - The chat ID
 * @returns {Promise<Object>} The chat with computed activity time
 */
async function getChatWithActivity(chatId) {
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
    const update = isPinned
        ? { $addToSet: { isPinnedBy: userId } }
        : { $pull: { isPinnedBy: userId } };
    
    await Chat.findByIdAndUpdate(chatId, update);
}

module.exports = {
    updateChatOnNewMessage,
    incrementUnreadCount,
    updateChatTimestamp,
    markChatAsRead,
    getChatWithActivity,
    togglePinChat
};