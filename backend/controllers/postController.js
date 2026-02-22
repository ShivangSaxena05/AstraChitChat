const Post = require('../models/Post');
const User = require('../models/User'); // Needed for updating user metrics or referencing

// @desc    Create a new post
// @route   POST /api/posts/upload
// @access  Private (uses 'protect' middleware)
const createPost = async (req, res) => {
    // 1. req.user comes from the 'protect' middleware (it holds the authenticated user's ID)
    const { mediaUrl, mediaType, caption } = req.body;

    // Basic validation
    if (!mediaUrl || !mediaType) {
        return res.status(400).json({ message: 'Media URL and Type are required.' });
    }

    try {
        const post = await Post.create({
            user: req.user._id, // Use the ID attached by the middleware
            mediaUrl,
            mediaType,
            caption,
        });

        // Optional: Update user's post count or add notification logic here later

        res.status(201).json({
            message: 'Post created successfully',
            post
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error: could not create post', error: error.message });
    }
};

// @desc    Get the social feed (posts from people user follows + trending)
// @route   GET /api/posts/feed
// @access  Private (uses 'protect' middleware)
const getFeedPosts = async (req, res) => {
    const userId = req.user._id;
    const pageSize = 10;
    const page = Number(req.query.page) || 1; // For pagination

    try {
        // MVP Logic: Fetch the 10 most recent posts, populated with user info
        const posts = await Post.find({})
            .sort({ createdAt: -1 }) // Sort by newest first
            .limit(pageSize)
            .skip(pageSize * (page - 1))
            .populate('user', 'name username profilePicture'); // Include name as fallback

        // Full Logic (for later):
        // 1. Get IDs of users the current user (userId) is following.
        // 2. Query posts from those users (and/or add a trending algorithm).

        res.json({
            posts,
            page,
            // totalPages, // Add this when implementing full logic
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error: could not fetch posts', error: error.message });
    }
};

// @desc    Get short videos (flicks)
// @route   GET /api/posts/flicks
// @access  Private (uses 'protect' middleware)
const getShortVideos = async (req, res) => {
    const pageSize = 10;
    const page = Number(req.query.page) || 1;

    try {
        // Fetch posts where mediaType is 'flick'
        const flicks = await Post.find({ mediaType: 'flick' })
            .sort({ createdAt: -1 }) // Sort by newest first
            .limit(pageSize)
            .skip(pageSize * (page - 1))
            .populate('user', 'name username profilePicture'); // Include name as fallback

        res.json({
            flicks,
            page,
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error: could not fetch flicks', error: error.message });
    }
};

// @desc    Get posts for the current user
// @route   GET /api/posts/me
// @access  Private
const getUserPosts = async (req, res) => {
    const userId = req.user._id;

    try {
        const posts = await Post.find({ user: userId })
            .sort({ createdAt: -1 })
            .populate('user', 'name username profilePicture');

        res.json({
            posts,
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error: could not fetch user posts', error: error.message });
    }
};

module.exports = {
    createPost,
    getFeedPosts,
    getShortVideos,
    getUserPosts,
    // likePost, // Add like/comment functions here later
};
