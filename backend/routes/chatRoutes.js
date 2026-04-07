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
const {
  chatLimiter,
  messageLimiter,
  editMessageLimiter,
  deleteMessageLimiter,
  createChatLimiter,
  searchLimiter,
} = require('../middleware/rateLimiter');

const router = express.Router();

// ── Static routes first ──────────────────────────────────────
// FIX: Add searchLimiter to prevent search spam
router.get('/search', protect, searchLimiter, validateRequest({ querySchema: searchChatsValidator }), searchChats);

// Find existing chat with a user
router.get('/find/:userId', protect, validateRequest({}), findChat);

// Get user online status
router.get('/user-status/:userId', protect, validateRequest({}), getUserStatus);

// FIX: Add createChatLimiter to prevent spam chat creation
router.post('/create', protect, createChatLimiter, validateRequest({ bodySchema: createChatValidator }), createChat);

// FIX: Add createChatLimiter to group chat creation
router.post('/group', protect, createChatLimiter, validateRequest({ bodySchema: createGroupChatValidator }), createGroupChat);

// FIX: Add chatLimiter to mark all as read
router.post('/read-all', protect, chatLimiter, validateRequest({ bodySchema: markAllMessagesAsReadValidator }), markAllMessagesAsRead);

// ── Message-specific routes (before /:chatId wildcard) ───────
// FIX: Add chatLimiter to mark read operations
router.post('/messages/:messageId/read', protect, chatLimiter, validateRequest({ bodySchema: markMessageAsReadValidator }), markMessageAsRead);

// FIX: Add editMessageLimiter to prevent edit spam
router.put('/messages/:messageId', protect, editMessageLimiter, validateRequest({ bodySchema: editMessageValidator }), editMessage);

// FIX: Add deleteMessageLimiter to prevent delete spam
router.delete('/messages/:messageId/unsend', protect, deleteMessageLimiter, validateRequest({ bodySchema: unsendMessageValidator }), unsendMessage);

// FIX: Add deleteMessageLimiter to prevent delete spam
router.delete('/messages/:messageId', protect, deleteMessageLimiter, validateRequest({ bodySchema: deleteMessageValidator }), deleteMessage);

// FIX: Add chatLimiter to receipt queries
router.get('/messages/:messageId/receipts', protect, chatLimiter, validateRequest({}), getMessageReceipts);

// FIX: Add chatLimiter to reaction operations
router.post('/messages/:messageId/reactions', protect, chatLimiter, validateRequest({ bodySchema: addReactionValidator }), addReaction);

router.delete('/messages/:messageId/reactions/:emoji', protect, chatLimiter, validateRequest({ bodySchema: removeReactionValidator }), removeReaction);

router.get('/messages/:messageId/reactions', protect, chatLimiter, validateRequest({}), getMessageReactions);

// ── Wildcard /:chatId routes last ────────────────────────────
router.get('/', protect, validateRequest({}), getChats);

// ✅ FIX: sendMessage supports both routes with messageLimiter:
// - POST / sends message by receiverId (finds/creates chat automatically)
// - POST /:chatId/messages sends message to existing chat using chatId
router.post('/', protect, messageLimiter, validateRequest({ bodySchema: sendMessageValidator }), sendMessage);

router.get('/:chatId/messages', protect, validateRequest({ paramsSchema: getChatMessagesValidator }), getChatMessages);

router.post('/:chatId/messages', protect, messageLimiter, validateRequest({ bodySchema: sendMessageValidator }), sendMessage);

router.get('/:chatId/encrypted-messages', protect, validateRequest({}), getEncryptedChatMessages);

router.post('/:chatId/encrypted-messages', protect, messageLimiter, validateRequest({ bodySchema: sendEncryptedMessageValidator }), sendEncryptedMessage);

router.get('/:chatId/info', protect, validateRequest({}), getChatInfo);

router.get('/:chatId/media', protect, validateRequest({}), getChatMedia);

router.post('/:chatId/mute', protect, chatLimiter, validateRequest({ bodySchema: muteChatValidator }), muteChat);

router.post('/:chatId/pin', protect, chatLimiter, validateRequest({ bodySchema: pinChatValidator }), pinChat);

router.post('/:chatId/clear', protect, chatLimiter, validateRequest({ bodySchema: clearChatValidator }), clearChat);

router.post('/:chatId/leave', protect, chatLimiter, validateRequest({ bodySchema: leaveGroupValidator }), leaveGroup);

router.post('/:chatId/add-member', protect, chatLimiter, validateRequest({ bodySchema: addGroupMemberValidator }), addGroupMember);

router.post('/:chatId/remove-member', protect, chatLimiter, validateRequest({ bodySchema: removeGroupMemberValidator }), removeGroupMember);

module.exports = router;
