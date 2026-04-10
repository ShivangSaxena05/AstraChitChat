const asyncHandler = require('./asyncHandler');
const { Story, User } = require('../models');
const { deleteCloudinaryAsset } = require('../services/mediaService');

// ─── Upload Story ─────────────────────────────────────────────────────────────
// @route   POST /api/stories
// @access  Private
// @body    {
//            mediaUrl: string (from Cloudinary upload)
//            mediaPublicId: string (Cloudinary public_id)
//            mediaType: 'image' | 'video'
//            textOverlay: Array<{ id, text, fontSize, color }>
//            drawings: Array (optional, ephemeral)
//          }
exports.uploadStory = asyncHandler(async (req, res) => {
    const {
        mediaUrl,           // Cloudinary secure_url
        mediaPublicId,      // Cloudinary public_id — required for deletion
        mediaType,          // 'image' | 'video'
        thumbnailUrl,       // optional: for video stories
        duration,           // REQUIRED for videos: duration in seconds
        textOverlay,        // optional: text overlays
        drawings,           // optional: drawing overlays
    } = req.body;

    const userId = req.user._id;

    // Validate required fields
    if (!mediaUrl || !mediaPublicId || !mediaType) {
        return res.status(400).json({
            success: false,
            message: 'mediaUrl, mediaPublicId, and mediaType are required.'
        });
    }

    if (!['image', 'video'].includes(mediaType)) {
        return res.status(400).json({
            success: false,
            message: 'mediaType must be image or video.'
        });
    }

    // ✅ CRITICAL FIX: Validate video duration
    // Video stories MUST have a duration (in seconds)
    // This allows downstream services to differentiate between:
    // - Flicks (duration <= 60 seconds, 9:16 aspect ratio)
    // - Long videos (duration > 60 seconds, variable aspect ratio)
    if (mediaType === 'video') {
        if (!duration || typeof duration !== 'number' || duration <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Duration is required for video stories and must be a positive number (in seconds)'
            });
        }
    }

    // Build media object matching Story schema
    const media = {
        public_id: mediaPublicId,
        secure_url: mediaUrl,
        resource_type: mediaType,
        format: mediaType === 'video' ? 'mp4' : 'jpg',
        thumbnail_url: thumbnailUrl || null,
        duration: mediaType === 'video' ? duration : null  // Only for videos
    };

    // Sanitize text overlays — only keep text content, not position
    const sanitizedTextOverlay = Array.isArray(textOverlay)
        ? textOverlay.map(overlay => ({
              id: overlay.id,
              text: overlay.text?.trim() || '',
              fontSize: overlay.fontSize || 24,
              color: overlay.color || '#FFFFFF'
              // x, y, rotation intentionally NOT persisted (ephemeral)
          }))
        : [];

    // Drawings are typically ephemeral, but include if provided
    const sanitizedDrawings = Array.isArray(drawings) ? drawings : [];

    // Set expiration to 24 hours from now
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create story
    const story = await Story.create({
        author: userId,
        media,
        textOverlay: sanitizedTextOverlay,
        drawings: sanitizedDrawings,
        expiresAt,
        visibility: 'public'
    });

    // Populate author details
    await story.populate('author', 'name username profilePicture');

    res.status(201).json({
        success: true,
        message: 'Story uploaded successfully',
        data: story
    });
});

// ─── Stories Feed (from followed users) ───────────────────────────────────────
// @route   GET /api/stories/feed
// @access  Private
exports.getStoriesFeed = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const currentUser = await User.findById(userId).select('following').lean();
    if (!currentUser) {
        return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const followingIds = currentUser.following || [];

    // Always include own stories in feed too
    const authorIds = [userId, ...followingIds];

    // ✅ FIX: Optimize story query with select and lean early
    const stories = await Story.find({
        author:    { $in: authorIds },
        expiresAt: { $gt: new Date() },
    })
        .select('author media viewsCount createdAt expiresAt visibility')
        .sort({ createdAt: -1 })
        .lean()
        .exec();

    // Populate author with needed fields after lean
    const storiesWithAuthor = await Promise.all(
        stories.map(async (story) => {
            const author = await User.findById(story.author)
                .select('name username profilePicture')
                .lean();
            return { ...story, author };
        })
    );

    // Group by user so frontend can show story rings per user
    const grouped = groupStoriesByUser(storiesWithAuthor, userId.toString());

    res.json({ success: true, data: grouped });
});

// ─── Get a Specific User's Stories ────────────────────────────────────────────
// @route   GET /api/stories/user/:userId
// @access  Private
exports.getUserStories = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const requesterId = req.user._id.toString();

    // ✅ FIX: Use `author` field instead of `user`
    const stories = await Story.find({
        author:    userId,
        expiresAt: { $gt: new Date() },
    })
        .select('author media viewsCount createdAt expiresAt visibility')
        .sort({ createdAt: -1 })
        .lean()
        .exec();

    // Populate author with needed fields after lean
    const storiesWithAuthor = await Promise.all(
        stories.map(async (story) => {
            const author = await User.findById(story.author)
                .select('name username profilePicture')
                .lean();
            return { ...story, author };
        })
    );

    // Mark which ones requester has already seen
    const sanitized = storiesWithAuthor.map(s => ({
        ...s,
        isSeen: s.viewedBy && s.viewedBy.some(v => v.user.toString() === requesterId),
        // Don't expose full viewers list to non-owners
        viewedBy: s.author._id.toString() === requesterId ? s.viewedBy : undefined,
    }));

    res.json({ success: true, data: sanitized });
});

// ─── View Story ───────────────────────────────────────────────────────────────
// @route   POST /api/stories/:storyId/view
// @access  Private
exports.viewStory = asyncHandler(async (req, res) => {
    const { storyId } = req.params;
    const viewerId    = req.user._id;

    // Respond immediately — don't make client wait
    res.json({ success: true, message: 'Story view recorded.' });

    // Update in background
    Story.findOneAndUpdate(
        {
            _id: storyId,
            expiresAt: { $gt: new Date() },
            'viewers.userId': { $ne: viewerId },   // only add if not already viewed
        },
        {
            $push: { viewers: { userId: viewerId, viewedAt: new Date() } },
        }
    ).catch(err => console.error('[viewStory] update failed:', err.message));
});

// ─── Delete Story ─────────────────────────────────────────────────────────────
// @route   DELETE /api/stories/:storyId
// @access  Private — owner only
exports.deleteStory = asyncHandler(async (req, res) => {
    const { storyId } = req.params;
    const userId      = req.user._id;

    const story = await Story.findById(storyId);

    if (!story) {
        return res.status(404).json({ success: false, message: 'Story not found.' });
    }

    if (story.user.toString() !== userId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to delete this story.' });
    }

    // Delete from Cloudinary (best-effort)
    if (story.mediaPublicId) {
        const resourceType = story.mediaType === 'video' ? 'video' : 'image';
        deleteCloudinaryAsset(story.mediaPublicId, resourceType)
            .catch(err => console.error('[deleteStory] Cloudinary delete failed:', err.message));
    }

    await Story.findByIdAndDelete(storyId);

    res.json({ success: true, message: 'Story deleted successfully.' });
});

// ─── Get Story Viewers ────────────────────────────────────────────────────────
// @route   GET /api/stories/:storyId/viewers
// @access  Private — owner only
exports.getStoryViewers = asyncHandler(async (req, res) => {
    const { storyId } = req.params;
    const userId      = req.user._id;

    const story = await Story.findById(storyId)
        .populate('viewers.userId', 'name username profilePicture')
        .select('user viewers');

    if (!story) {
        return res.status(404).json({ success: false, message: 'Story not found.' });
    }

    if (story.user.toString() !== userId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to view story viewers.' });
    }

    res.json({ success: true, data: story.viewers });
});

// ─── Helper: group stories by user for feed ring UI ──────────────────────────
function groupStoriesByUser(stories, requesterId) {
    const map = new Map();

    for (const story of stories) {
        const uid = story.user._id.toString();
        if (!map.has(uid)) {
            map.set(uid, {
                user:    story.user,
                stories: [],
                hasUnseen: false,
            });
        }
        const entry = map.get(uid);
        const isSeen = story.viewers.some(v => v.userId.toString() === requesterId);
        entry.stories.push({ ...story, isSeen });
        if (!isSeen) entry.hasUnseen = true;
    }

    // Own stories first, then sort by hasUnseen
    return Array.from(map.values()).sort((a, b) => {
        if (a.user._id.toString() === requesterId) return -1;
        if (b.user._id.toString() === requesterId) return 1;
        return b.hasUnseen - a.hasUnseen;
    });
}
