const User = require('../models/User');

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

        // Search users by username or name (case insensitive), excluding self
        const users = await User.find({
            _id: { $ne: req.user._id },
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

module.exports = { searchUsers };
