// controllers/chatController.js

const mongoose = require('mongoose');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');

const toObjectId = id => new mongoose.Types.ObjectId(id);

/**
 * Helper: return minimal user info for UI (mixed strategy)
 * We use profilePicture + name + username (username may be undefined).
 * @param {Object} userDoc - mongoose user doc or plain object
 */
function minimalUser(userDoc) {
  if (!userDoc) return null;
  // userDoc may be populated object or ObjectId; handle both
  if (typeof userDoc === 'object' && userDoc._id) {
    return {
      _id: userDoc._id,
      name: userDoc.name || null,
      username: userDoc.username || null,
      profilePicture: userDoc.profilePicture || null
    };
  }
  // fallback
  return { _id: userDoc, name: null, profilePicture: null, username: null };
}

/**
 * Build chat title (username if available else name)
 * @param {Object} userDoc - populated user doc
 */
function chatTitle(userDoc) {
  if (!userDoc) return '';
  return userDoc.username ? userDoc.username : (userDoc.name || '');
}

/**
 * Convert readBy (array of {user, readAt}) to simple array of userId strings
 * @param {Array} readByArr
 */
function readByToSimple(readByArr) {
  if (!Array.isArray(readByArr)) return [];
  return readByArr.map(r => (r.user ? r.user.toString() : r.toString()));
}

/**
 * GET /api/chats
 * Get all chats for the current user (server calculates unreadCount).
 *
 * Response:
 * {
 *   chats: [
 *     {
 *       _id, convoType, title, participants: [userObjs],
 *       lastMessage: { text, createdAt },
 *       unreadCount: Number,
 *       lastReadMsgId: ObjectId|null,
 *       updatedAt
 *     }, ...
 *   ]
 * }
 */
async function getChats(req, res) {
  try {
    const userId = req.user._id.toString();

    // Find chats where current user is participant
    const chats = await Chat.find({ 'participants.user': toObjectId(userId) })
      .populate('participants.user', 'name username profilePicture')
      .populate('lastMessage.sender', 'name username profilePicture')
      .lean();

    // For each chat compute unreadCount using participants.lastReadMsgId
    const results = await Promise.all(chats.map(async (chat) => {
      // find participant entry
      const participant = chat.participants.find(p => {
        const uid = p.user && p.user._id ? p.user._id.toString() : (p.user ? p.user.toString() : null);
        return uid === userId;
      });

      const lastReadMsgId = participant && participant.lastReadMsgId ? participant.lastReadMsgId : null;

      // count messages in this chat sent by others and newer than lastReadMsgId
      const filter = { chat: toObjectId(chat._id), sender: { $ne: toObjectId(userId) } };
      if (lastReadMsgId) filter._id = { $gt: toObjectId(lastReadMsgId) };

      const unreadCount = await Message.countDocuments(filter);

      // prepare participants minimal array
      const participantsMinimal = chat.participants.map(p => minimalUser(p.user));

      // compute title for 1-to-1 chat (other user's username or name)
      // since app is 1-to-1 only for now, find the other user
      const other = participantsMinimal.find(p => p._id.toString() !== userId);

      return {
        _id: chat._id,
        convoType: chat.convoType,
        title: chat.title || chatTitle(other),
        participants: participantsMinimal,
        lastMessage: chat.lastMessage || null,
        unreadCount,
        lastReadMsgId: lastReadMsgId || null,
        updatedAt: chat.updatedAt
      };
    }));

    // sort by lastMessage.createdAt or updatedAt desc
    results.sort((a, b) => {
      const aTime = a.lastMessage && a.lastMessage.createdAt ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.updatedAt).getTime();
      const bTime = b.lastMessage && b.lastMessage.createdAt ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.updatedAt).getTime();
      return bTime - aTime;
    });

    return res.json({ chats: results });
  } catch (error) {
    console.error('getChats error:', error);
    return res.status(500).json({ message: 'Server error: could not fetch chats', error: error.message });
  }
}

/**
 * GET /api/chats/:chatId/messages
 * Get messages for a specific chat (oldest -> newest).
 * Also updates the participant's lastReadMsgId to the last message and marks the last message's readBy for current user.
 *
 * Response:
 * { messages: [ { ... message ... with sender minimal info and readBy as simple array } ] }
 */
async function getChatMessages(req, res) {
  try {
    const { chatId } = req.params;
    const userId = req.user._id.toString();

    const chat = await Chat.findById(chatId).populate('participants.user', 'name username profilePicture');
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    // ensure user is participant
    const participantIndex = chat.participants.findIndex(p => {
      const uid = p.user && p.user._id ? p.user._id.toString() : (p.user ? p.user.toString() : null);
      return uid === userId;
    });
    if (participantIndex === -1) return res.status(403).json({ message: 'Not authorized to view this chat' });

    // fetch messages
    const messages = await Message.find({ chat: toObjectId(chatId) })
      .populate('sender', 'name username profilePicture')
      .sort({ createdAt: 1 })
      .lean();

    // Update lastReadMsgId to last message (if any)
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];

      // Update participant.lastReadMsgId only if different
      const existingLastRead = chat.participants[participantIndex].lastReadMsgId;
      if (!existingLastRead || existingLastRead.toString() !== lastMsg._id.toString()) {
        chat.participants[participantIndex].lastReadMsgId = toObjectId(lastMsg._id);
        await chat.save();
      }

      // Add current user to last message's readBy (if not present)
      const lastMsgDoc = await Message.findById(lastMsg._id);
      const alreadyRead = lastMsgDoc.readBy && lastMsgDoc.readBy.some(r => r.user.toString() === userId);
      if (!alreadyRead) {
        lastMsgDoc.readBy.push({ user: toObjectId(userId), readAt: new Date() });
        await lastMsgDoc.save();
      }
    }

    // convert readBy structure to simple array of userIds for API (per your request)
    const responseMessages = messages.map(m => {
      const simpleReadBy = Array.isArray(m.readBy) ? m.readBy.map(r => (r.user ? r.user.toString() : r.toString())) : [];
      return {
        ...m,
        readBy: simpleReadBy
      };
    });

    return res.json({ messages: responseMessages });
  } catch (error) {
    console.error('getMessages error:', error);
    return res.status(500).json({ message: 'Server error: could not fetch messages', error: error.message });
  }
}

/**
 * POST /api/chats/send  (you can also use POST /api/chats/:chatId/messages)
 * Send a message. Auto-creates chat if it doesn't exist (WhatsApp-style).
 *
 * Expected req.body:
 * { receiverId, bodyText, attachments }  // attachments optional
 *
 * Response: saved message (sender populated minimally), readBy returned as simple array of userId strings
 */
async function sendMessage(req, res) {
  try {
    const senderId = req.user._id.toString();
    const { chatId } = req.params; // Check if this is for existing chat
    let { receiverId, bodyText, attachments, msgType, quotedMsgId, participants } = req.body;

    // Handle both old format (receiverId) and new format (participants array)
    if (!receiverId && participants && Array.isArray(participants) && participants.length > 0) {
      receiverId = participants[0]; // Take first participant as receiver
    }

    if (!receiverId) return res.status(400).json({ message: 'receiverId or participants is required' });
    if ((!bodyText || !bodyText.trim()) && (!attachments || attachments.length === 0)) {
      return res.status(400).json({ message: 'Message text or attachments required' });
    }

    // Ensure receiver exists
    const receiver = await User.findById(receiverId).select('_id name username profilePicture');
    if (!receiver) return res.status(404).json({ message: 'Receiver not found' });

    let chat;

    if (chatId) {
      // Sending message to existing chat
      chat = await Chat.findById(chatId).populate('participants.user', 'name username profilePicture');
      if (!chat) return res.status(404).json({ message: 'Chat not found' });

      // Ensure sender is participant
      if (!chat.participants.some(p => p.user.toString() === senderId.toString())) {
        return res.status(403).json({ message: 'Not authorized to send message to this chat' });
      }
    } else {
      // Creating new chat (auto-create on first message)
      // Try to find existing direct chat between sender and receiver
      chat = await Chat.findOne({
        convoType: 'direct',
        'participants.user': { $all: [toObjectId(senderId), toObjectId(receiverId)] }
      }).populate('participants.user', 'name username profilePicture');

      // If chat not found, create it
      if (!chat) {
        const participantObjects = [
          { user: toObjectId(senderId), role: 'member', joinedAt: new Date() },
          { user: toObjectId(receiverId), role: 'member', joinedAt: new Date() }
        ];
        chat = await Chat.create({
          convoType: 'direct',
          participants: participantObjects,
          lastMessage: null
        });
        // populate for later usage
        await chat.populate('participants.user', 'name username profilePicture');
      }
    }

    // Build message object (using your Message model fields)
    const msgObj = {
      sender: toObjectId(senderId),
      receiver: toObjectId(receiverId),
      chat: toObjectId(chat._id),
      msgType: msgType || (attachments && attachments.length ? 'image' : 'text'),
      bodyText: bodyText ? bodyText.trim() : '',
      attachments: attachments || [],
      quotedMsgId: quotedMsgId ? toObjectId(quotedMsgId) : undefined,
      readBy: [{ user: toObjectId(senderId), readAt: new Date() }] // sender has read their own message
    };

    // Save message
    const createdMessage = await Message.create(msgObj);

    // Update chat.lastMessage to show preview & time
    chat.lastMessage = {
      text: createdMessage.bodyText || (createdMessage.attachments && createdMessage.attachments.length ? 'Attachment' : ''),
      createdAt: createdMessage.createdAt,
      sender: createdMessage.sender
    };

    // Update chat participants' lastReadMsgId
    // Sender's lastReadMsgId = this message id
    const senderParticipant = chat.participants.find(p => p.user.toString() === senderId.toString());
    if (senderParticipant) senderParticipant.lastReadMsgId = createdMessage._id;

    // Receiver's lastReadMsgId should remain unchanged (so it counts as unread until they open)
    await chat.save();

    // populate sender minimally for response
    await createdMessage.populate('sender', 'name username profilePicture');

    if (chatId) {
      // For existing chat, return the message
      const response = createdMessage.toObject();
      response.readBy = readByToSimple(createdMessage.readBy);
      return res.status(201).json(response);
    } else {
      // For new chat creation, return the chat with _id
      return res.status(201).json({ _id: chat._id });
    }
  } catch (error) {
    console.error('sendMessage error:', error);
    return res.status(500).json({ message: 'Server error: could not send message', error: error.message });
  }
}

/**
 * POST /api/messages/:messageId/read
 * Mark a single message as read by current user.
 * Also updates the chat participant's lastReadMsgId if this message is newer.
 *
 * Response: { message: 'Message marked as read' }
 */
async function markMessageAsRead(req, res) {
  try {
    const { messageId } = req.params;
    const userId = req.user._id.toString();

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    // Only allow participant to mark read (verify they are participant of the chat)
    const chat = await Chat.findById(message.chat).populate('participants.user', '_id');
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    const isParticipant = chat.participants.some(p => {
      const uid = p.user && p.user._id ? p.user._id.toString() : (p.user ? p.user.toString() : null);
      return uid === userId;
    });
    if (!isParticipant) return res.status(403).json({ message: 'Not authorized to mark this message as read' });

    // Add to message.readBy if not already present
    const alreadyRead = message.readBy && message.readBy.some(r => r.user.toString() === userId);
    if (!alreadyRead) {
      message.readBy.push({ user: toObjectId(userId), readAt: new Date() });
      await message.save();
    }

    // Update participant.lastReadMsgId if this message is newer
    const participant = chat.participants.find(p => {
      const uid = p.user && p.user._id ? p.user._id.toString() : (p.user ? p.user.toString() : null);
      return uid === userId;
    });
    if (participant) {
      if (!participant.lastReadMsgId || toObjectId(participant.lastReadMsgId).toString() !== toObjectId(messageId).toString()) {
        participant.lastReadMsgId = toObjectId(messageId);
        await chat.save();
      }
    }

    return res.json({ message: 'Message marked as read' });
  } catch (error) {
    console.error('markMessageAsRead error:', error);
    return res.status(500).json({ message: 'Server error: could not mark message as read', error: error.message });
  }
}

/**
 * POST /api/messages/read
 * Mark all messages in a chat as read by current user.
 * Body: { chatId }
 *
 * This endpoint is handy when user opens a chat and we want to mark all messages as read.
 */
async function markAllMessagesAsRead(req, res) {
  try {
    const { chatId } = req.body;
    if (!chatId) return res.status(400).json({ message: 'chatId is required' });

    const userId = req.user._id.toString();

    const chat = await Chat.findById(chatId).populate('participants.user', '_id');
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    const participant = chat.participants.find(p => {
      const uid = p.user && p.user._id ? p.user._id.toString() : (p.user ? p.user.toString() : null);
      return uid === userId;
    });
    if (!participant) return res.status(403).json({ message: 'Not authorized' });

    // Get last message in chat
    const lastMsg = await Message.findOne({ chat: toObjectId(chatId) }).sort({ createdAt: -1 });
    if (!lastMsg) return res.json({ message: 'No messages to mark read' });

    // Add current user to readBy of all messages not already read by them
    await Message.updateMany(
      { chat: toObjectId(chatId), 'readBy.user': { $ne: toObjectId(userId) } },
      { $push: { readBy: { user: toObjectId(userId), readAt: new Date() } } }
    );

    // Update participant.lastReadMsgId to last message
    participant.lastReadMsgId = lastMsg._id;
    await chat.save();

    return res.json({ message: 'All messages marked as read' });
  } catch (error) {
    console.error('markAllMessagesAsRead error:', error);
    return res.status(500).json({ message: 'Server error: could not mark messages as read', error: error.message });
  }
}

/**
 * PUT /api/messages/:messageId
 * Edit a message. Only sender can edit. Message must not be unsent.
 * Body: { bodyText }
 */
async function editMessage(req, res) {
  try {
    const { messageId } = req.params;
    const { bodyText } = req.body;
    const userId = req.user._id.toString();

    if (!bodyText || !bodyText.trim()) return res.status(400).json({ message: 'Message content is required' });

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    if (message.sender.toString() !== userId) return res.status(403).json({ message: 'Not authorized to edit this message' });
    if (message.unsentAt) return res.status(400).json({ message: 'Cannot edit an unsent message' });

    message.bodyText = bodyText.trim();
    message.editedAt = new Date();
    await message.save();

    // Return message with simple readBy array
    const response = message.toObject();
    response.readBy = readByToSimple(message.readBy);

    return res.json(response);
  } catch (error) {
    console.error('editMessage error:', error);
    return res.status(500).json({ message: 'Server error: could not edit message', error: error.message });
  }
}

/**
 * DELETE /api/messages/:messageId
 * Unsend message (mark unsent). Only sender can unsend.
 * We keep the message doc but mark unsentAt + unsentBy and optionally clear bodyText/attachments.
 */
async function unsendMessage(req, res) {
  try {
    const { messageId } = req.params;
    const userId = req.user._id.toString();

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    if (message.sender.toString() !== userId) return res.status(403).json({ message: 'Not authorized to unsend this message' });
    if (message.unsentAt) return res.status(400).json({ message: 'Message already unsent' });

    // Mark as unsent (WhatsApp style: remove content but keep doc)
    message.unsentAt = new Date();
    message.unsentBy = toObjectId(userId);
    message.bodyText = ''; // clear text
    message.attachments = []; // clear attachments (optional)
    await message.save();

    // Update chat.lastMessage if this message was the last message
    const chat = await Chat.findById(message.chat);
    if (chat && chat.lastMessage && chat.lastMessage.createdAt && new Date(chat.lastMessage.createdAt).getTime() === new Date(message.createdAt).getTime()) {
      // find previous message
      const prev = await Message.findOne({ chat: chat._id, _id: { $ne: message._id } }).sort({ createdAt: -1 }).lean();
      chat.lastMessage = prev ? { text: prev.bodyText || (prev.attachments && prev.attachments.length ? 'Attachment' : ''), createdAt: prev.createdAt } : null;
      await chat.save();
    }

    return res.json({ message: 'Message unsent' });
  } catch (error) {
    console.error('unsendMessage error:', error);
    return res.status(500).json({ message: 'Server error: could not unsend message', error: error.message });
  }
}

/**
 * POST /api/messages/:messageId/react
 * Add a reaction for current user on a message.
 * Body: { emoji }
 */
async function addReaction(req, res) {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id.toString();

    if (!emoji) return res.status(400).json({ message: 'Emoji required' });

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    // Prevent duplicate same-user same-emoji
    const exists = message.reactions && message.reactions.some(r => r.user.toString() === userId && r.emoji === emoji);
    if (exists) return res.status(400).json({ message: 'Reaction already exists' });

    message.reactions.push({ user: toObjectId(userId), emoji, reactedAt: new Date() });
    await message.save();

    // Return reaction list (you can opt to return just the new reaction)
    return res.status(201).json({ reactions: message.reactions });
  } catch (error) {
    console.error('addReaction error:', error);
    return res.status(500).json({ message: 'Server error: could not add reaction', error: error.message });
  }
}

/**
 * DELETE /api/messages/:messageId/react
 * Remove a reaction. Provide { emoji } in body to remove that emoji by current user.
 * Body: { emoji }
 */
async function removeReaction(req, res) {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id.toString();

    if (!emoji) return res.status(400).json({ message: 'Emoji required' });

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    const before = message.reactions.length;
    message.reactions = message.reactions.filter(r => !(r.user.toString() === userId && r.emoji === emoji));
    if (message.reactions.length === before) return res.status(404).json({ message: 'Reaction not found' });

    await message.save();
    return res.json({ message: 'Reaction removed' });
  } catch (error) {
    console.error('removeReaction error:', error);
    return res.status(500).json({ message: 'Server error: could not remove reaction', error: error.message });
  }
}

/**
 * GET /api/messages/:messageId/receipts
 * Return simple array of userId strings who have read the message.
 */
async function getMessageReceipts(req, res) {
  try {
    const { messageId } = req.params;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    const simple = readByToSimple(message.readBy);
    return res.json({ receipts: simple });
  } catch (error) {
    console.error('getMessageReceipts error:', error);
    return res.status(500).json({ message: 'Server error: could not fetch receipts', error: error.message });
  }
}

/**
 * GET /api/messages/:messageId/reactions
 * Return message reactions (full reaction objects)
 */
async function getMessageReactions(req, res) {
  try {
    const { messageId } = req.params;
    const message = await Message.findById(messageId).populate('reactions.user', 'name username profilePicture');
    if (!message) return res.status(404).json({ message: 'Message not found' });
    return res.json({ reactions: message.reactions || [] });
  } catch (error) {
    console.error('getMessageReactions error:', error);
    return res.status(500).json({ message: 'Server error: could not fetch reactions', error: error.message });
  }
}

/**
 * POST /api/chats/create
 * Create a new chat without sending a message.
 * Body: { participants: [userId1, userId2, ...] }  // For direct chats, usually 1 participant
 *
 * Response: { _id: chatId }
 */
async function createChat(req, res) {
  try {
    const userId = req.user._id.toString();
    const { participants } = req.body;

    if (!participants || !Array.isArray(participants) || participants.length < 2) {
      return res.status(400).json({ message: 'Two participants are required to create a chat.' });
    }

    // Find the other participant's ID from the array
    const receiverId = participants.find(p => p.toString() !== userId);

    if (!receiverId) {
      return res.status(400).json({ message: 'Could not determine the receiver from participants.' });
    }

    // Ensure receiver exists
    const receiver = await User.findById(receiverId).select('_id name username profilePicture');
    if (!receiver) return res.status(404).json({ message: 'Receiver not found' });

    // Check if chat already exists between current user and receiver
    let chat = await Chat.findOne({
      convoType: 'direct',
      'participants.user': { $all: [toObjectId(userId), toObjectId(receiverId)] }
    });

    if (chat) {
      // Chat already exists, return it
      return res.json({ _id: chat._id });
    }

    // Create new chat
    const participantObjects = [
      { user: toObjectId(userId), role: 'member', joinedAt: new Date() },
      { user: toObjectId(receiverId), role: 'member', joinedAt: new Date() }
    ];

    chat = await Chat.create({
      convoType: 'direct',
      participants: participantObjects,
      lastMessage: null
    });

    return res.status(201).json({ _id: chat._id });
  } catch (error) {
    console.error('createChat error:', error);
    return res.status(500).json({ message: 'Server error: could not create chat', error: error.message });
  }
}

/**
 * GET /api/chats/search?q=...
 * Search users by username or name (returns user-like objects for front-end)
 */
async function searchChats(req, res) {
  try {
    const { q } = req.query;
    const userId = req.user._id.toString();
    if (!q || q.trim().length === 0) return res.status(400).json({ message: 'Query required' });

    const users = await User.find({
      _id: { $ne: toObjectId(userId) },
      $or: [{ username: { $regex: q, $options: 'i' } }, { name: { $regex: q, $options: 'i' } }]
    }).select('_id username name profilePicture');

    const results = users.map(u => ({ _id: u._id, username: u.username, name: u.name, profilePicture: u.profilePicture }));
    return res.json(results);
  } catch (error) {
    console.error('searchChats error:', error);
    return res.status(500).json({ message: 'Server error: could not search users', error: error.message });
  }
}

/**
 * GET /api/chats/user-status/:userId
 * Get user's online status and last seen
 */
async function getUserStatus(req, res) {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId).select('isOnline lastSeen');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    return res.json({
      isOnline: user.isOnline || false,
      lastSeen: user.lastSeen || null
    });
  } catch (error) {
    console.error('getUserStatus error:', error);
    return res.status(500).json({ message: 'Server error: could not get user status', error: error.message });
  }
}

module.exports = {
  getChats,
  getChatMessages,
  createChat,
  sendMessage,
  markMessageAsRead,
  markAllMessagesAsRead,
  editMessage,
  unsendMessage,
  addReaction,
  removeReaction,
  getMessageReceipts,
  getMessageReactions,
  searchChats,
  getUserStatus
};
