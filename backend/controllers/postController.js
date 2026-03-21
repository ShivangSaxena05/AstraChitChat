const Post = require('../models/Post');
const User = require('../models/User');
const { deleteS3Object } = require('../services/mediaService');

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

        // Atomically increment user's post count
        await User.findByIdAndUpdate(req.user._id, { $inc: { postsCount: 1 } });

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

        // Atomically decrement user's post count
        await User.findByIdAndUpdate(req.user._id, { $inc: { postsCount: -1 } });

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

    try {
        // MVP Logic: Fetch the 10 most recent posts, populated with user info
        const posts = await Post.find({})
            .sort({ createdAt: -1 }) // Sort by newest first
            .limit(pageSize)
            .skip(pageSize * (page - 1))
            .populate('user', 'name username profilePicture');

        res.json({ posts, page });
    } catch (error) {
        res.status(500).json({ message: 'Server error: could not fetch posts', error: error.message });
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

module.exports = {
    createPost,
    deletePost,
    getFeedPosts,
    getShortVideos,
    getUserPosts,
};
