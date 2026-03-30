const User = require('../models/User');
const UserStats = require('../models/UserStats');
const Follow = require('../models/Follow');
const { getPresignedUploadUrl } = require('../services/mediaService');
const { getUserStats } = require('../services/userStatsService');
const { applyUserDefaults, serializeUser } = require('../utils/lazyDefaults');

// @desc    Get current user's profile
// @route   GET /api/profile/me
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Apply lazy defaults asynchronously (fire-and-forget)
    const userWithDefaults = applyUserDefaults(user);

    // Fetch stats from UserStats model
    const userStats = await getUserStats(req.user._id);

    res.json({
      _id: userWithDefaults._id,
      displayName: userWithDefaults.name,
      name: userWithDefaults.name,
      username: userWithDefaults.username,
      profilePictureUrl: userWithDefaults.profilePicture,
      profilePicture: userWithDefaults.profilePicture,
      coverPhoto: userWithDefaults.coverPhoto || '',
      bio: userWithDefaults.bio || '',
      location: userWithDefaults.location || '',
      website: userWithDefaults.website || '',
      pronouns: userWithDefaults.pronouns || '',
      encryptionPublicKey: userWithDefaults.encryptionPublicKey || null,
      stats: {
        posts: userStats?.postsCount || userWithDefaults.postsCount || 0,
        followers: userStats?.followersCount || userWithDefaults.followersCount || 0,
        following: userStats?.followingCount || userWithDefaults.followingCount || 0,
        likes: userStats?.totalLikesCount || userWithDefaults.totalLikesCount || 0,
      },
      isPrivate: userWithDefaults.isPrivate || false,
      isOnline: userWithDefaults.isOnline ?? false,
      lastSeen: userWithDefaults.lastSeen,
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

    // Fetch user info and stats in parallel
    const [user, userStats] = await Promise.all([
      User.findById(userId).select('-password'),
      getUserStats(userId),
    ]);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Apply lazy defaults asynchronously (fire-and-forget)
    const userWithDefaults = applyUserDefaults(user);

    let isBlocked = false;
    let isMuted = false;
    let isFollowing = false;

    if (req.user) {
      const currentUser = await User.findById(req.user._id).select('blockedUsers mutedUsers');
      if (currentUser) {
        isBlocked = currentUser.blockedUsers?.some(id => id.toString() === userId) ?? false;
        isMuted = currentUser.mutedUsers?.some(id => id.toString() === userId) ?? false;
        isFollowing = !!(await Follow.findOne({ follower: req.user._id, following: userId }));
      }
    }

    res.json({
      _id: userWithDefaults._id,
      displayName: userWithDefaults.name,
      name: userWithDefaults.name,
      username: userWithDefaults.username,
      profilePictureUrl: userWithDefaults.profilePicture,
      profilePicture: userWithDefaults.profilePicture,
      coverPhoto: userWithDefaults.coverPhoto || '',
      bio: userWithDefaults.bio || '',
      encryptionPublicKey: userWithDefaults.encryptionPublicKey || null,
      stats: {
        posts: userStats?.postsCount || userWithDefaults.postsCount || 0,
        followers: userStats?.followersCount || userWithDefaults.followersCount || 0,
        following: userStats?.followingCount || userWithDefaults.followingCount || 0,
        likes: userStats?.totalLikesCount || userWithDefaults.totalLikesCount || 0,
      },
      isPrivate: userWithDefaults.isPrivate || false,
      isTwoFactorEnabled: userWithDefaults.isTwoFactorEnabled || false,
      role: userWithDefaults.role || 'user',
      isBlocked,
      isMuted,
      isFollowing,
      isOnline: userWithDefaults.isOnline ?? false,
      lastSeen: userWithDefaults.lastSeen,
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
    if (!user) return res.status(404).json({ message: 'User not found' });

    // FIX: check for username conflicts before saving
    if (username && username !== user.username) {
      const taken = await User.findOne({ username, _id: { $ne: req.user._id } });
      if (taken) {
        return res.status(400).json({ message: 'Username is already taken' });
      }
    }

    user.name        = name        !== undefined ? name        : user.name;
    user.username    = username    !== undefined ? username    : user.username;
    user.bio         = bio         !== undefined ? bio         : user.bio;
    user.profilePicture = profilePicture !== undefined ? profilePicture : user.profilePicture;
    user.coverPhoto  = coverPhoto  !== undefined ? coverPhoto  : user.coverPhoto;
    user.location    = location    !== undefined ? location    : user.location;
    user.website     = website     !== undefined ? website     : user.website;
    user.pronouns    = pronouns    !== undefined ? pronouns    : user.pronouns;
    if (isPrivate !== undefined) user.isPrivate = isPrivate;

    const updatedUser = await user.save();
    res.json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get a presigned URL for profile picture upload
// @route   GET /api/profile/avatar-upload-url
// @access  Private
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

module.exports = {
  getUserProfile,
  getUserProfileById,
  updateUserProfile,
  getAvatarUploadUrl,
  getCoverUploadUrl,
};