const Chat = require('../models/Chat');
const Message = require('../models/Message');
const MessageReaction = require('../models/MessageReaction');
const User = require('../models/User');
const mongoose = require('mongoose');
const { deleteCloudinaryAsset } = require('../services/mediaService');
const { applyUserDefaults } = require('../utils/lazyDefaults');
const { updateChatOnNewMessage } = require('../services/chatActivity.service');

// Helper to convert MessageReaction collection format to frontend format
// Frontend expects: { emoji, users: [userId, ...] }
// Database has: [{ message, reactor, emoji, reactedAt }, ...]
function formatReactionsForFrontend(dbReactions) {
  const reactionMap = {};
  
  dbReactions.forEach(reaction => {
    const emoji = reaction.emoji;
    const userId = reaction.reactor?._id?.toString() || reaction.reactor?.toString();
    
    if (!reactionMap[emoji]) {
      reactionMap[emoji] = {
        emoji: emoji,
        users: []
      };
    }
    
    if (userId) {
      reactionMap[emoji].users.push(userId);
    }
  });
  
  return Object.values(reactionMap);
}

// Helper to normalize participants (handles both old ObjectId format and new object format)
/**
 * ✅ FIX (Bug #5): Normalize participants to new format
 * Ensures all participants have user, role, joinedAt, lastReadMsgId
 * Handles legacy old format (raw ObjectId) with warnings
 * After migration script runs, old format should never appear
 */
function normalizeParticipants(participants, populatedParticipants = null) {
  if (!Array.isArray(participants)) return [];
  
  return participants.map((p, index) => {
    // NEW FORMAT: object with user field
    if (p && typeof p === 'object' && p.user !== undefined) {
      // Check if user is populated (object) or still an ObjectId
      const userIsPopulated = p.user && typeof p.user === 'object' && p.user._id;
      
      if (!userIsPopulated) {
        console.warn(`[normalizeParticipants] User not populated for participant at index ${index}`);
      }
      
      return {
        user: p.user,
        role: p.role || 'member',
        joinedAt: p.joinedAt || new Date(),
        lastReadMsgId: p.lastReadMsgId || null
      };
    }
    
    // OLD FORMAT (Legacy): just ObjectId or string
    // ⚠️ This should only appear before migration script runs
    if (mongoose.Types.ObjectId.isValid(p) || (typeof p === 'string' && p.match(/^[0-9a-f]{24}$/i))) {
      console.warn(`[BUG #5] Found old format participant (raw ObjectId): ${p} - Run migrateParticipantsFormat.js`);
      const populatedUser = populatedParticipants?.[index];
      return {
        user: populatedUser || p,
        role: 'member',
        joinedAt: new Date(),
        lastReadMsgId: null
      };
    }
    
    // UNKNOWN FORMAT - Log and return as-is
    console.warn(`[BUG #5] Unexpected participant format at index ${index}:`, p);
    return p;
  });
}

// ✅ FIX (Bug #5): Find current user in participants
// Works with normalized new format
function findCurrentUserParticipant(chat, userId) {
  if (!Array.isArray(chat.participants)) return null;
  
  for (const p of chat.participants) {
    // NEW FORMAT: object with user field
    if (p && typeof p === 'object' && p.user) {
      if (p.user?._id?.toString() === userId.toString()) {
        return p;
      }
    }
    // OLD FORMAT (Legacy): just ObjectId
    // ⚠️ Should not occur after migration, but handle gracefully
    else if (mongoose.Types.ObjectId.isValid(p)) {
      console.warn(`[BUG #5] Found old format participant in findCurrentUserParticipant - Run migrateParticipantsFormat.js`);
      if (p.toString() === userId.toString()) {
        return { user: p, role: 'member', joinedAt: new Date(), lastReadMsgId: null };
      }
    }
  }
  return null;
}

// Get all chats for current user
async function getChats(req, res) {
  try {
    const userId = req.user._id;
    // ✅ PRODUCTION FIX: Query both old format (direct ObjectIds) and new format (user field)
    // CRITICAL FIX: Removed 'lastMessage': { $exists: true } filter
    // New chats won't have a lastMessage until first message is sent
    // This ensures newly created chats appear immediately in the list
    const chats = await Chat.find({ 
      $or: [
        { 'participants.user': userId },        // New format
        { 'participants': userId }              // Old format (raw ObjectIds)
      ]
    })
      .populate({
        path: 'participants.user',
        select: 'name username profilePicture isOnline lastSeen bio'
      })
      .populate({
        path: 'lastMessage.sender',
        select: 'name username profilePicture'
      })
      // ✅ FIX (Bug #1): Sort to include empty chats that don't have lastMessage yet
      // 1. Sort by lastMessage.createdAt (newest messages first)
      // 2. Then by lastActivityTimestamp (empty chats appear right after last active)
      // 3. Then by createdAt (fallback for truly new empty chats)
      // This ensures empty chats appear in the list after being created
      .sort({ 'lastMessage.createdAt': -1, 'lastActivityTimestamp': -1, 'createdAt': -1 })
      .limit(20);

    // Convert to lean objects manually after populate for better control
    const leanChats = chats.map(chat => chat.toObject ? chat.toObject() : chat);

    // 🔍 DEBUG: Log first chat to verify population
    if (leanChats.length > 0) {
      console.log('🔍 [DEBUG] First chat after populate:', JSON.stringify(leanChats[0], null, 2));
      console.log('🔍 [DEBUG] First participant:', JSON.stringify(leanChats[0].participants?.[0], null, 2));
    }

    // ✅ CRITICAL FIX: Enrich any chats with missing populated user data
    const enrichedChats = await Promise.all(
      leanChats.map(chat => enrichChatParticipantsIfNeeded(chat))
    );

    // ✅ FIX (Bug #6): Use stored unreadCount from database for persistence
    const chatsWithUnread = await Promise.all(
      enrichedChats.map(async (chat) => {
        try {
          // Normalize participants to handle both old and new format
          const normalizedParticipants = normalizeParticipants(chat.participants);
          
          // Find the current user's participant record
          const currentUserParticipant = normalizedParticipants?.find(
            p => p.user?._id?.toString() === userId.toString()
          );

          // Find the other participant(s) - for direct chats this is the other user, for groups it's all others
          const otherParticipants = normalizedParticipants?.filter(
            p => p.user?._id?.toString() !== userId.toString()
          ) || [];

          // ✅ FIX (Bug #6): Get stored unreadCount from database, fallback to calculation
          let unreadCount = 0;
          if (chat.unreadCounts && Array.isArray(chat.unreadCounts)) {
            const userUnreadRecord = chat.unreadCounts.find(
              uc => uc.user?.toString?.() === userId.toString() || uc.user === userId.toString()
            );
            unreadCount = userUnreadRecord?.count ?? 0;
          } else {
            // Fallback: Calculate unread count if not stored (for migration)
            unreadCount = await Message.countDocuments({
              chat: chat._id,
              sender: { $ne: userId },
              'readBy.user': { $ne: userId }
            });
          }

          // ✅ FIX: Add otherUser for direct chats (for easy access to the chat partner's info)
          let otherUser = null;
          if (chat.convoType === 'direct' && otherParticipants.length > 0) {
            otherUser = otherParticipants[0].user ? applyUserDefaults(otherParticipants[0].user) : null;
          }

          return {
            ...chat,
            unreadCount,
            otherUser,  // ✅ NEW: Direct access to other user in direct chats
            lastReadMsgId: currentUserParticipant?.lastReadMsgId || null,
            lastActivityTimestamp: chat.lastActivityTimestamp || new Date(),
            participants: normalizedParticipants.map(p => ({
              ...p,
              user: p.user ? applyUserDefaults(p.user) : null,
              role: p.role || 'member',
              joinedAt: p.joinedAt || new Date(),
            })) || [],
            // ✅ NEW: Include lastMessage sender with full user info
            lastMessage: {
              ...chat.lastMessage,
              sender: chat.lastMessage?.sender ? applyUserDefaults(chat.lastMessage.sender) : null
            }
          };
        } catch (err) {
          console.error('Error calculating unread for chat:', chat._id, err);
          // Return chat without unread count if calculation fails
          const normalizedParticipants = normalizeParticipants(chat.participants);
          const otherParticipants = normalizedParticipants?.filter(
            p => p.user?._id?.toString() !== userId.toString()
          ) || [];
          
          let otherUser = null;
          if (chat.convoType === 'direct' && otherParticipants.length > 0) {
            otherUser = otherParticipants[0].user ? applyUserDefaults(otherParticipants[0].user) : null;
          }

          return {
            ...chat,
            unreadCount: 0,
            otherUser,
            lastReadMsgId: normalizeParticipants(chat.participants).find(p => p.user?._id?.toString() === userId.toString())?.lastReadMsgId || null,
            lastActivityTimestamp: chat.lastActivityTimestamp || new Date(),
            participants: normalizedParticipants.map(p => ({
              ...p,
              user: p.user ? applyUserDefaults(p.user) : null,
              role: p.role || 'member',
              joinedAt: p.joinedAt || new Date(),
            })) || [],
            lastMessage: {
              ...chat.lastMessage,
              sender: chat.lastMessage?.sender ? applyUserDefaults(chat.lastMessage.sender) : null
            }
          };
        }
      })
    );

    res.json(chatsWithUnread);
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

    // ✅ FIX (Bug #2): Frontend correctly loads older messages when scrolled to TOP (offsetY < 100)
    // ✅ FIX (Bug #10): Fetch messages in descending order (newest first)
    // Properly populate quoted message references with full sender details
    const messages = await Message.find(query)
      .populate('sender', 'name username profilePicture isOnline lastSeen bio')
      .populate({
        path: 'quotedMsgId',
        select: 'bodyText sender msgType mediaMime mediaUrl',
        populate: {
          path: 'sender',
          select: 'name username profilePicture'
        }
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Reverse to get chronological order for display
    messages.reverse();

    // ✅ FIX (Bug #10): Apply lazy defaults to sender objects and hydrate quoted messages
    const messagesWithDefaults = messages.map(msg => ({
      ...msg,
      sender: msg.sender ? applyUserDefaults(msg.sender) : null,
      quotedMsgId: msg.quotedMsgId ? {
        ...msg.quotedMsgId,
        sender: msg.quotedMsgId.sender ? applyUserDefaults(msg.quotedMsgId.sender) : null
      } : null,
      // For backwards compatibility: also include quotedMessage if quotedMsgId is populated
      quotedMessage: msg.quotedMsgId ? {
        _id: msg.quotedMsgId._id,
        bodyText: msg.quotedMsgId.bodyText || '[Media message]',
        msgType: msg.quotedMsgId.msgType || 'text',
        sender: msg.quotedMsgId.sender ? applyUserDefaults(msg.quotedMsgId.sender) : { _id: '', username: 'Unknown', profilePicture: '' },
        mediaUrl: msg.quotedMsgId.mediaUrl
      } : null
    }));

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

    // ✅ FIX (Bug #6): Update lastReadMsgId and reset unreadCount for the participant
    if (messages.length > 0) {
      const mostRecentMessageId = messages[messages.length - 1]._id;  // Last message in chronological order
      await Chat.updateOne(
        { _id: chatId, 'participants.user': userId },
        { 
          $set: { 
            'participants.$.lastReadMsgId': mostRecentMessageId,
            'unreadCounts.$[elem].count': 0  // Reset unread count to 0
          }
        },
        {
          arrayFilters: [{ 'elem.user': userId }]  // Only update this user's unread count
        }
      );
    } else {
      // No messages to read, but still reset unread count
      await Chat.updateOne(
        { _id: chatId, 'unreadCounts.user': userId },
        { $set: { 'unreadCounts.$.count': 0 } }
      );
    }

    res.json({
      messages: messagesWithDefaults,
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

    // ✅ FIX: Handle both participant orders to find existing direct chat
    // Use $all on participants.user to check for both users (same pattern as createChat)
    const chat = await Chat.findOne({
      convoType: 'direct',
      'participants.user': { $all: [currentUser, new mongoose.Types.ObjectId(userId)] },
      participants: { $size: 2 }
    }).populate('participants.user', 'name username profilePicture isOnline lastSeen bio');

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // ✅ FIX: Apply lazy defaults and add otherUser for direct chats
    const chatObj = chat.toObject();
    const normalizedParticipants = normalizeParticipants(chatObj.participants);
    const otherParticipants = normalizedParticipants?.filter(
      p => p.user?._id?.toString() !== currentUser.toString()
    ) || [];
    
    let otherUser = null;
    if (otherParticipants.length > 0) {
      otherUser = otherParticipants[0].user ? applyUserDefaults(otherParticipants[0].user) : null;
    }

    res.json({
      ...chatObj,
      otherUser,
      participants: normalizedParticipants.map(p => ({
        ...p,
        user: p.user ? applyUserDefaults(p.user) : null,
        role: p.role || 'member',
        joinedAt: p.joinedAt || new Date(),
      })) || [],
    });
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

    // FIX: Sort participant IDs to ensure consistent ordering and prevent duplicates
    const userIds = [currentUser.toString(), userId].sort();
    
    let chat = await Chat.findOne({
      convoType: 'direct',
      'participants.user': { $all: [new mongoose.Types.ObjectId(userIds[0]), new mongoose.Types.ObjectId(userIds[1])] },
      participants: { $size: 2 }
    });

    if (!chat) {
      const now = new Date();
      // ✅ PRODUCTION FIX: Mark that this chat was created (but will only appear after first message)
      // Empty chats are filtered out in getChats() - they require at least one message to appear
      chat = new Chat({
        convoType: 'direct',
        participants: [
          { user: new mongoose.Types.ObjectId(userIds[0]), role: 'member', joinedAt: now },
          { user: new mongoose.Types.ObjectId(userIds[1]), role: 'member', joinedAt: now }
        ],
        // ✅ FIX (Bug #6): Initialize unreadCounts for both participants with 0
        unreadCounts: [
          { user: new mongoose.Types.ObjectId(userIds[0]), count: 0 },
          { user: new mongoose.Types.ObjectId(userIds[1]), count: 0 }
        ],
        lastActivityTimestamp: now,
        // Note: lastMessage is NOT set - chat only appears in list after first message
      });
      await chat.save();
    }

    chat = await chat.populate('participants.user', 'name username profilePicture isOnline lastSeen bio');
    
    // Apply lazy defaults to participants
    const chatWithDefaults = {
      ...chat.toObject(),
      participants: chat.participants?.map(p => ({
        ...p,
        user: p.user ? applyUserDefaults(p.user) : null,
        role: p.role || 'member',
        joinedAt: p.joinedAt || new Date(),
      })) || [],
    };
    
    res.json(chatWithDefaults);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create chat', error: error.message });
  }
}

// Search chats by name or participant username
// ✅ FIX: Now searches both group names AND participant usernames using aggregation
// Works for both direct and group chats
async function searchChats(req, res) {
  try {
    const { query } = req.query;
    const userId = req.user._id;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const searchRegex = new RegExp(query, 'i');

    // ✅ FIX: Use aggregation pipeline to search participant names in direct chats
    const chats = await Chat.aggregate([
      // Match chats where user is a participant
      {
        $match: {
          'participants.user': new mongoose.Types.ObjectId(userId)
        }
      },
      // Lookup user details for all participants
      {
        $lookup: {
          from: 'users',
          localField: 'participants.user',
          foreignField: '_id',
          as: 'populatedParticipants'
        }
      },
      // Filter chats by groupName (for groups) or participant username/name (for direct)
      {
        $match: {
          $or: [
            { groupName: { $regex: searchRegex } },
            { 'populatedParticipants.username': { $regex: searchRegex } },
            { 'populatedParticipants.name': { $regex: searchRegex } }
          ]
        }
      },
      // Limit results
      { $limit: 20 },
      // Reconstruct participants with user data
      {
        $addFields: {
          participants: {
            $map: {
              input: '$participants',
              as: 'p',
              in: {
                user: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$populatedParticipants',
                        as: 'u',
                        cond: { $eq: ['$$u._id', '$$p.user'] }
                      }
                    },
                    0
                  ]
                },
                role: '$$p.role',
                joinedAt: '$$p.joinedAt',
                lastReadMsgId: '$$p.lastReadMsgId'
              }
            }
          }
        }
      },
      // Remove the temporary field
      { $project: { populatedParticipants: 0 } }
    ]);

    // ✅ FIX: Apply lazy defaults to participant users
    const chatsWithDefaults = chats.map(chat => {
      const otherParticipants = chat.participants?.filter(
        p => p.user?._id?.toString() !== userId.toString()
      ) || [];
      
      let otherUser = null;
      if (chat.convoType === 'direct' && otherParticipants.length > 0) {
        otherUser = otherParticipants[0].user ? applyUserDefaults(otherParticipants[0].user) : null;
      }

      return {
        ...chat,
        otherUser,
        participants: chat.participants?.map(p => ({
          ...p,
          user: p.user ? applyUserDefaults(p.user) : null,
          role: p.role || 'member',
          joinedAt: p.joinedAt || new Date(),
        })) || [],
      };
    });

    res.json(chatsWithDefaults);
  } catch (error) {
    console.error('searchChats error:', error);
    res.status(500).json({ message: 'Failed to search chats', error: error.message });
  }
}

// Send message (creates chat if needed)
async function sendMessage(req, res) {
  try {
    const { receiverId, bodyText, msgType = 'text', attachments = [], quotedMsgId } = req.body;
    const { chatId: chatIdParam } = req.params;
    const senderId = req.user._id;

    // ✅ FIX: Support both routes:
    // - POST / uses receiverId to find/create chat
    // - POST /:chatId/messages uses chatId directly
    let chatId = chatIdParam;

    if (!chatId && !receiverId) {
      return res.status(400).json({ message: 'Either chatId or receiverId is required' });
    }

    // ✅ FIX: Validate attachments structure before storing (matches Message schema: public_id, secure_url, resource_type)
    const validatedAttachments = (attachments || []).filter(att => {
      return (
        att &&
        typeof att === 'object' &&
        att.public_id &&
        typeof att.public_id === 'string' &&
        att.secure_url &&
        typeof att.secure_url === 'string' &&
        att.resource_type &&
        ['image', 'video', 'audio', 'file'].includes(att.resource_type) &&
        (!att.size || (typeof att.size === 'number' && att.size <= 50 * 1024 * 1024))  // 50MB limit
      );
    });

    let chat;

    if (chatId) {
      // Route: POST /:chatId/messages - Use existing chat
      chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(404).json({ message: 'Chat not found' });
      }
    } else {
      // Route: POST / - Find or create chat using receiverId
      if (!receiverId) {
        return res.status(400).json({ message: 'receiverId is required for this endpoint' });
      }

      // FIX: Sort participant IDs to ensure consistent ordering and prevent duplicates
      const userIds = [senderId.toString(), receiverId].sort();

      chat = await Chat.findOne({
        convoType: 'direct',
        'participants.user': { $all: [new mongoose.Types.ObjectId(userIds[0]), new mongoose.Types.ObjectId(userIds[1])] },
        participants: { $size: 2 }
      });

      if (!chat) {
        const now = new Date();
        chat = new Chat({
          convoType: 'direct',
          participants: [
            { user: new mongoose.Types.ObjectId(userIds[0]), role: 'member', joinedAt: now },
            { user: new mongoose.Types.ObjectId(userIds[1]), role: 'member', joinedAt: now },
          ],
          // ✅ FIX (Bug #6): Initialize unreadCounts for both participants with 0
          unreadCounts: [
            { user: new mongoose.Types.ObjectId(userIds[0]), count: 0 },
            { user: new mongoose.Types.ObjectId(userIds[1]), count: 0 }
          ],
          lastActivityTimestamp: now
        });
        await chat.save();
      }
    }

    const now = new Date();
    const message = new Message({
      sender: senderId,
      receiver: receiverId ? new mongoose.Types.ObjectId(receiverId) : null,
      chat: chat._id,
      bodyText: bodyText || '',
      msgType,
      status: 'sent',
      attachments: validatedAttachments,
      quotedMsgId: quotedMsgId ? new mongoose.Types.ObjectId(quotedMsgId) : null,
      readBy: [{ user: senderId, readAt: now }],
      deliveredTo: [],
    });

    await message.save();
    await message.populate('sender', 'name username profilePicture isOnline lastSeen bio');
    await message.populate('quotedMsgId', 'bodyText sender');

    // ✅ FIX: Apply lazy defaults to sender
    const messageWithDefaults = {
      ...message.toObject(),
      sender: message.sender ? applyUserDefaults(message.sender) : null,
      quotedMsgId: message.quotedMsgId ? {
        ...message.quotedMsgId,
        sender: message.quotedMsgId.sender ? applyUserDefaults(message.quotedMsgId.sender) : null
      } : null
    };

    // ✅ FIX: Use chatActivity service instead of manual updatedAt
    const messageText = bodyText || (validatedAttachments.length ? 'Media' : 'Message');
    await updateChatOnNewMessage(chat._id.toString(), message._id.toString(), senderId.toString(), messageText);

    res.status(201).json(messageWithDefaults);
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

    // ✅ FIX: Get the most recent message ID to update lastReadMsgId
    const latestMessage = await Message.findOne({ chat: chatId })
      .sort({ createdAt: -1 })
      .select('_id');

    await Message.updateMany(
      { chat: chatId, sender: { $ne: userId }, 'readBy.user': { $ne: userId } },
      { $addToSet: { readBy: { user: userId, readAt: new Date() } } }
    );

    // ✅ FIX: Update lastReadMsgId for the participant
    if (latestMessage) {
      await Chat.updateOne(
        { _id: chatId, 'participants.user': userId },
        { $set: { 'participants.$.lastReadMsgId': latestMessage._id } }
      );
    }

    // ✅ FIX (Bug #6): Reset unreadCount to 0 for the current user
    await Chat.updateOne(
      { _id: chatId, 'unreadCounts.user': userId },
      { $set: { 'unreadCounts.$.count': 0 } }
    );

    res.json({ message: 'All messages marked as read' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark all read', error: error.message });
  }
}

// Add reaction
// ✅ FIX: Now uses MessageReaction collection instead of embedded array
// Uses compound unique index { message, reactor, emoji } to prevent duplicates
async function addReaction(req, res) {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    // Validate message exists
    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    // Create or skip if already exists (unique index prevents duplicates)
    try {
      const reaction = new MessageReaction({
        message: messageId,
        reactor: userId,
        emoji: emoji,
        reactedAt: new Date()
      });
      await reaction.save();
    } catch (err) {
      // If duplicate reaction (same user, same emoji), just return existing reactions
      if (err.code === 11000) {
        console.log(`[Reaction] Duplicate reaction attempt - skipping`);
      } else {
        throw err;
      }
    }

    // Fetch all reactions for this message
    const reactions = await MessageReaction.find({ message: messageId })
      .populate('reactor', '_id name username profilePicture')
      .lean();

    // Format for frontend: { emoji, users: [userId, ...] }
    const formattedReactions = formatReactionsForFrontend(reactions);

    res.json(formattedReactions);
  } catch (error) {
    console.error('addReaction error:', error);
    res.status(500).json({ message: 'Failed to add reaction', error: error.message });
  }
}

// Remove reaction
// ✅ FIX: Now uses MessageReaction collection instead of embedded array
async function removeReaction(req, res) {
  try {
    const { messageId, emoji } = req.params;
    const userId = req.user._id;

    // Delete the reaction from MessageReaction collection
    await MessageReaction.deleteOne({
      message: messageId,
      reactor: userId,
      emoji: emoji
    });

    // Fetch remaining reactions for this message
    const reactions = await MessageReaction.find({ message: messageId })
      .populate('reactor', '_id name username profilePicture')
      .lean();

    // Format for frontend: { emoji, users: [userId, ...] }
    const formattedReactions = formatReactionsForFrontend(reactions);

    res.json(formattedReactions);
  } catch (error) {
    console.error('removeReaction error:', error);
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
    ).populate('sender', 'name username profilePicture isOnline lastSeen bio');

    if (!message) return res.status(404).json({ message: 'Message not found or unauthorized' });

    // ✅ FIX: Apply lazy defaults to sender
    res.json({
      ...message.toObject(),
      sender: message.sender ? applyUserDefaults(message.sender) : null
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to edit message', error: error.message });
  }
}

// Unsend message (soft delete)
async function unsendMessage(req, res) {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    // ✅ FIX: Use correct schema fields (unsentAt, unsentBy) instead of non-existent 'unsent' field
    const result = await Message.findOneAndUpdate(
      { _id: messageId, sender: userId },
      { 
        unsentAt: new Date(),
        unsentBy: userId,
        bodyText: '[This message was unsent]',
        editedAt: new Date()
      },
      { new: true }
    ).populate('sender', 'name username profilePicture isOnline lastSeen bio');

    if (!result) return res.status(404).json({ message: 'Message not found or unauthorized' });

    // ✅ FIX: Apply lazy defaults to sender
    res.json({
      ...result.toObject(),
      sender: result.sender ? applyUserDefaults(result.sender) : null
    });
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

    // Delete all attachments from Cloudinary
    for (const att of message.attachments || []) {
      try {
        if (att.publicId) {
          const resourceType = att.type === 'video' ? 'video' : 'image';
          await deleteCloudinaryAsset(att.publicId, resourceType);
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
      .populate('readBy.user deliveredTo.user', 'name username profilePicture isOnline lastSeen bio');

    if (!message) return res.status(404).json({ message: 'Message not found' });

    // ✅ FIX: Apply lazy defaults to users in readBy and deliveredTo
    const readByWithDefaults = (message.readBy || []).map(rb => ({
      ...rb,
      user: rb.user ? applyUserDefaults(rb.user) : null
    }));

    const deliveredToWithDefaults = (message.deliveredTo || []).map(dt => 
      dt.user ? applyUserDefaults(dt.user) : null
    ).filter(Boolean);

    res.json({
      readBy: readByWithDefaults,
      deliveredTo: deliveredToWithDefaults,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get receipts', error: error.message });
  }
}

// Get message reactions
// ✅ FIX: Now queries MessageReaction collection for analytics and detailed data
// Returns formatted frontend structure: { emoji, users: [userId, ...] }
async function getMessageReactions(req, res) {
  try {
    const { messageId } = req.params;

    // Verify message exists
    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    // Fetch all reactions from MessageReaction collection
    const reactions = await MessageReaction.find({ message: messageId })
      .populate('reactor', '_id name username profilePicture')
      .sort({ reactedAt: -1 })
      .lean();

    // Format for frontend: { emoji, users: [userId, ...] }
    const formattedReactions = formatReactionsForFrontend(reactions);

    res.json(formattedReactions);
  } catch (error) {
    console.error('getMessageReactions error:', error);
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

    const allParticipants = [
      { user: creatorId, role: 'admin', joinedAt: new Date() },
      ...participants.map(id => ({
        user: new mongoose.Types.ObjectId(id),
        role: 'member',
        joinedAt: new Date(),
      })),
    ];

    // ✅ FIX (Bug #6): Initialize unreadCounts for all participants with 0
    const unreadCounts = allParticipants.map(p => ({
      user: p.user,
      count: 0
    }));

    const chat = new Chat({
      convoType: 'group',
      title: name,
      participants: allParticipants,
      unreadCounts: unreadCounts,
    });

    await chat.save();
    await chat.populate('participants.user', 'name username profilePicture isOnline lastSeen bio');
    
    // ✅ FIX: Apply lazy defaults to participants
    const chatObj = chat.toObject();
    res.status(201).json({
      ...chatObj,
      participants: chatObj.participants?.map(p => ({
        ...p,
        user: p.user ? applyUserDefaults(p.user) : null,
        role: p.role || 'member',
        joinedAt: p.joinedAt || new Date(),
      })) || [],
    });
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
      .populate('participants.user', 'name username profilePicture isOnline lastSeen bio')
      .populate('creator', 'name username');

    if (!chat) return res.status(403).json({ message: 'Chat not found or access denied' });

    // ✅ FIX: Apply lazy defaults to participants
    const chatObj = chat.toObject();
    res.json({
      ...chatObj,
      participants: chatObj.participants?.map(p => ({
        ...p,
        user: p.user ? applyUserDefaults(p.user) : null,
        role: p.role || 'member',
        joinedAt: p.joinedAt || new Date(),
      })) || [],
    });
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
      .populate('sender', 'name username profilePicture isOnline lastSeen bio')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // ✅ FIX: Apply lazy defaults to sender objects
    const messagesWithDefaults = mediaMessages.map(msg => ({
      ...msg.toObject(),
      sender: msg.sender ? applyUserDefaults(msg.sender) : null
    }));

    res.json(messagesWithDefaults);
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

// ─────────────────────────────────────────────────────────────────────────────
// 🔐 END-TO-END ENCRYPTED MESSAGE HANDLING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send an encrypted message
 * Client encrypts message locally before sending
 * Server stores encrypted blob + metadata
 * Only recipient (with private key) can decrypt
 * 
 * Body: {
 *   receiverId: string,
 *   encryptedBody: string (base64),
 *   nonce: string (base64),
 *   msgType: string,
 *   attachments: array,
 *   quotedMsgId: string
 * }
 */
async function sendEncryptedMessage(req, res) {
  try {
    const { receiverId, encryptedBody, nonce, msgType = 'text', attachments = [], quotedMsgId } = req.body;
    const senderId = req.user._id;

    // Validate encryption parameters
    if (!encryptedBody || typeof encryptedBody !== 'string') {
      return res.status(400).json({ message: 'Invalid encrypted body' });
    }

    if (!nonce || typeof nonce !== 'string') {
      return res.status(400).json({ message: 'Invalid nonce' });
    }

    // Validate base64 format
    try {
      Buffer.from(encryptedBody, 'base64');
      Buffer.from(nonce, 'base64');
    } catch (error) {
      return res.status(400).json({ message: 'Encrypted body and nonce must be valid base64' });
    }

    // Validate attachments (matches Message schema: public_id, secure_url, resource_type)
    const validatedAttachments = (attachments || []).filter(att => {
      return (
        att &&
        typeof att === 'object' &&
        att.public_id &&
        typeof att.public_id === 'string' &&
        att.secure_url &&
        typeof att.secure_url === 'string' &&
        att.resource_type &&
        ['image', 'video', 'audio', 'file'].includes(att.resource_type) &&
        (!att.size || (typeof att.size === 'number' && att.size <= 50 * 1024 * 1024))
      );
    });

    // Find or create chat
    const userIds = [senderId.toString(), receiverId].sort();
    let chat = await Chat.findOne({
      convoType: 'direct',
      'participants.user': { $all: [new mongoose.Types.ObjectId(userIds[0]), new mongoose.Types.ObjectId(userIds[1])] },
      participants: { $size: 2 }
    });

    if (!chat) {
      const now = new Date();
      chat = new Chat({
        convoType: 'direct',
        participants: [
          { user: new mongoose.Types.ObjectId(userIds[0]), role: 'member', joinedAt: now },
          { user: new mongoose.Types.ObjectId(userIds[1]), role: 'member', joinedAt: now },
        ],
        lastActivityTimestamp: now
      });
      await chat.save();
    }

    const now = new Date();
    const message = new Message({
      sender: senderId,
      receiver: new mongoose.Types.ObjectId(receiverId),
      chat: chat._id,
      encryptedBody: encryptedBody,
      nonce: nonce,
      bodyText: '[Encrypted Message]',  // Placeholder for unencrypted view
      msgType,
      status: 'sent',
      attachments: validatedAttachments,
      quotedMsgId: quotedMsgId ? new mongoose.Types.ObjectId(quotedMsgId) : null,
      readBy: [{ user: senderId, readAt: now }],
      deliveredTo: [],
    });

    await message.save();
    await message.populate('sender', 'name username profilePicture isOnline lastSeen bio');

    // ✅ FIX: Apply lazy defaults to sender
    const messageWithDefaults = {
      ...message.toObject(),
      sender: message.sender ? applyUserDefaults(message.sender) : null,
      encrypted: true,
      message: 'Encrypted message sent successfully'
    };

    // ✅ FIX: Use chatActivity service instead of manual updatedAt
    const messageText = validatedAttachments.length ? '[Encrypted Media]' : '[Encrypted Message]';
    await updateChatOnNewMessage(chat._id.toString(), message._id.toString(), senderId.toString(), messageText);

    res.status(201).json(messageWithDefaults);
  } catch (error) {
    console.error('sendEncryptedMessage error:', error);
    res.status(500).json({
      message: 'Failed to send encrypted message',
      error: process.env.NODE_ENV === 'production' ? {} : error.message
    });
  }
}

/**
 * Get encrypted messages for a chat
 * Returns encryptedBody and nonce
 * Client decrypts locally using recipient's private key
 */
async function getEncryptedChatMessages(req, res) {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 50;
    const beforeMessageId = req.query.beforeMessageId;

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }

    // Verify user is in chat
    const chat = await Chat.findOne({
      _id: chatId,
      'participants.user': userId
    });

    if (!chat) {
      return res.status(403).json({ message: 'Chat not found or access denied' });
    }

    let query = { chat: chatId };

    if (beforeMessageId) {
      if (!mongoose.Types.ObjectId.isValid(beforeMessageId)) {
        return res.status(400).json({ message: 'Invalid beforeMessageId' });
      }

      const beforeMessage = await Message.findById(beforeMessageId);
      if (beforeMessage) {
        query.createdAt = { $lt: beforeMessage.createdAt };
      }
    }

    // Fetch encrypted messages
    const messages = await Message.find(query)
      .populate('sender', 'name username profilePicture isOnline lastSeen bio')
      .select('_id sender receiver chat encryptedBody nonce msgType status createdAt updatedAt editedAt unsentAt quotedMsgId reactions readBy deliveredTo')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    messages.reverse();

    // ✅ FIX: Apply lazy defaults to sender objects
    const messagesWithDefaults = messages.map(msg => ({
      ...msg,
      sender: msg.sender ? applyUserDefaults(msg.sender) : null,
      encrypted: true,
      displayText: msg.msgType === 'text' ? '[Encrypted Message]' : '[Media]'
    }));

    // Mark as read if received
    await Message.updateMany(
      {
        chat: chatId,
        sender: { $ne: userId },
        'readBy.user': { $ne: userId },
      },
      { $addToSet: { readBy: { user: userId, readAt: new Date() } } }
    );

    res.json({
      messages: messagesWithDefaults,
      hasMore: messages.length === limit,
      encryptionMethod: 'xchacha20-poly1305'
    });
  } catch (error) {
    console.error('getEncryptedChatMessages error:', error);
    res.status(500).json({
      message: 'Failed to get encrypted messages',
      error: process.env.NODE_ENV === 'production' ? {} : error.message
    });
  }
}

// Helper to detect and fill missing user population
async function enrichChatParticipantsIfNeeded(chat) {
  if (!chat.participants || !Array.isArray(chat.participants)) return chat;

  const missingUserIds = [];
  
  // Identify missing populated users
  chat.participants.forEach((p, idx) => {
    if (p && typeof p === 'object' && p.user) {
      // If user is just an ObjectId (not populated), mark it
      if (typeof p.user === 'string' || (p.user && !p.user.username)) {
        if (mongoose.Types.ObjectId.isValid(p.user)) {
          missingUserIds.push(p.user);
        }
      }
    }
  });

  // If there are missing users, fetch them
  if (missingUserIds.length > 0) {
    console.log(`🔍 Fetching ${missingUserIds.length} missing participant users...`);
    const users = await User.find({ _id: { $in: missingUserIds } })
      .select('name username profilePicture isOnline lastSeen bio')
      .lean();

    const userMap = {};
    users.forEach(u => {
      userMap[u._id.toString()] = u;
    });

    // Enrich participants with fetched users
    chat.participants = chat.participants.map(p => {
      if (p && typeof p === 'object' && p.user) {
        const userIdStr = (p.user._id || p.user).toString();
        if (userMap[userIdStr] && !p.user.username) {
          p.user = userMap[userIdStr];
        }
      }
      return p;
    });
  }

  return chat;
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
  sendEncryptedMessage,
  getEncryptedChatMessages,
  enrichChatParticipantsIfNeeded,  // Exporting the helper function
};