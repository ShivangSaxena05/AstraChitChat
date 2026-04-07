const User = require('../models/User');
const Follower = require('../models/Follower');
const Block = require('../models/Block');
const { deleteCloudinaryAsset } = require('../services/mediaService');
const { getUserStats } = require('../services/userStatsService');
const { applyUserDefaults } = require('../utils/lazyDefaults');

const CLOUDINARY_CLOUD = process.env.CLOUDINARY_CLOUD_NAME || 'astrachat';

// ─── Helper: build Cloudinary URL with transformations ────────────────────────
// Instead of presigned S3 URLs, we just store the public_id and build URLs here
function buildCloudinaryUrl(publicId, opts = {}) {
    if (!publicId) return '';
    const { width, height, crop = 'fill', gravity, radius, quality = 'auto', format = 'auto' } = opts;
    const transforms = [
        width    && `w_${width}`,
        height   && `h_${height}`,
        crop     && `c_${crop}`,
        gravity  && `g_${gravity}`,
        radius   && `r_${radius}`,
        `q_${quality}`,
        `f_${format}`,
    ].filter(Boolean).join(',');

    return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/upload/${transforms}/${publicId}`;
}

// ─── Get own profile ──────────────────────────────────────────────────────────
// @route   GET /api/profile/me
// @access  Private
const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });

        const userWithDefaults = applyUserDefaults(user);
        const userStats = await getUserStats(req.user._id);

        res.json(serializeProfile(userWithDefaults, userStats));
    } catch (error) {
        console.error('[getUserProfile]', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// ─── Get another user's profile ───────────────────────────────────────────────
// @route   GET /api/profile/:userId
// @access  Private
const getUserProfileById = async (req, res) => {
    try {
        const { userId } = req.params;

        const [user, userStats] = await Promise.all([
            User.findById(userId).select('-password'),
            getUserStats(userId),
        ]);

        if (!user) return res.status(404).json({ message: 'User not found' });

        const userWithDefaults = applyUserDefaults(user);

        // Social relationship checks (run in parallel)
        const [isFollowing, blockRecord] = await Promise.all([
            Follower.findOne({ follower: req.user._id, following: userId, status: 'accepted' }).lean(),
            Block.findOne({ blocker: req.user._id, blocked: userId }).lean(),
        ]);

        const isBlocked  = !!blockRecord;
        const isMuted    = false; // TODO: Implement mute feature with a Mute model if needed

        res.json({
            ...serializeProfile(userWithDefaults, userStats),
            isBlocked,
            isMuted,
            isFollowing:        !!isFollowing,
            isTwoFactorEnabled: userWithDefaults.isTwoFactorEnabled || false,
        });
    } catch (error) {
        console.error('[getUserProfileById]', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// ─── Update profile ───────────────────────────────────────────────────────────
// @route   PUT /api/profile/me
// @access  Private
const updateUserProfile = async (req, res) => {
    const {
        name, username, bio,
        profilePicture, profilePublicId,   // Cloudinary URL + public_id
        coverPhoto,     coverPublicId,
        location, website, pronouns, isPrivate,
    } = req.body;

    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Username conflict check
        if (username && username !== user.username) {
            const taken = await User.findOne({ username, _id: { $ne: req.user._id } });
            if (taken) return res.status(400).json({ message: 'Username is already taken.' });
        }

        // ✅ DELETE OLD PROFILE PICTURE IF NEW ONE PROVIDED
        // This handles the case where user updates profile via PUT endpoint
        // (instead of using /media/upload/profile-picture which auto-deletes)
        if (profilePublicId && user.profilePublicId && profilePublicId !== user.profilePublicId) {
            deleteCloudinaryAsset(user.profilePublicId, 'image')
                .then(() => {
                    console.log(`[updateProfile] Deleted old profile picture: ${user.profilePublicId}`);
                })
                .catch(err => {
                    console.warn('[updateProfile] Could not delete old profile picture:', err.message);
                    // Non-blocking: continue even if deletion fails
                    // User can still proceed; old picture just remains in Cloudinary (will be cleaned up later)
                });
        }

        // ✅ DELETE OLD COVER PHOTO IF NEW ONE PROVIDED
        if (coverPublicId && user.coverPublicId && coverPublicId !== user.coverPublicId) {
            deleteCloudinaryAsset(user.coverPublicId, 'image')
                .then(() => {
                    console.log(`[updateProfile] Deleted old cover photo: ${user.coverPublicId}`);
                })
                .catch(err => {
                    console.warn('[updateProfile] Could not delete old cover photo:', err.message);
                    // Non-blocking: continue even if deletion fails
                });
        }

        // Apply updates
        if (name           !== undefined) user.name           = name;
        if (username       !== undefined) user.username       = username;
        if (bio            !== undefined) user.bio            = bio;
        // Handle profilePicture as nested object (schema expects { public_id, secure_url, resource_type, version })
        if (profilePicture !== undefined) {
            if (profilePicture && typeof profilePicture === 'string') {
                // If string URL is passed, construct the nested object
                user.profilePicture = {
                    secure_url: profilePicture,
                    public_id: profilePublicId || null,
                    resource_type: 'image',
                    version: Math.floor(Date.now() / 1000),
                };
            } else if (profilePicture && typeof profilePicture === 'object') {
                // If object is passed, use it directly
                user.profilePicture = profilePicture;
            } else {
                // If null/undefined, clear it
                user.profilePicture = null;
            }
        }
        if (profilePublicId!== undefined) user.profilePublicId= profilePublicId;
        if (coverPhoto     !== undefined) user.coverPhoto     = coverPhoto;
        if (coverPublicId  !== undefined) user.coverPublicId  = coverPublicId;
        if (location       !== undefined) user.location       = location;
        if (website        !== undefined) user.website        = website;
        if (pronouns       !== undefined) user.pronouns       = pronouns;
        if (isPrivate      !== undefined) user.isPrivate      = isPrivate;

        const updated = await user.save();
        const userStats = await getUserStats(req.user._id);

        console.log(`[updateUserProfile] Profile updated for user ${req.user._id}`);

        res.json({ message: 'Profile updated successfully', user: serializeProfile(updated, userStats) });
    } catch (error) {
        console.error('[updateUserProfile]', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// ─── Cloudinary upload signature (for signed uploads from backend) ─────────────
// @route   GET /api/profile/upload-signature
// @access  Private
// 
// NOTE: This endpoint is OPTIONAL and NOT CURRENTLY USED.
// 
// Current flow uses backend-centric uploads via /media/upload/profile-picture
// which programmatically uploads to Cloudinary and updates the User model.
// 
// ARCHITECTURE DECISION:
// ✅ Backend-Centric (Current)
//    - Backend handles Cloudinary upload directly
//    - Ensures consistent folder structure: myapp/profile/current/{userId}
//    - Independent of Cloudinary preset configurations
//    - User model automatically updated
//    - Old pictures automatically deleted on new upload
// 
// ❌ Preset-Based (Deprecated - shown for reference only)
//    - Would require frontend to use Cloudinary unsigned upload with preset
//    - Risk of folder mismatch if preset folder ≠ backend folder
//    - Would require separate User model update call
// 
// If future features require preset-based uploads, ensure that:
// 1. Preset folder in Cloudinary dashboard = backend MEDIA_FOLDERS path
// 2. Example: preset "astrachat_avatars" → folder "myapp/profile/current"
const getUploadSignature = async (req, res) => {
    const { uploadType } = req.query; // 'avatar' | 'cover'

    const presetMap = {
        avatar: process.env.CLOUDINARY_PRESET_AVATAR || 'astrachat_avatars',
        cover:  process.env.CLOUDINARY_PRESET_COVER  || 'astrachat_covers',
    };

    const preset = presetMap[uploadType];
    if (!preset) {
        return res.status(400).json({ message: 'uploadType must be avatar or cover.' });
    }

    // For unsigned uploads the frontend doesn't need a signature —
    // just return the preset name and cloud name
    res.json({
        cloudName:    CLOUDINARY_CLOUD,
        uploadPreset: preset,
        // Pass userId as public_id so avatar naturally overwrites on re-upload
        publicId:     req.user._id.toString(),
    });
};

// ─── Shared profile serializer ────────────────────────────────────────────────
function serializeProfile(user, userStats) {
    const profilePublicId = user.profilePublicId || (user.profilePicture?.public_id);
    const profilePictureUrl = profilePublicId
        ? buildCloudinaryUrl(profilePublicId, { width: 400, height: 400, gravity: 'face', radius: 'max' })
        : '';

    return {
        _id:              user._id,
        displayName:      user.name,
        name:             user.name,
        username:         user.username,
        // Return the Cloudinary optimized URL for profile picture
        profilePicture:   profilePictureUrl,
        profilePictureUrl: profilePictureUrl,
        profilePublicId:  profilePublicId || null,
        coverPhoto:       user.coverPhoto || '',
        bio:              user.bio || '',
        location:         user.location || '',
        website:          user.website || '',
        pronouns:         user.pronouns || '',
        stats: {
            posts:     userStats?.postsCount     || user.postsCount     || 0,
            followers: userStats?.followersCount || user.followersCount || 0,
            following: userStats?.followingCount || user.followingCount || 0,
            likes:     userStats?.totalLikesCount|| user.totalLikesCount|| 0,
        },
        isPrivate: user.isPrivate || false,
        isOnline:  user.isOnline  ?? false,
        lastSeen:  user.lastSeen  || null,
    };
}

module.exports = {
    getUserProfile,
    getUserProfileById,
    updateUserProfile,
    getUploadSignature,
};