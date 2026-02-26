const User = require('../models/User');
const Post = require('../models/Post');
const Follow = require('../models/Follow');

// @desc    Get current user's profile
// @route   GET /api/profile/me
// @access  Private
const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get post count
        const postCount = await Post.countDocuments({ user: req.user._id });

        // Get follower/following counts
        const followersCount = await Follow.countDocuments({ following: req.user._id });
        const followingCount = await Follow.countDocuments({ follower: req.user._id });

        res.json({
            _id: user._id,
            username: user.username || user.name.toLowerCase().replace(/\s+/g, ''),
            profilePicture: user.profilePicture,
            bio: user.bio || '',
            stats: {
                posts: postCount,
                followers: followersCount,
                following: followingCount,
            },
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get another user's profile by ID
// @route   GET /api/profile/:userId
// @access  Private
const getUserProfileById = async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('Fetching profile for userId:', userId);

        const user = await User.findById(userId).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get post count
        const postCount = await Post.countDocuments({ user: userId });

        // Get follower/following counts
        const followersCount = await Follow.countDocuments({ following: userId });
        const followingCount = await Follow.countDocuments({ follower: userId });

        res.json({
            _id: user._id,
            name: user.name,
            username: user.username || user.name.toLowerCase().replace(/\s+/g, ''),
            profilePicture: user.profilePicture,
            bio: user.bio || '',
            stats: {
                posts: postCount,
                followers: followersCount,
                following: followingCount,
            },
        });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Update user profile
// @route   PUT /api/profile/me
// @access  Private
const updateUserProfile = async (req, res) => {
    const { username, bio, profilePicture } = req.body;

    try {
        const user = await User.findById(req.user._id);

        if (user) {
            user.username = username !== undefined ? username : user.username;
            user.bio = bio !== undefined ? bio : user.bio;
            user.profilePicture = profilePicture !== undefined ? profilePicture : user.profilePicture;

            const updatedUser = await user.save();
            res.json({ message: 'Profile updated successfully', user: updatedUser });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

module.exports = { getUserProfile, getUserProfileById, updateUserProfile };
