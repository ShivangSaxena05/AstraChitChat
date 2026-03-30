const User = require('../models/User');
const Post = require('../models/Post');
const Follow = require('../models/Follow');
const Like = require('../models/Like');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const { deleteS3Object, deleteFromCloudinary, STORAGE_TYPE } = require('../services/mediaService');
const { applyUserDefaults } = require('../utils/lazyDefaults');

// @desc    Search users by username or name
// @route   GET /api/users/search?q=query
// @access  Private
const searchUsers = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const currentUser = await User.findById(req.user._id).select('blockedUsers');
    const blockedUsers = currentUser?.blockedUsers || [];

    const usersWhoBlockedMe = await User.find({ blockedUsers: req.user._id }).select('_id');
    const blockedByIds = usersWhoBlockedMe.map(u => u._id);

    const excludedUsers = [...blockedUsers, ...blockedByIds, req.user._id];

    const users = await User.find({
      _id: { $nin: excludedUsers },
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
      ],
    })
      .select('username name profilePicture isOnline lastSeen')
      .limit(20);

    // Apply lazy defaults to all returned users
    const usersWithDefaults = users.map(user => applyUserDefaults(user));

    res.json({ users: usersWithDefaults });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      message: 'Server Error', 
      error: process.env.NODE_ENV === 'production' ? {} : error.message 
    });
  }
};

// @desc    Toggle block/unblock a user
// @route   POST /api/users/:userId/block
// @access  Private
const toggleBlockUser = async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const currentUserId = req.user._id;

    if (targetUserId === currentUserId.toString()) {
      return res.status(400).json({ message: 'You cannot block yourself' });
    }

    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(targetUserId),
    ]);

    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    // Ensure blockedUsers array exists
    if (!currentUser.blockedUsers) {
      currentUser.blockedUsers = [];
    }

    const isBlocked = currentUser.blockedUsers.some(
      id => id.toString() === targetUserId
    );

    if (isBlocked) {
      currentUser.blockedUsers = currentUser.blockedUsers.filter(
        id => id.toString() !== targetUserId
      );
      await currentUser.save();
      return res.json({ message: 'User unblocked successfully', isBlocked: false });
    } else {
      currentUser.blockedUsers.push(targetUserId);
      await currentUser.save();
      return res.json({ message: 'User blocked successfully', isBlocked: true });
    }
  } catch (error) {
    console.error('Toggle block error:', error);
    res.status(500).json({ 
      message: 'Server Error', 
      error: process.env.NODE_ENV === 'production' ? {} : error.message 
    });
  }
};

// @desc    Toggle mute/unmute a user
// @route   POST /api/users/:userId/mute
// @access  Private
const toggleMuteUser = async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const currentUserId = req.user._id;

    if (targetUserId === currentUserId.toString()) {
      return res.status(400).json({ message: 'You cannot mute yourself' });
    }

    const currentUser = await User.findById(currentUserId);
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    const isMuted = currentUser.mutedUsers.some(
      id => id.toString() === targetUserId
    );

    if (isMuted) {
      currentUser.mutedUsers = currentUser.mutedUsers.filter(
        id => id.toString() !== targetUserId
      );
      await currentUser.save();
      return res.json({ message: 'User unmuted successfully', isMuted: false });
    } else {
      currentUser.mutedUsers.push(targetUserId);
      await currentUser.save();
      return res.json({ message: 'User muted successfully', isMuted: true });
    }
  } catch (error) {
    console.error('Toggle mute error:', error);
    res.status(500).json({ 
      message: 'Server Error', 
      error: process.env.NODE_ENV === 'production' ? {} : error.message 
    });
  }
};

// @desc    Get blocked users
// @route   GET /api/users/blocked
// @access  Private
const getBlockedUsers = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id)
      .populate('blockedUsers', 'name username profilePicture');
    res.json(currentUser.blockedUsers || []);
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({ 
      message: 'Server Error', 
      error: process.env.NODE_ENV === 'production' ? {} : error.message 
    });
  }
};

// @desc    Get muted users
// @route   GET /api/users/muted
// @access  Private
const getMutedUsers = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id)
      .populate('mutedUsers', 'name username profilePicture');
    res.json(currentUser.mutedUsers || []);
  } catch (error) {
    console.error('Get muted users error:', error);
    res.status(500).json({ 
      message: 'Server Error', 
      error: process.env.NODE_ENV === 'production' ? {} : error.message 
    });
  }
};

// @desc    Export user data (GDPR)
// @route   GET /api/users/export
// @access  Private
const exportData = async (req, res) => {
  try {
    const userId = req.user._id;

    // FIX: exclude password and 2FA secret from the export
    const user = await User.findById(userId)
      .select('-password -twoFactorSecret')
      .lean();

    const posts  = await Post.find({ user: userId }).lean();
    const follows = await Follow.find({
      $or: [{ follower: userId }, { following: userId }],
    }).lean();
    const likes = await Like.find({ user: userId }).lean();

    const exportPayload = {
      profile: user,
      posts,
      follows,
      likes,
      exportedAt: new Date(),
    };

    res.setHeader('Content-Disposition', 'attachment; filename=userdata.json');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify(exportPayload, null, 2));
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ 
      message: 'Server Error', 
      error: process.env.NODE_ENV === 'production' ? {} : error.message 
    });
  }
};

// @desc    Delete user account and all associated data
// @route   DELETE /api/users/me
// @access  Private
const deleteAccount = async (req, res) => {
  try {
    const userId = req.user._id;

    // Best-effort: clean up media files for all posts before deleting DB records
    const posts = await Post.find({ user: userId }).select('mediaKey mediaUrl').lean();
    for (const post of posts) {
      if (post.mediaKey) {
        try {
          if (STORAGE_TYPE === 'cloudinary') {
            const publicId = post.mediaUrl?.split('/').slice(-2).join('/').replace(/\.[^/.]+$/, '');
            if (publicId) await deleteFromCloudinary(publicId);
          } else {
            await deleteS3Object(post.mediaKey);
          }
        } catch (err) {
          console.warn('Post media cleanup failed:', err.message);
        }
      }
    }

    // Best-effort: clean up media for messages sent by this user
    const messages = await Message.find({ sender: userId, mediaKey: { $exists: true } })
      .select('mediaKey mediaUrl attachments')
      .lean();

    for (const msg of messages) {
      if (msg.mediaKey) {
        try {
          if (STORAGE_TYPE === 'cloudinary') {
            const publicId = msg.mediaUrl?.split('/').slice(-2).join('/').replace(/\.[^/.]+$/, '');
            if (publicId) await deleteFromCloudinary(publicId);
          } else {
            await deleteS3Object(msg.mediaKey);
          }
        } catch (err) {
          console.warn('Message media cleanup failed:', err.message);
        }
      }
      for (const att of msg.attachments || []) {
        try {
          if (STORAGE_TYPE === 'cloudinary') {
            const publicId = att.url?.split('/').slice(-2).join('/').replace(/\.[^/.]+$/, '');
            if (publicId) await deleteFromCloudinary(publicId);
          } else if (att.key) {
            await deleteS3Object(att.key);
          }
        } catch (err) {
          console.warn('Attachment cleanup failed:', err.message);
        }
      }
    }

    // Cascade delete DB records
    await Post.deleteMany({ user: userId });
    await Follow.deleteMany({ $or: [{ follower: userId }, { following: userId }] });
    await Like.deleteMany({ user: userId });
    await Message.deleteMany({ sender: userId });

    // Remove user from all chat participant lists
    await Chat.updateMany(
      { 'participants.user': userId },
      { $pull: { participants: { user: userId } } }
    );

    // Finally delete the user document
    await User.findByIdAndDelete(userId);

    res.json({ message: 'Account and all associated data deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ 
      message: 'Server Error', 
      error: process.env.NODE_ENV === 'production' ? {} : error.message 
    });
  }
};

module.exports = {
  searchUsers,
  toggleBlockUser,
  toggleMuteUser,
  getBlockedUsers,
  getMutedUsers,
  exportData,
  deleteAccount,
};