const express = require('express');
const {
    getChats,
    getChatMessages,
    findChat,
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
    clearChat,
    sendEncryptedMessage,
    getEncryptedChatMessages
} = require('../controllers/chatController');

const { protect } = require('../middleware/auth');
const { leaveGroup, addGroupMember, removeGroupMember } = require('../controllers/groupManagement');
const { validateRequest } = require('../middleware/validateRequest');
const {
  createChatValidator,
  createGroupChatValidator,
  sendMessageValidator,
  sendEncryptedMessageValidator,
  editMessageValidator,
  deleteMessageValidator,
  unsendMessageValidator,
  markMessageAsReadValidator,
  markAllMessagesAsReadValidator,
  addReactionValidator,
  removeReactionValidator,
  muteChatValidator,
  pinChatValidator,
  clearChatValidator,
  getChatMessagesValidator,
  searchChatsValidator,
  addGroupMemberValidator,
  removeGroupMemberValidator,
  leaveGroupValidator,
} = require('../validators/messageValidators');

const router = express.Router();

// ── Static routes first ──────────────────────────────────────
router.get('/search', protect, validateRequest({ querySchema: searchChatsValidator }), searchChats);

// Find existing chat with a user
router.get('/find/:userId', protect, validateRequest({}), findChat);

// Get user online status
router.get('/user-status/:userId', protect, validateRequest({}), getUserStatus);
router.post('/create', protect, validateRequest({ bodySchema: createChatValidator }), createChat);
router.post('/group', protect, validateRequest({ bodySchema: createGroupChatValidator }), createGroupChat);
router.post('/read-all', protect, validateRequest({ bodySchema: markAllMessagesAsReadValidator }), markAllMessagesAsRead);

// ── Message-specific routes (before /:chatId wildcard) ───────
router.post('/messages/:messageId/read', protect, validateRequest({ bodySchema: markMessageAsReadValidator }), markMessageAsRead);
router.put('/messages/:messageId', protect, validateRequest({ bodySchema: editMessageValidator }), editMessage);
router.delete('/messages/:messageId/unsend', protect, validateRequest({ bodySchema: unsendMessageValidator }), unsendMessage);
router.delete('/messages/:messageId', protect, validateRequest({ bodySchema: deleteMessageValidator }), deleteMessage);
router.get('/messages/:messageId/receipts', protect, validateRequest({}), getMessageReceipts);
router.post('/messages/:messageId/reactions', protect, validateRequest({ bodySchema: addReactionValidator }), addReaction);
router.delete('/messages/:messageId/reactions/:emoji', protect, validateRequest({ bodySchema: removeReactionValidator }), removeReaction);
router.get('/messages/:messageId/reactions', protect, validateRequest({}), getMessageReactions);

// ── Wildcard /:chatId routes last ────────────────────────────
router.get('/', protect, validateRequest({}), getChats);
router.post('/', protect, validateRequest({ bodySchema: sendMessageValidator }), sendMessage);
router.get('/:chatId/messages', protect, validateRequest({ paramsSchema: getChatMessagesValidator }), getChatMessages);
router.post('/:chatId/messages', protect, validateRequest({ bodySchema: sendMessageValidator }), sendMessage);
router.get('/:chatId/encrypted-messages', protect, validateRequest({}), getEncryptedChatMessages);
router.post('/:chatId/encrypted-messages', protect, validateRequest({ bodySchema: sendEncryptedMessageValidator }), sendEncryptedMessage);
router.get('/:chatId/info', protect, validateRequest({}), getChatInfo);
router.get('/:chatId/media', protect, validateRequest({}), getChatMedia);
router.post('/:chatId/mute', protect, validateRequest({ bodySchema: muteChatValidator }), muteChat);
router.post('/:chatId/pin', protect, validateRequest({ bodySchema: pinChatValidator }), pinChat);
router.post('/:chatId/clear', protect, validateRequest({ bodySchema: clearChatValidator }), clearChat);
router.post('/:chatId/leave', protect, validateRequest({ bodySchema: leaveGroupValidator }), leaveGroup);
router.post('/:chatId/add-member', protect, validateRequest({ bodySchema: addGroupMemberValidator }), addGroupMember);
router.post('/:chatId/remove-member', protect, validateRequest({ bodySchema: removeGroupMemberValidator }), removeGroupMember);

module.exports = router;
