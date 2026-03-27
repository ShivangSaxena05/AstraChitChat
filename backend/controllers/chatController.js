const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const mongoose = require('mongoose');
const { deleteS3Object, deleteFromCloudinary, STORAGE_TYPE } = require('../services/mediaService');

// Get all chats for current user
async function getChats(req, res) {
  try {
    const userId = req.user._id;
    const chats = await Chat.find({ 'participants.user': userId })
      .populate('participants.user', 'name username profilePicture isOnline lastSeen')
      .populate('lastMessage.sender', 'name username profilePicture')
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();

    res.json(chats);
  } catch (error) {
    console.error('getChats error:', error);
    res.status(500).json({ message: 'Failed to get chats', error: process.env.NODE_ENV === 'production' ? {} : error.message });
  }
}

// Get messages for specific chat
async function getChatMessages(req, res) {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 50;
    const beforeMessageId = req.query.beforeMessageId;

    // Validate chatId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }

    // Verify user is a member of the chat
    const chat = await Chat.findOne({
      _id: chatId,
      'participants.user': userId
    });
    
    if (!chat) {
      return res.status(403).json({ message: 'Chat not found or access denied' });
    }

    // Build query based on cursor pagination
    let query = { chat: chatId };
    
    if (beforeMessageId) {
      // If loading more (scrolling up), get messages created BEFORE the oldest message
      if (!mongoose.Types.ObjectId.isValid(beforeMessageId)) {
        return res.status(400).json({ message: 'Invalid beforeMessageId' });
      }
      
      const beforeMessage = await Message.findById(beforeMessageId);
      if (beforeMessage) {
        query.createdAt = { $lt: beforeMessage.createdAt };
      }
    }

    // Fetch messages in descending order (newest first) so that newest messages appear at the bottom
    // When loading more (scrolling up), this gives us older messages in reverse chronological order
    const messages = await Message.find(query)
      .populate('sender', 'name username profilePicture')
      .populate('quotedMsgId', 'bodyText sender')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Reverse to get chronological order for display
    messages.reverse();

    // FIX: only add to readBy if user hasn't already read the message,
    // avoiding duplicate object entries that $addToSet can't deduplicate
    await Message.updateMany(
      {
        chat: chatId,
        sender: { $ne: userId },
        'readBy.user': { $ne: userId },
      },
      { $addToSet: { readBy: { user: userId, readAt: new Date() } } }
    );

    res.json({
      messages: messages,
      hasMore: messages.length === limit
    });
  } catch (error) {
    console.error('getChatMessages error:', error);
    res.status(500).json({ message: 'Failed to get messages', error: process.env.NODE_ENV === 'production' ? {} : error.message });
  }
}

// Find existing chat with a user
async function findChat(req, res) {
  try {
    const { userId } = req.params;
    const currentUser = req.user._id;

    const chat = await Chat.findOne({
      convoType: 'direct',
      'participants.user': { $all: [currentUser, new mongoose.Types.ObjectId(userId)] }
    }).populate('participants.user', 'name username profilePicture');

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    res.json(chat);
  } catch (error) {
    res.status(500).json({ message: 'Failed to find chat', error: error.message });
  }
}

// Create new chat
async function createChat(req, res) {
  try {
    const { userId } = req.body;
    const currentUser = req.user._id;

    if (userId === currentUser.toString()) {
      return res.status(400).json({ message: 'Cannot chat with self' });
    }

    let chat = await Chat.findOne({
      convoType: 'direct',
      'participants.user': { $all: [currentUser, new mongoose.Types.ObjectId(userId)] }
    });

    if (!chat) {
      chat = new Chat({
        convoType: 'direct',
        participants: [
          { user: currentUser, role: 'member' },
          { user: new mongoose.Types.ObjectId(userId), role: 'member' }
        ]
      });
      await chat.save();
    }

    chat = await chat.populate('participants.user', 'name username profilePicture');
    res.json(chat);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create chat', error: error.message });
  }
}

// Search chats by name (participant name search requires aggregation — simplified here)
// FIX: removed broken $expr/$regexMatch query that silently returned no results.
// Now searches by chatName only for group chats; for private chats the client
// should filter populated participant names on the frontend, or upgrade this
// to an aggregation pipeline if server-side participant search is needed.
async function searchChats(req, res) {
  try {
    const { query } = req.query;
    const userId = req.user._id;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const chats = await Chat.find({
      'participants.user': userId,
      title: { $regex: query, $options: 'i' },
    }).populate('participants.user', 'name username profilePicture');

    res.json(chats);
  } catch (error) {
    res.status(500).json({ message: 'Failed to search chats', error: error.message });
  }
}

// Send message (creates chat if needed)
async function sendMessage(req, res) {
  try {
    const { receiverId, bodyText, msgType = 'text', attachments = [], quotedMsgId } = req.body;
    const senderId = req.user._id;

    let chat = await Chat.findOne({
      convoType: 'direct',
      'participants.user': { $all: [senderId, new mongoose.Types.ObjectId(receiverId)] }
    });

    if (!chat) {
      chat = new Chat({
        convoType: 'direct',
        participants: [
          { user: senderId, role: 'member' },
          { user: new mongoose.Types.ObjectId(receiverId), role: 'member' },
        ],
      });
      await chat.save();
    }

    const message = new Message({
      sender: senderId,
      receiver: new mongoose.Types.ObjectId(receiverId),
      chat: chat._id,
      bodyText: bodyText || '',
      msgType,
      attachments,
      quotedMsgId: quotedMsgId ? new mongoose.Types.ObjectId(quotedMsgId) : null,
      readBy: [{ user: senderId, readAt: new Date() }],
    });

    await message.save();
    await message.populate('sender', 'name username profilePicture');
    await message.populate('quotedMsgId', 'bodyText sender');

    await Chat.findByIdAndUpdate(chat._id, {
      lastMessage: {
        text: bodyText || (attachments.length ? 'Media' : 'Message'),
        createdAt: message.createdAt,
        sender: senderId,
      },
      updatedAt: new Date(),
    });

    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ message: 'Failed to send message', error: error.message });
  }
}

// Mark single message as read
async function markMessageAsRead(req, res) {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    await Message.findByIdAndUpdate(messageId, {
      $addToSet: { readBy: { user: userId, readAt: new Date() } },
    });

    res.json({ message: 'Message marked as read' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark read', error: error.message });
  }
}

// Mark all messages in chat as read
async function markAllMessagesAsRead(req, res) {
  try {
    const { chatId } = req.body;
    const userId = req.user._id;

    await Message.updateMany(
      { chat: chatId, sender: { $ne: userId }, 'readBy.user': { $ne: userId } },
      { $addToSet: { readBy: { user: userId, readAt: new Date() } } }
    );

    res.json({ message: 'All messages marked as read' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark all read', error: error.message });
  }
}

// Add reaction
async function addReaction(req, res) {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    if (!message.reactions) message.reactions = [];

    const existing = message.reactions.find(
      r => r.emoji === emoji && r.user.toString() === userId.toString()
    );
    if (!existing) {
      message.reactions.push({ emoji, user: userId, reactedAt: new Date() });
      await message.save();
    }

    res.json(message.reactions);
  } catch (error) {
    res.status(500).json({ message: 'Failed to add reaction', error: error.message });
  }
}

// Remove reaction
async function removeReaction(req, res) {
  try {
    const { messageId, emoji } = req.params;
    const userId = req.user._id;

    await Message.findByIdAndUpdate(messageId, {
      $pull: { reactions: { emoji, user: userId } },
    });

    res.json({ message: 'Reaction removed' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to remove reaction', error: error.message });
  }
}

// Edit message
async function editMessage(req, res) {
  try {
    const { messageId } = req.params;
    const { bodyText } = req.body;
    const userId = req.user._id;

    const message = await Message.findOneAndUpdate(
      { _id: messageId, sender: userId },
      { bodyText, editedAt: new Date() },
      { new: true }
    ).populate('sender', 'name username');

    if (!message) return res.status(404).json({ message: 'Message not found or unauthorized' });

    res.json(message);
  } catch (error) {
    res.status(500).json({ message: 'Failed to edit message', error: error.message });
  }
}

// Unsend message (soft delete)
async function unsendMessage(req, res) {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const result = await Message.findOneAndUpdate(
      { _id: messageId, sender: userId },
      { unsent: true, bodyText: '[This message was unsent]', editedAt: new Date() }
    );

    if (!result) return res.status(404).json({ message: 'Message not found or unauthorized' });

    res.json({ message: 'Message unsent' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to unsend message', error: error.message });
  }
}

// Delete message (hard delete)
async function deleteMessage(req, res) {
  try {
    const { messageId } = req.params;
    const userId = req.user._id.toString();

    const message = await Message.findById(messageId).populate('chat');
    if (!message) return res.status(404).json({ message: 'Message not found' });
    if (message.sender.toString() !== userId) return res.status(403).json({ message: 'Unauthorized' });

    if (message.mediaKey) {
      try {
        if (STORAGE_TYPE === 'cloudinary') {
          const publicId = message.mediaUrl?.split('/').slice(-2).join('/').replace(/\.[^/.]+$/, '');
          if (publicId) await deleteFromCloudinary(publicId);
        } else {
          await deleteS3Object(message.mediaKey);
        }
      } catch (err) {
        console.warn('Media delete failed:', err.message);
      }
    }

    for (const att of message.attachments || []) {
      try {
        if (STORAGE_TYPE === 'cloudinary') {
          const publicId = att.url?.split('/').slice(-2).join('/').replace(/\.[^/.]+$/, '');
          if (publicId) await deleteFromCloudinary(publicId);
        } else {
          await deleteS3Object(att.key);
        }
      } catch (err) {
        console.warn('Attachment delete failed:', err.message);
      }
    }

    await Message.deleteOne({ _id: messageId });
    res.json({ message: 'Message deleted' });
  } catch (error) {
    console.error('deleteMessage error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

// Get message receipts
async function getMessageReceipts(req, res) {
  try {
    const { messageId } = req.params;
    const message = await Message.findById(messageId)
      .populate('readBy.user deliveredTo.user', 'name username profilePicture');

    if (!message) return res.status(404).json({ message: 'Message not found' });

    res.json({
      readBy: message.readBy || [],
      deliveredTo: message.deliveredTo || [],
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get receipts', error: error.message });
  }
}

// Get message reactions
async function getMessageReactions(req, res) {
  try {
    const { messageId } = req.params;
    const message = await Message.findById(messageId)
      .populate('reactions.user', 'name username profilePicture');

    if (!message) return res.status(404).json({ message: 'Message not found' });

    res.json(message.reactions || []);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get reactions', error: error.message });
  }
}

// Get user online status
async function getUserStatus(req, res) {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('isOnline lastSeen');
    res.json(user || { isOnline: false, lastSeen: null });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get status', error: error.message });
  }
}

// Create group chat
async function createGroupChat(req, res) {
  try {
    const { name, participants } = req.body;
    const creatorId = req.user._id;

    if (!name || !participants || participants.length === 0) {
      return res.status(400).json({ message: 'Group name and at least one participant are required' });
    }

    const chat = new Chat({
      convoType: 'group',
      title: name,
      participants: [
        { user: creatorId, role: 'admin', joinedAt: new Date() },
        ...participants.map(id => ({
          user: new mongoose.Types.ObjectId(id),
          role: 'member',
          joinedAt: new Date(),
        })),
      ],
    });

    await chat.save();
    await chat.populate('participants.user', 'name username profilePicture');
    res.status(201).json(chat);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create group', error: error.message });
  }
}

// Get chat info
// FIX: added participant membership check to prevent unauthorized access
async function getChatInfo(req, res) {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    const chat = await Chat.findOne({ _id: chatId, 'participants.user': userId })
      .populate('participants.user', 'name username profilePicture')
      .populate('creator', 'name username');

    if (!chat) return res.status(403).json({ message: 'Chat not found or access denied' });

    res.json(chat);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get chat info', error: error.message });
  }
}

// Get chat media
// FIX: added participant membership check to prevent unauthorized access
async function getChatMedia(req, res) {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = 30;
    const skip = (page - 1) * limit;

    const isMember = await Chat.findOne({ _id: chatId, 'participants.user': userId });
    if (!isMember) return res.status(403).json({ message: 'Access denied' });

    const mediaMessages = await Message.find({
      chat: chatId,
      $or: [
        { msgType: { $in: ['image', 'video'] } },
        { attachments: { $exists: true, $ne: [] } },
      ],
    })
      .populate('sender', 'name username profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json(mediaMessages);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get media', error: error.message });
  }
}

// Mute chat
// FIX: actually persists the mute to the DB instead of being a no-op
async function muteChat(req, res) {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;
    const { mutedUntil } = req.body;

    await User.findByIdAndUpdate(userId, {
      $addToSet: {
        mutedChats: {
          chat: chatId,
          mutedUntil: mutedUntil ? new Date(mutedUntil) : null,
        },
      },
    });

    res.json({ message: 'Chat muted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mute chat', error: error.message });
  }
}

// Pin / unpin chat
// FIX: correctly toggles pin state using $addToSet / $pull based on isPinned param
async function pinChat(req, res) {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;
    const isPinned = req.body.isPinned !== false;

    const update = isPinned
      ? { $addToSet: { pinnedChats: chatId } }
      : { $pull: { pinnedChats: chatId } };

    await User.findByIdAndUpdate(userId, update);
    res.json({ message: isPinned ? 'Chat pinned' : 'Chat unpinned' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to pin chat', error: error.message });
  }
}

// Clear chat history
// FIX: added membership check so only participants can clear a chat
async function clearChat(req, res) {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    const isMember = await Chat.findOne({ _id: chatId, 'participants.user': userId });
    if (!isMember) return res.status(403).json({ message: 'Access denied' });

    await Message.deleteMany({ chat: chatId });
    res.json({ message: 'Chat cleared' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to clear chat', error: error.message });
  }
}

module.exports = {
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
};