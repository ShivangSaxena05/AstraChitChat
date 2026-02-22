const express = require('express');
const {
    getChats,
    getChatMessages,
    createChat,
    searchChats,
    sendMessage,
    markMessageAsRead,
    addReaction,
    removeReaction,
    editMessage,
    unsendMessage,
    getMessageReceipts,
    getMessageReactions
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

// Send message (auto-create chat if needed)
router.post('/', protect, sendMessage);

// Search chats by participant username or name
router.get('/search', protect, searchChats);

// Get messages for a specific chat
router.get('/:chatId/messages', protect, getChatMessages);

// Send a message to a specific chat
router.post('/:chatId/messages', protect, sendMessage);

// Message-specific routes
// Mark message as read
router.post('/messages/:messageId/read', protect, markMessageAsRead);

// Edit message
router.put('/messages/:messageId', protect, editMessage);

// Unsend message
router.delete('/messages/:messageId', protect, unsendMessage);

// Get message receipts
router.get('/messages/:messageId/receipts', protect, getMessageReceipts);

// Add reaction to message
router.post('/messages/:messageId/reactions', protect, addReaction);

// Remove reaction from message
router.delete('/messages/:messageId/reactions/:emoji', protect, removeReaction);

// Get message reactions
router.get('/messages/:messageId/reactions', protect, getMessageReactions);

module.exports = router;
