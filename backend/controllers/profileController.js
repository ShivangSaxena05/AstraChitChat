const User = require('../models/User');
const Post = require('../models/Post');
const Follow = require('../models/Follow');
const Like = require('../models/Like');
const { getPresignedUploadUrl } = require('../services/mediaService');

// @desc    Get current user's profile
// @route   GET /api/profile/me
// @access  Private
const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            _id: user._id,
            displayName: user.name, // Aliased for client compatibility
            name: user.name,
            username: user.username,
            profilePictureUrl: user.profilePicture, // Aliased
            profilePicture: user.profilePicture,
            coverPhoto: user.coverPhoto || '',
            bio: user.bio || '',
            location: user.location || '',
            website: user.website || '',
            pronouns: user.pronouns || '',
            encryptionPublicKey: user.encryptionPublicKey || null,
            stats: {
                posts: user.postsCount || 0,
                followers: user.followersCount || 0,
                following: user.followingCount || 0,
                likes: user.totalLikesCount || 0,
            },
            isPrivate: user.isPrivate,
            isOnline: user.isOnline,
            lastSeen: user.lastSeen,
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

        const user = await User.findById(userId).select('-password -encryptionPublicKey');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // For E2EE, always include encryptionPublicKey if exists
        const fullUser = await User.findById(userId).select('encryptionPublicKey');

        // Check block/mute status
        let isBlocked = false;
        let isMuted = false;
        let isFollowing = false;
        if (req.user) {
            const currentUser = await User.findById(req.user._id);
            if (currentUser) {
                isBlocked = currentUser.blockedUsers && currentUser.blockedUsers.includes(userId);
                isMuted = currentUser.mutedUsers && currentUser.mutedUsers.includes(userId);
                isFollowing = await Follow.findOne({
                  follower: req.user._id,
                  following: userId
                });
            }
        }

        res.json({
            _id: user._id,
            displayName: user.name,
            name: user.name,
            username: user.username,
            profilePictureUrl: user.profilePicture,
            profilePicture: user.profilePicture,
            bio: user.bio || '',
            encryptionPublicKey: fullUser.encryptionPublicKey || null,
            stats: {
                posts: user.postsCount || 0,
                followers: user.followersCount || 0,
                following: user.followingCount || 0,
                likes: user.totalLikesCount || 0,
            },
            isPrivate: user.isPrivate,
            isTwoFactorEnabled: user.isTwoFactorEnabled,
            role: user.role,
            isBlocked,
            isMuted,
            isFollowing: !!isFollowing,
            isOnline: user.isOnline,
            lastSeen: user.lastSeen,
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
        const { presignedUrl, key, cloudfrontUrl } = await getPresignedUploadUrl({
            folder: 'profile',
            ownerId: req.user._id.toString(),
            fileName: `avatar.${ext}`,
            fileType,
            expiresIn: 300,
        });

        res.json({ presignedUrl, key, cloudfrontUrl });
    } catch (err) {
        res.status(500).json({ message: 'Could not generate avatar upload URL.', error: err.message });
    }
};

// @desc    Get a presigned URL for cover photo upload
// @route   GET /api/profile/cover-upload-url
// @access  Private
//
// Client flow:
//   1. GET /api/profile/cover-upload-url?fileType=image/jpeg
//   2. PUT <presignedUrl> with the image binary
//   3. PUT /api/profile/me with { coverPhoto: cloudfrontUrl }
const getCoverUploadUrl = async (req, res) => {
    const { fileType } = req.query;

    if (!fileType) {
        return res.status(400).json({ message: 'fileType query param is required (e.g. image/jpeg).' });
    }

    const allowedImageTypes = /^image\/(jpeg|jpg|png|webp)$/;
    if (!allowedImageTypes.test(fileType)) {
        return res.status(400).json({ message: 'Only JPEG, PNG, or WebP images are supported for cover photos.' });
    }

    try {
        const ext = fileType.split('/')[1];
        const { presignedUrl, key, cloudfrontUrl } = await getPresignedUploadUrl({
            folder: 'cover',
            ownerId: req.user._id.toString(),
            fileName: `cover.${ext}`,
            fileType,
            expiresIn: 300,
        });

        res.json({ presignedUrl, key, cloudfrontUrl });
    } catch (err) {
        res.status(500).json({ message: 'Could not generate cover photo upload URL.', error: err.message });
    }
};

module.exports = { getUserProfile, getUserProfileById, updateUserProfile, getAvatarUploadUrl, getCoverUploadUrl };
