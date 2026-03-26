const express = require('express');
const { protect } = require('../middleware/auth');
const {
    getChats, getChatMessages, createChat, searchChats,
    sendMessage, markMessageAsRead, markAllMessagesAsRead,
    addReaction, removeReaction, editMessage, unsendMessage,
    deleteMessage, getMessageReceipts, getMessageReactions,
    getUserStatus, createGroupChat, getChatInfo, getChatMedia,
    muteChat, pinChat, clearChat
} = require('../controllers/chatController');
const { leaveGroup, addGroupMember, removeGroupMember } = require('../controllers/groupManagement');

const router = express.Router();

// ── Static routes first ──────────────────────────────────────
router.get('/search', protect, searchChats);
router.get('/user-status/:userId', protect, getUserStatus);
router.post('/create', protect, createChat);
router.post('/group', protect, createGroupChat);
router.post('/read-all', protect, markAllMessagesAsRead);

// ── Message-specific routes (before /:chatId wildcard) ───────
router.post('/messages/:messageId/read', protect, markMessageAsRead);
router.put('/messages/:messageId', protect, editMessage);
router.delete('/messages/:messageId/unsend', protect, unsendMessage);
router.delete('/messages/:messageId', protect, deleteMessage);
router.get('/messages/:messageId/receipts', protect, getMessageReceipts);
router.post('/messages/:messageId/reactions', protect, addReaction);
router.delete('/messages/:messageId/reactions/:emoji', protect, removeReaction);
router.get('/messages/:messageId/reactions', protect, getMessageReactions);

// ── Wildcard /:chatId routes last ────────────────────────────
router.get('/', protect, getChats);
router.post('/', protect, sendMessage);
router.get('/:chatId/messages', protect, getChatMessages);
router.post('/:chatId/messages', protect, sendMessage);
router.get('/:chatId/info', protect, getChatInfo);
router.get('/:chatId/media', protect, getChatMedia);
router.post('/:chatId/mute', protect, muteChat);
router.post('/:chatId/pin', protect, pinChat);
router.post('/:chatId/clear', protect, clearChat);
router.post('/:chatId/leave', protect, leaveGroup);
router.post('/:chatId/add-member', protect, addGroupMember);
router.post('/:chatId/remove-member', protect, removeGroupMember);

module.exports = router;
