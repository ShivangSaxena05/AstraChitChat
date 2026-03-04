const User = require('../models/User');
const Post = require('../models/Post');
const Follow = require('../models/Follow');
const Like = require('../models/Like');
const Message = require('../models/Message');
const Chat = require('../models/Chat');

// @desc    Search users by username or name
// @route   GET /api/users/search?q=query
// @access  Private
const searchUsers = async (req, res) => {
    try {
        const { q } = req.query;
        console.log('Search query:', q);
        console.log('User ID from token:', req.user ? req.user._id : 'No user');

        if (!q || q.trim().length === 0) {
            return res.status(400).json({ message: 'Search query is required' });
        }

        const currentUser = await User.findById(req.user._id);
        const blockedUsers = currentUser.blockedUsers || [];

        // Find users who have blocked the current user
        const usersWhoBlockedMe = await User.find({ blockedUsers: req.user._id }).select('_id');
        const blockedByIds = usersWhoBlockedMe.map(u => u._id);

        const excludedUsers = [...blockedUsers, ...blockedByIds, req.user._id];

        // Search users by username or name (case insensitive), excluding self and blocked/blocking users
        const users = await User.find({
            _id: { $nin: excludedUsers },
            $or: [
                { username: { $regex: q, $options: 'i' } },
                { name: { $regex: q, $options: 'i' } }
            ]
        }).select('username name profilePicture').limit(20); // Limit results to 20

        console.log('Found users:', users);
        res.json({ users });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
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
            return res.status(400).json({ message: "You cannot block yourself" });
        }

        const currentUser = await User.findById(currentUserId);
        const targetUser = await User.findById(targetUserId);

        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        const isBlocked = currentUser.blockedUsers.includes(targetUserId);

        if (isBlocked) {
            // Unblock
            currentUser.blockedUsers = currentUser.blockedUsers.filter(
                id => id.toString() !== targetUserId.toString()
            );
            await currentUser.save();
            res.json({ message: "User unblocked successfully", isBlocked: false });
        } else {
            // Block
            currentUser.blockedUsers.push(targetUserId);
            // Optionally, we could unfollow here, but for now we just block
            await currentUser.save();
            res.json({ message: "User blocked successfully", isBlocked: true });
        }

    } catch (error) {
        console.error('Toggle block error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
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
            return res.status(400).json({ message: "You cannot mute yourself" });
        }

        const currentUser = await User.findById(currentUserId);
        const targetUser = await User.findById(targetUserId);

        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        const isMuted = currentUser.mutedUsers.includes(targetUserId);

        if (isMuted) {
            // Unmute
            currentUser.mutedUsers = currentUser.mutedUsers.filter(
                id => id.toString() !== targetUserId.toString()
            );
            await currentUser.save();
            res.json({ message: "User unmuted successfully", isMuted: false });
        } else {
            // Mute
            currentUser.mutedUsers.push(targetUserId);
            await currentUser.save();
            res.json({ message: "User muted successfully", isMuted: true });
        }

    } catch (error) {
        console.error('Toggle mute error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get blocked users
// @route   GET /api/users/blocked
// @access  Private
const getBlockedUsers = async (req, res) => {
    try {
        const currentUser = await User.findById(req.user._id).populate('blockedUsers', 'name username profilePicture');
        res.json(currentUser.blockedUsers || []);
    } catch (error) {
        console.error('Get blocked users error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get muted users
// @route   GET /api/users/muted
// @access  Private
const getMutedUsers = async (req, res) => {
    try {
        const currentUser = await User.findById(req.user._id).populate('mutedUsers', 'name username profilePicture');
        res.json(currentUser.mutedUsers || []);
    } catch (error) {
        console.error('Get muted users error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Export user data (GDPR)
// @route   GET /api/users/export
// @access  Private
const exportData = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId).lean();
        const posts = await Post.find({ user: userId }).lean();
        const follows = await Follow.find({ $or: [{ follower: userId }, { following: userId }] }).lean();
        const likes = await Like.find({ user: userId }).lean();

        const exportParams = {
            profile: user,
            posts,
            follows,
            likes,
            exportedAt: new Date()
        };

        res.setHeader('Content-disposition', 'attachment; filename=userdata.json');
        res.setHeader('Content-type', 'application/json');
        res.status(200).send(JSON.stringify(exportParams, null, 2));
    } catch (error) {
        console.error('Export data error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Delete user account
// @route   DELETE /api/users/me
// @access  Private
const deleteAccount = async (req, res) => {
    try {
        const userId = req.user._id;

        // Cascade delete all user's content
        await Post.deleteMany({ user: userId });
        await Follow.deleteMany({ $or: [{ follower: userId }, { following: userId }] });
        await Like.deleteMany({ user: userId });
        await Message.deleteMany({ sender: userId });

        // Remove user from chats
        const chats = await Chat.find({ 'participants.user': userId });
        for (let chat of chats) {
            chat.participants = chat.participants.filter(p => p.user.toString() !== userId.toString());
            await chat.save();
        }

        // Finally delete the user document
        await User.findByIdAndDelete(userId);

        res.json({ message: 'Account and all associated data deleted successfully' });
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

module.exports = { searchUsers, toggleBlockUser, toggleMuteUser, getBlockedUsers, getMutedUsers, exportData, deleteAccount };
