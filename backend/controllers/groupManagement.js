// backend/controllers/groupManagement.js - New group admin features

const mongoose = require('mongoose');
const Chat = require('../models/Chat');
const User = require('../models/User');
const toObjectId = id => new mongoose.Types.ObjectId(id);

/**
 * POST /api/chats/:chatId/leave
 * User leaves group chat (non-admin can leave, admin can leave if >2 members)
 */
async function leaveGroup(req, res) {
  try {
    const { chatId } = req.params;
    const userId = req.user._id.toString();

    const chat = await Chat.findById(chatId).populate('participants.user', '_id role');
    if (!chat || chat.convoType !== 'group') return res.status(404).json({ message: 'Group chat not found' });

    const participant = chat.participants.find(p => p.user._id.toString() === userId);
    if (!participant) return res.status(403).json({ message: 'Not a participant' });

    // ✅ FIX: Admin can only leave if there are other admins (not based on total member count)
    // Check if admin is trying to leave
    if (participant.role === 'admin') {
      // Count remaining admins after this admin leaves
      const remainingAdmins = chat.participants.filter(
        p => p.role === 'admin' && p.user._id.toString() !== userId
      ).length;
      
      // Block if this would be the last admin
      if (remainingAdmins === 0) {
        return res.status(400).json({ message: 'Last admin cannot leave group' });
      }
    }

    // Remove participant
    chat.participants = chat.participants.filter(p => p.user.toString() !== userId);
    chat.markModified('participants');
    await chat.save();

    return res.json({ message: 'Left group successfully' });
  } catch (error) {
    console.error('leaveGroup error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
}

/**
 * POST /api/chats/:chatId/add-member
 * Admin adds member to group (validate user exists)
 */
async function addGroupMember(req, res) {
  try {
    const { chatId } = req.params;
    const { userId: newMemberId } = req.body;
    const adminId = req.user._id.toString();

    if (!newMemberId) return res.status(400).json({ message: 'userId required' });

    const chat = await Chat.findById(chatId).populate('participants.user', '_id');
    if (!chat || chat.convoType !== 'group') return res.status(404).json({ message: 'Group chat not found' });

    // ✅ FIX: p.user is populated object, so use p.user._id.toString() not p.user.toString()
    const adminParticipant = chat.participants.find(p => p.user._id.toString() === adminId);
    if (!adminParticipant || adminParticipant.role !== 'admin') {
      return res.status(403).json({ message: 'Admin only' });
    }

    // Check if already member
    if (chat.participants.some(p => p.user._id.toString() === newMemberId)) {
      return res.status(400).json({ message: 'User already a member' });
    }

    // Validate new member exists
    const newMember = await User.findById(newMemberId);
    if (!newMember) return res.status(404).json({ message: 'User not found' });

    // Add as member
    chat.participants.push({
      user: toObjectId(newMemberId),
      role: 'member',
      joinedAt: new Date()
    });
    chat.markModified('participants');
    await chat.save();

    return res.json({ message: 'Member added successfully' });
  } catch (error) {
    console.error('addGroupMember error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
}

/**
 * POST /api/chats/:chatId/remove-member
 * Admin removes member from group (cannot remove self/admin unless last admin)
 */
async function removeGroupMember(req, res) {
  try {
    const { chatId } = req.params;
    const { userId: targetId } = req.body;
    const adminId = req.user._id.toString();

    if (!targetId) return res.status(400).json({ message: 'userId required' });

    const chat = await Chat.findById(chatId).populate('participants.user', '_id role');
    if (!chat || chat.convoType !== 'group') return res.status(404).json({ message: 'Group chat not found' });

    // ✅ FIX: p.user is populated object, so use p.user._id.toString() not p.user.toString()
    const adminParticipant = chat.participants.find(p => p.user._id.toString() === adminId);
    if (!adminParticipant || adminParticipant.role !== 'admin') {
      return res.status(403).json({ message: 'Admin only' });
    }

    const targetParticipant = chat.participants.find(p => p.user._id.toString() === targetId);
    if (!targetParticipant) return res.status(404).json({ message: 'Member not found' });

    // Cannot remove self
    if (targetId === adminId) return res.status(400).json({ message: 'Cannot remove self' });

    // Cannot remove last admin
    const remainingAdmins = chat.participants.filter(p => p.role === 'admin' && p.user._id.toString() !== targetId).length;
    if (targetParticipant.role === 'admin' && remainingAdmins === 0) {
      return res.status(400).json({ message: 'Cannot remove last admin' });
    }

    // Remove member
    chat.participants = chat.participants.filter(p => p.user._id.toString() !== targetId);
    chat.markModified('participants');
    await chat.save();

    return res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('removeGroupMember error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
}

module.exports = {
  leaveGroup,
  addGroupMember,
  removeGroupMember
};

