const mongoose = require('mongoose');
const Post = require('../models/Post');
const User = require('../models/User');
const { deleteS3Object } = require('../services/mediaService');
const { incrementStat, decrementStat } = require('../services/userStatsService');

// @desc    Create a new post
// @route   POST /api/posts/upload
// @access  Private (uses 'protect' middleware)
const createPost = async (req, res) => {
    const { mediaUrl, mediaKey, mediaType, caption } = req.body;

    if (!mediaUrl || !mediaType) {
        return res.status(400).json({ message: 'Media URL and Type are required.' });
    }

    try {
        const post = await Post.create({
            user: req.user._id,
            mediaUrl,
            mediaKey,   // S3 object key — used to delete the file when the post is removed
            mediaType,
            caption,
        });

        // Update stats using UserStats service (atomically)
        await incrementStat(req.user._id, 'postsCount', 1);

        res.status(201).json({
            message: 'Post created successfully',
            post
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error: could not create post', error: error.message });
    }
};

// @desc    Delete a post (and its S3 file)
// @route   DELETE /api/posts/:postId
// @access  Private — only the post owner can delete
const deletePost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.postId);

        if (!post) {
            return res.status(404).json({ message: 'Post not found.' });
        }

        // Ownership check
        if (post.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Forbidden: you can only delete your own posts.' });
        }

        // Delete from S3 first (best-effort — do not block on S3 failures)
        if (post.mediaKey) {
            try {
                await deleteS3Object(post.mediaKey);
            } catch (s3Err) {
                // Log but don't fail the request — the DB record should still be removed
                console.error('[postController] S3 delete failed for key:', post.mediaKey, s3Err.message);
            }
        }

        await post.deleteOne();

        // Update stats using UserStats service (atomically)
        await decrementStat(req.user._id, 'postsCount', 1);

        res.json({ message: 'Post deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error: could not delete post', error: error.message });
    }
};

// @desc    Get the social feed (posts from people user follows + trending)
// @route   GET /api/posts/feed
// @access  Private
const getFeedPosts = async (req, res) => {
    const pageSize = 10;
    const page = Number(req.query.page) || 1;
    const category = req.query.category || 'for-you';

    // Validate inputs
    if (page < 1) {
        return res.status(400).json({ message: 'Page must be >= 1' });
    }

    try {
        let filter = {};

        // Apply category filter
        switch (category.toLowerCase()) {
            case 'trending':
                filter = {
                    createdAt: { 
                        $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) 
                    }
                };
                break;
            case 'videos':
                filter = { mediaType: { $in: ['flick', 'video'] } };
                break;
            case 'images':
                filter = { mediaType: 'image' };
                break;
            case 'posts':
                // Posts category: image posts only (exclude videos)
                filter = { mediaType: 'image' };
                break;
            default:
                filter = {};
        }

        // Fetch one extra to determine if more posts exist
        const posts = await Post.find(filter)
            .sort({ createdAt: -1 })
            .limit(pageSize + 1)
            .skip(pageSize * (page - 1))
            .populate('user', 'name username profilePicture')
            .lean();

        // Determine if there are more pages
        const hasMore = posts.length > pageSize;
        const data = posts.slice(0, pageSize);

        // Sanitize response
        const sanitized = data.map(post => ({
            _id: post._id || '',
            mediaUrl: post.mediaUrl || '',
            mediaType: post.mediaType || 'post',
            caption: post.caption || '',
            // Determine type: video, photo, or text
            type: post.mediaType === 'flick' ? 'video' : (post.mediaUrl && post.mediaType === 'image' ? 'photo' : 'text'),
            user: {
                _id: post.user?._id || '',
                username: post.user?.username || 'unknown',
                profilePicture: post.user?.profilePicture || ''
            },
            createdAt: post.createdAt?.toISOString() || new Date().toISOString(),
            // Convert array to count
            likes: Array.isArray(post.likes) ? post.likes.length : (Number(post.likes) || 0),
            comments: Array.isArray(post.comments) ? post.comments.length : (Number(post.comments) || 0),
            hashtags: Array.isArray(post.hashtags) ? post.hashtags : []
        }));

        res.json({
            posts: sanitized,
            page,
            hasMore,
            category
        });
    } catch (error) {
        console.error('[getFeedPosts]', error);
        res.status(500).json({ 
            message: 'Server error: could not fetch posts', 
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// @desc    Get short videos (flicks)
// @route   GET /api/posts/flicks
// @access  Private
const getShortVideos = async (req, res) => {
    const pageSize = 10;
    const page = Number(req.query.page) || 1;

    try {
        // Fetch posts where mediaType is 'flick'
        const flicks = await Post.find({ mediaType: 'flick' })
            .sort({ createdAt: -1 }) // Sort by newest first
            .limit(pageSize)
            .skip(pageSize * (page - 1))
            .populate('user', 'name username profilePicture');

        res.json({ flicks, page });
    } catch (error) {
        res.status(500).json({ message: 'Server error: could not fetch flicks', error: error.message });
    }
};

// @desc    Get posts for a specific user by ID
// @route   GET /api/posts/user/:userId
// @access  Private
const getUserPostsById = async (req, res) => {
    try {
        const { userId } = req.params;

        // Validate userId is a valid MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'Invalid user ID format.' });
        }

        const posts = await Post.find({ user: userId })
            .sort({ createdAt: -1 })
            .populate('user', 'name username profilePicture');

        res.json({ posts });
    } catch (error) {
        res.status(500).json({ message: 'Server error: could not fetch user posts', error: error.message });
    }
};

// @desc    Get posts for the current user
// @route   GET /api/posts/me
// @access  Private
const getUserPosts = async (req, res) => {
    try {
        const posts = await Post.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .populate('user', 'name username profilePicture');

        res.json({ posts });
    } catch (error) {
        res.status(500).json({ message: 'Server error: could not fetch user posts', error: error.message });
    }
};

// @desc    Search posts by caption, hashtags, or username
// @route   GET /api/posts/search
// @access  Private
const searchPosts = async (req, res) => {
    const { q, limit = 20 } = req.query;

    // Validate search query
    if (!q || typeof q !== 'string' || q.trim().length === 0) {
        return res.status(400).json({ message: 'Search query is required' });
    }

    if (q.length > 100) {
        return res.status(400).json({ message: 'Search query too long (max 100 chars)' });
    }

    try {
        const searchLimit = Math.min(Number(limit) || 20, 100);
        
        // Escape special regex characters to prevent regex injection
        const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchRegex = new RegExp(escapedQuery, 'i');

        const posts = await Post.find({
            $or: [
                { caption: searchRegex },
                { hashtags: searchRegex },
                { 'user.username': searchRegex }
            ]
        })
            .sort({ createdAt: -1 })
            .limit(searchLimit)
            .populate('user', 'name username profilePicture')
            .lean();

        // Sanitize response to ensure data integrity
        const sanitized = posts.map(post => ({
            _id: post._id || '',
            mediaUrl: post.mediaUrl || '',
            mediaType: post.mediaType || 'post',
            caption: post.caption || '',
            user: {
                _id: post.user?._id || '',
                username: post.user?.username || 'unknown',
                profilePicture: post.user?.profilePicture || ''
            },
            createdAt: post.createdAt?.toISOString() || new Date().toISOString(),
            likes: Number(post.likes || 0),
            comments: Number(post.comments || 0),
            hashtags: Array.isArray(post.hashtags) ? post.hashtags : []
        }));

        res.json({ posts: sanitized });
    } catch (error) {
        console.error('[searchPosts]', error);
        res.status(500).json({
            message: 'Search failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    createPost,
    deletePost,
    getFeedPosts,
    getShortVideos,
    getUserPosts,
    getUserPostsById,
    searchPosts,
};
