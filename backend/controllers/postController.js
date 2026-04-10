const mongoose = require('mongoose');
const Post = require('../models/Post');
const Like = require('../models/Like');
const User = require('../models/User');
const { deleteCloudinaryAsset } = require('../services/mediaService');
const { incrementStat, decrementStat } = require('../services/userStatsService');
const { sanitizePostForResponse, sanitizePostsForResponse } = require('../utils/postSanitizer');

// ─── Create Post ──────────────────────────────────────────────────────────────
// @route   POST /api/posts/upload
// @access  Private
// @body    {
//            media: [{ url, publicId, resourceType, width?, height?, duration? }],
//            caption?: string,
//            hashtags?: string[],
//            visibility?: 'public' | 'followers' | 'private',
//            location?: string
//          }
const createPost = async (req, res) => {
    const { media, caption, hashtags, visibility, location } = req.body;

    // Validate media array is present and non-empty
    if (!media || !Array.isArray(media) || media.length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Media array is required and must contain at least one item'
        });
    }

    // ✅ CRITICAL FIX: Validate each media object has required fields
    // Media objects must have url and publicId to be deletable and retrievable
    for (let i = 0; i < media.length; i++) {
        const mediaItem = media[i];
        
        if (!mediaItem.url || typeof mediaItem.url !== 'string') {
            return res.status(400).json({
                success: false,
                message: `Media item ${i + 1}: URL is required and must be a string`
            });
        }

        if (!mediaItem.publicId || typeof mediaItem.publicId !== 'string') {
            return res.status(400).json({
                success: false,
                message: `Media item ${i + 1}: publicId is required and must be a string`
            });
        }

        if (!mediaItem.resourceType || !['image', 'video'].includes(mediaItem.resourceType)) {
            return res.status(400).json({
                success: false,
                message: `Media item ${i + 1}: resourceType must be 'image' or 'video'`
            });
        }
    }

    try {
        // Create post with validated media
        const post = await Post.create({
            author:       req.user._id,
            media:        media,  // Array of validated Cloudinary objects
            caption:      caption || '',
            hashtags:     Array.isArray(hashtags) ? hashtags : [],
            visibility:   visibility || 'public',
            location:     location || null,
            likesCount:   0,
            commentsCount: 0,
            sharesCount:  0,
            savedCount:   0,
        });

        // ✅ CRITICAL FIX: Handle stat increment failure gracefully
        // Stats should update, but shouldn't block post creation if they fail
        // This prevents orphaned posts in the database
        let statError = null;
        try {
            await incrementStat(req.user._id, 'postsCount', 1);
            console.log(`[createPost] Stat incremented for user ${req.user._id}`);
        } catch (statErr) {
            statError = statErr;
            console.error('[createPost] ⚠️ Stat increment failed:', {
                userId: req.user._id,
                error: statErr?.message,
                code: statErr?.code,
            });
            // Continue anyway - post was successfully created
            // TODO: Queue this stat update for background retry job
            // Example: await queueStatSync(req.user._id, 'postsCount', 1);
        }

        // Populate author and sanitize before responding
        const populatedPost = await post.populate('author', 'name username profilePicture');
        const sanitized = sanitizePostForResponse(populatedPost, req.user._id);

        // Return success response
        // Include warning if stats weren't updated
        return res.status(201).json({
            success: true,
            message: 'Post created successfully',
            post: sanitized,
            _warnings: statError ? ['Post created but stats may not have updated. Please refresh your profile.'] : undefined,
        });

    } catch (error) {
        // Provide specific error messages for different failure types
        console.error('[createPost] Post creation failed:', {
            error: error?.message,
            code: error?.code,
            name: error?.name,
            userId: req.user._id,
        });

        // Handle validation errors from MongoDB schema
        if (error.name === 'ValidationError') {
            const details = Object.entries(error.errors)
                .map(([field, err]) => `${field}: ${err.message}`)
                .join('; ');
            
            return res.status(400).json({
                success: false,
                message: 'Invalid post data',
                details
            });
        }

        // Handle duplicate key errors
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'Post already exists (duplicate)'
            });
        }

        // Generic server error with safe error message
        res.status(500).json({
            success: false,
            message: 'Failed to create post. Please try again later.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ─── Delete Post ──────────────────────────────────────────────────────────────
// @route   DELETE /api/posts/:postId
// @access  Private — owner only
const deletePost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId);

        if (!post) return res.status(404).json({ message: 'Post not found.' });

        if (post.author.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Forbidden: you can only delete your own posts.' });
        }

        // Delete from Cloudinary (best-effort — don't block on failure)
        if (post.media && Array.isArray(post.media)) {
            for (const mediaItem of post.media) {
                if (mediaItem.public_id) {
                    try {
                        await deleteCloudinaryAsset(mediaItem.public_id, mediaItem.resource_type);
                    } catch (err) {
                        console.error('[deletePost] Cloudinary delete failed:', mediaItem.public_id, err.message);
                    }
                }
            }
        }

        await post.deleteOne();
        await decrementStat(req.user._id, 'postsCount', 1);

        res.json({ message: 'Post deleted successfully.' });
    } catch (error) {
        console.error('[deletePost]', error);
        res.status(500).json({ message: 'Server error: could not delete post', error: error.message });
    }
};

// ─── Toggle Like ──────────────────────────────────────────────────────────────
// @route   POST /api/posts/:postId/like
// @access  Private
const toggleLike = async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ message: 'Invalid post ID.' });
        }

        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ message: 'Post not found.' });

        const existingLike = await Like.findOne({
            user: userId,
            target: postId,
            targetType: 'post'
        });

        if (existingLike) {
            // Unlike
            await Like.deleteOne({ _id: existingLike._id });
            await Post.findByIdAndUpdate(postId, { $inc: { likesCount: -1 } });
            res.json({
                liked: false,
                likes: post.likesCount - 1,
            });
        } else {
            // Like
            await Like.create({
                user: userId,
                target: postId,
                targetType: 'post'
            });
            await Post.findByIdAndUpdate(postId, { $inc: { likesCount: 1 } });
            res.json({
                liked: true,
                likes: post.likesCount + 1,
            });
        }
    } catch (error) {
        console.error('[toggleLike]', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// ─── Share Post ───────────────────────────────────────────────────────────────
// @route   POST /api/posts/:postId/share
// @access  Private (fire-and-forget)
const sharePost = async (req, res) => {
    // Respond immediately — don't make client wait
    res.json({ message: 'Share recorded', postId: req.params.postId });

    // Async increment in background
    Post.findByIdAndUpdate(req.params.postId, { $inc: { sharesCount: 1 } })
        .catch(err => console.error('[sharePost] increment failed:', err.message));
};

// ─── Feed Posts ───────────────────────────────────────────────────────────────
// @route   GET /api/posts/feed
// @access  Private
const getFeedPosts = async (req, res) => {
    const pageSize = 10;
    const page     = Math.max(Number(req.query.page) || 1, 1);
    const category = (req.query.category || 'for-you').toLowerCase();
    const userId   = req.user._id;

    try {
        let filter = {};
        let sort   = { createdAt: -1 };

        switch (category) {
            case 'trending':
                filter = { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } };
                sort   = { likesCount: -1, createdAt: -1 };  // sort by engagement
                break;
            case 'videos':
            case 'flicks':
                filter = { 'media.resource_type': 'video' };
                break;
            case 'images':
            case 'posts':
                filter = { 'media.resource_type': 'image' };
                break;
            case 'for-you':
            default: {
                // Show posts from people they follow; fall back to all if no follows
                const currentUser = await User.findById(userId).select('following').lean();
                if (currentUser?.following?.length > 0) {
                    filter = { author: { $in: currentUser.following } };
                }
                break;
            }
        }

        // ✅ FIX: Optimize query execution
        // 1. Use select() to only fetch needed fields initially
        // 2. Fetch one extra to determine hasMore
        // 3. Use .lean() early for better performance
        const posts = await Post.find(filter)
            .select('author caption media likesCount commentsCount createdAt')
            .sort(sort)
            .limit(pageSize + 1)
            .skip(pageSize * (page - 1))
            .lean()
            .exec();

        // Populate author with needed fields after lean
        const postsWithAuthor = await Promise.all(
            posts.map(async (post) => {
                const author = await User.findById(post.author)
                    .select('name username profilePicture')
                    .lean();
                return { ...post, author };
            })
        );

        const hasMore = postsWithAuthor.length > pageSize;
        const data = postsWithAuthor.slice(0, pageSize);

        const sanitized = data.map(post => sanitizePostForResponse(post, userId));

        res.json({ posts: sanitized, page, hasMore, category });
    } catch (error) {
        console.error('[getFeedPosts]', error);
        res.status(500).json({
            message: 'Server error: could not fetch posts',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// ─── Short Videos / Flicks ────────────────────────────────────────────────────
// @route   GET /api/posts/flicks
// @access  Private
const getShortVideos = async (req, res) => {
    const pageSize = 10;
    const page     = Math.max(Number(req.query.page) || 1, 1);
    const userId   = req.user._id;

    try {
        // ✅ FIX: Optimize video query
        const raw = await Post.find({ 'media.resource_type': 'video' })
            .select('author caption media likesCount commentsCount createdAt')
            .sort({ createdAt: -1 })
            .limit(pageSize + 1)
            .skip(pageSize * (page - 1))
            .lean()
            .exec();

        // Populate author with needed fields after lean
        const postsWithAuthor = await Promise.all(
            raw.map(async (post) => {
                const author = await User.findById(post.author)
                    .select('name username profilePicture')
                    .lean();
                return { ...post, author };
            })
        );

        const hasMore = postsWithAuthor.length > pageSize;
        const data = postsWithAuthor.slice(0, pageSize);

        res.json({
            posts:    data.map(post => sanitizePostForResponse(post, userId)),
            page,
            hasMore,
            category: 'flicks',
        });
    } catch (error) {
        console.error('[getShortVideos]', error);
        res.status(500).json({ message: 'Server error: could not fetch videos', error: error.message });
    }
};

// ─── User Posts by ID ─────────────────────────────────────────────────────────
// @route   GET /api/posts/user/:userId
// @access  Private
const getUserPostsById = async (req, res) => {
    const { userId } = req.params;
    const requesterId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid user ID format.' });
    }

    try {
        const posts = await Post.find({ author: userId })
            .sort({ createdAt: -1 })
            .populate('author', 'name username profilePicture')
            .lean();

        res.json({ posts: posts.map(p => sanitizePostForResponse(p, requesterId)) });
    } catch (error) {
        res.status(500).json({ message: 'Server error: could not fetch user posts', error: error.message });
    }
};

// ─── Own Posts ────────────────────────────────────────────────────────────────
// @route   GET /api/posts/me
// @access  Private
const getUserPosts = async (req, res) => {
    const userId = req.user._id;
    try {
        const posts = await Post.find({ author: userId })
            .sort({ createdAt: -1 })
            .populate('author', 'name username profilePicture')
            .lean();

        res.json({ posts: posts.map(p => sanitizePostForResponse(p, userId)) });
    } catch (error) {
        res.status(500).json({ message: 'Server error: could not fetch user posts', error: error.message });
    }
};

// ─── Search Posts ─────────────────────────────────────────────────────────────
// @route   GET /api/posts/search?q=...
// @access  Private
const searchPosts = async (req, res) => {
    const { q, limit = 20 } = req.query;
    const userId = req.user._id;

    if (!q || typeof q !== 'string' || !q.trim()) {
        return res.status(400).json({ message: 'Search query is required.' });
    }
    if (q.length > 100) {
        return res.status(400).json({ message: 'Search query too long (max 100 chars).' });
    }

    try {
        const searchLimit  = Math.min(Number(limit) || 20, 100);
        const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchRegex  = new RegExp(escapedQuery, 'i');

        // Find matching users first (can't query populated fields in MongoDB)
        const matchingUsers = await User.find({ username: searchRegex }).select('_id').lean();
        const userIds       = matchingUsers.map(u => u._id);

        const posts = await Post.find({
            $or: [
                { caption:  searchRegex },
                { hashtags: searchRegex },
                { author:     { $in: userIds } },   // ✅ correct way to search by username
            ],
        })
            .sort({ createdAt: -1 })
            .limit(searchLimit)
            .populate('author', 'name username profilePicture')
            .lean();

        res.json({ posts: posts.map(p => sanitizePostForResponse(p, userId)) });
    } catch (error) {
        console.error('[searchPosts]', error);
        res.status(500).json({
            message: 'Search failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

module.exports = {
    createPost,
    deletePost,
    toggleLike,
    sharePost,
    getFeedPosts,
    getShortVideos,
    getUserPosts,
    getUserPostsById,
    searchPosts,
};