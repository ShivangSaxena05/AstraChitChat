const User = require('../models/User');
const Post = require('../models/Post');

// @desc    Search users and posts
// @route   GET /api/search?q=query
// @access  Private
const searchAll = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim().length === 0) {
            return res.status(400).json({ message: 'Search query is required' });
        }

        const currentUserId = req.user ? req.user._id : null;

        // Search users by username or name (case insensitive)
        const userQuery = currentUserId ? { _id: { $ne: currentUserId } } : {};
        const users = await User.find({
            ...userQuery,
            $or: [
                { username: { $regex: q, $options: 'i' } },
                { name: { $regex: q, $options: 'i' } }
            ]
        }).select('username name profilePicture').limit(5);

        // Sort users so exact matches on username or name come first
        const exactMatchUsers = [];
        const otherUsers = [];
        const lowerQ = q.toLowerCase();

        users.forEach(user => {
            if (user.username.toLowerCase() === lowerQ || (user.name && user.name.toLowerCase() === lowerQ)) {
                exactMatchUsers.push(user);
            } else {
                otherUsers.push(user);
            }
        });
        const sortedUsers = [...exactMatchUsers, ...otherUsers];

        // Search posts by caption
        // Prioritize videos and flicks, but include images too if they match
        const posts = await Post.find({
            caption: { $regex: q, $options: 'i' }
        })
        .populate('user', 'username name profilePicture')
        .sort({ createdAt: -1 })
        .limit(20);

        res.json({
            users: sortedUsers,
            posts: posts
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

module.exports = { searchAll };
