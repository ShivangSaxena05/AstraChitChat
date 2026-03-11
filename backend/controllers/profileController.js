const User = require('../models/User');
const Post = require('../models/Post');
const Follow = require('../models/Follow');
const Like = require('../models/Like');
<<<<<<< HEAD
=======
const { getPresignedUploadUrl } = require('../services/mediaService');
>>>>>>> upstream/master

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

        // Get total likes count
        const userPosts = await Post.find({ user: req.user._id }).select('_id');
        const postIds = userPosts.map(p => p._id);
        const totalLikes = await Like.countDocuments({ post: { $in: postIds } });

        res.json({
            _id: user._id,
<<<<<<< HEAD
=======
            name: user.name,
>>>>>>> upstream/master
            username: user.username || user.name.toLowerCase().replace(/\s+/g, ''),
            profilePicture: user.profilePicture,
            bio: user.bio || '',
            stats: {
                posts: postCount,
                followers: followersCount,
                following: followingCount,
                likes: totalLikes,
            },
            isPrivate: user.isPrivate,
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

        // Get total likes count
        const userPosts = await Post.find({ user: userId }).select('_id');
        const postIds = userPosts.map(p => p._id);
        const totalLikes = await Like.countDocuments({ post: { $in: postIds } });

<<<<<<< HEAD
=======
        // Check block/mute status
        let isBlocked = false;
        let isMuted = false;
        if (req.user) {
            const currentUser = await User.findById(req.user._id);
            isBlocked = currentUser.blockedUsers && currentUser.blockedUsers.includes(userId);
            isMuted = currentUser.mutedUsers && currentUser.mutedUsers.includes(userId);
        }

>>>>>>> upstream/master
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
                likes: totalLikes,
            },
            isPrivate: user.isPrivate,
            isTwoFactorEnabled: user.isTwoFactorEnabled,
            role: user.role,
            isBlocked,
            isMuted,
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
    const { name, username, bio, profilePicture, coverPhoto, location, website, pronouns, isPrivate } = req.body;

    try {
        const user = await User.findById(req.user._id);

        if (user) {
            user.name = name !== undefined ? name : user.name;
            user.username = username !== undefined ? username : user.username;
            user.bio = bio !== undefined ? bio : user.bio;
            user.profilePicture = profilePicture !== undefined ? profilePicture : user.profilePicture;
            user.coverPhoto = coverPhoto !== undefined ? coverPhoto : user.coverPhoto;
            user.location = location !== undefined ? location : user.location;
            user.website = website !== undefined ? website : user.website;
            user.pronouns = pronouns !== undefined ? pronouns : user.pronouns;

            if (isPrivate !== undefined) {
                user.isPrivate = isPrivate;
            }

            const updatedUser = await user.save();
            res.json({ message: 'Profile updated successfully', user: updatedUser });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Get a presigned URL for profile picture upload
// @route   GET /api/profile/avatar-upload-url
// @access  Private
//
// Client flow:
//   1. GET /api/profile/avatar-upload-url?fileType=image/jpeg
//   2. PUT <presignedUrl> with the image binary
//   3. PUT /api/profile/me with { profilePicture: cloudfrontUrl }
const getAvatarUploadUrl = async (req, res) => {
    const { fileType } = req.query;

    if (!fileType) {
        return res.status(400).json({ message: 'fileType query param is required (e.g. image/jpeg).' });
    }

    const allowedImageTypes = /^image\/(jpeg|jpg|png|webp)$/;
    if (!allowedImageTypes.test(fileType)) {
        return res.status(400).json({ message: 'Only JPEG, PNG, or WebP images are supported for avatars.' });
    }

    try {
        const ext = fileType.split('/')[1];
        const { presignedUrl, key, cloudfrontUrl } = await getPresignedUploadUrl(
            req.user._id.toString(),
            `avatar.${ext}`,
            fileType,
            300 // 5 minutes
        );

        res.json({ presignedUrl, key, cloudfrontUrl });
    } catch (err) {
        res.status(500).json({ message: 'Could not generate avatar upload URL.', error: err.message });
    }
};

module.exports = { getUserProfile, getUserProfileById, updateUserProfile, getAvatarUploadUrl };
