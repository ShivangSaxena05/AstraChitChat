const express = require('express');
const {
    getChats,
    getChatMessages,
    createChat,
    searchChats,
    sendMessage,
    markMessageAsRead,
    markAllMessagesAsRead,
    addReaction,
    removeReaction,
    editMessage,
    unsendMessage,
    deleteMessage,
    getMessageReceipts,
    getMessageReactions,
    getUserStatus,
    createGroupChat,
    getChatInfo,
    getChatMedia,
    muteChat,
    pinChat,
    clearChat
} = require('../controllers/chatController');

// const {
//   getChats, getMessages, sendMessage,
//   markMessageAsRead, markAllMessagesAsRead,
//   editMessage, unsendMessage,
//   addReaction, removeReaction,
//   getMessageReceipts, getMessageReactions,
//   searchChats
// } = require('../controllers/chatController');


const { protect } = require('../middleware/auth');

const router = express.Router();

// Get all chats for the current user
router.get('/', protect, getChats);

// Create a new chat without sending a message
router.post('/create', protect, createChat);

// Create a new group chat
router.post('/group', protect, createGroupChat);

// Send message (auto-create chat if needed)
router.post('/', protect, sendMessage);

// Search chats by participant username or name
router.get('/search', protect, searchChats);

// Get user online status
router.get('/user-status/:userId', protect, getUserStatus);

// Get chat info
router.get('/:chatId/info', protect, getChatInfo);

// Get chat media
router.get('/:chatId/media', protect, getChatMedia);

// Chat settings
router.post('/:chatId/mute', protect, muteChat);
router.post('/:chatId/pin', protect, pinChat);
router.post('/:chatId/clear', protect, clearChat);

// ✅ NEW: Group management routes
const { leaveGroup, addGroupMember, removeGroupMember } = require('../controllers/groupManagement');
router.post('/:chatId/leave', protect, leaveGroup);
router.post('/:chatId/add-member', protect, addGroupMember);
router.post('/:chatId/remove-member', protect, removeGroupMember);

// Get messages for a specific chat
router.get('/:chatId/messages', protect, getChatMessages);

// Send a message to a specific chat
router.post('/:chatId/messages', protect, sendMessage);

// Message-specific routes
// Mark message as read
router.post('/messages/:messageId/read', protect, markMessageAsRead);

// Mark all messages in a chat as read
router.post('/read-all', protect, markAllMessagesAsRead);

// Edit message
router.put('/messages/:messageId', protect, editMessage);

// Unsend message (soft delete)
router.delete('/messages/:messageId/unsend', protect, unsendMessage);

// Hard delete message + media files
router.delete('/messages/:messageId', protect, deleteMessage);

// Get message receipts
router.get('/messages/:messageId/receipts', protect, getMessageReceipts);

// Add reaction to message
router.post('/messages/:messageId/reactions', protect, addReaction);

// Remove reaction from message
router.delete('/messages/:messageId/reactions/:emoji', protect, removeReaction);

// Get message reactions
router.get('/messages/:messageId/reactions', protect, getMessageReactions);

module.exports = router;
