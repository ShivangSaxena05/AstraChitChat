const Like = require('../models/Like');
const Post = require('../models/Post');
const User = require('../models/User');

// @desc    Like or unlike a post (idempotent toggle)
// @route   POST /api/posts/:postId/like
// @access  Private
// Returns: { message, liked: boolean, count: number }
// Uses UPSERT + UNIQUE constraint for idempotency — duplicate requests are safe
const likePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;

    // Validate post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check current like state
    const existingLike = await Like.findOne({ user: userId, post: postId });

    if (existingLike) {
      // Unlike: delete the like
      await Like.findByIdAndDelete(existingLike._id);
      
      // Decrement likesCount on Post
      await Post.findByIdAndUpdate(postId, { $inc: { likesCount: -1 } });
      
      // Atomically decrement post author's total likes
      await User.findByIdAndUpdate(post.user, { $inc: { totalLikesCount: -1 } });

      // Get fresh count from DB
      const count = await Like.countDocuments({ post: postId });
      
      res.json({ 
        message: 'Post unliked successfully',
        liked: false,
        count 
      });
    } else {
      // Like: create with UPSERT for idempotency
      // If duplicate (race condition), the unique index will prevent duplicates
      try {
        await Like.create({ user: userId, post: postId });
        
        // Increment likesCount on Post
        await Post.findByIdAndUpdate(postId, { $inc: { likesCount: 1 } });
        
        // Atomically increment post author's total likes
        await User.findByIdAndUpdate(post.user, { $inc: { totalLikesCount: 1 } });
      } catch (dbError) {
        // Handle duplicate key error (race condition)
        if (dbError.code === 11000) {
          // Another request created this like concurrently — treat as idempotent
          console.warn(`[Like] Duplicate like attempted for user ${userId} on post ${postId} — ignoring`);
        } else {
          throw dbError;
        }
      }

      // Get fresh count from DB
      const count = await Like.countDocuments({ post: postId });

      res.status(201).json({ 
        message: 'Post liked successfully',
        liked: true,
        count 
      });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error: could not like/unlike post', error: error.message });
  }
};

// @desc    Get likes for a post
// @route   GET /api/posts/:postId/likes
// @access  Private
const getPostLikes = async (req, res) => {
  try {
    const { postId } = req.params;

    const likes = await Like.find({ post: postId })
      .populate('user', 'name username profilePicture')
      .sort({ createdAt: -1 });

    res.json({ likes, count: likes.length });
  } catch (error) {
    res.status(500).json({ message: 'Server error: could not fetch likes', error: error.message });
  }
};

// @desc    Unlike a post (DELETE endpoint for clarity — idempotent)
// @route   DELETE /api/posts/:postId/like
// @access  Private
// Returns: { message, liked: false, count: number }
// Idempotent: calling multiple times is safe (will not error if like doesn't exist)
const unlikePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;

    // Validate post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Find and delete the like (if it exists)
    const like = await Like.findOne({ user: userId, post: postId });
    if (like) {
      await Like.findByIdAndDelete(like._id);
      // Decrement likesCount on Post
      await Post.findByIdAndUpdate(postId, { $inc: { likesCount: -1 } });
      // Decrement author's like count
      await User.findByIdAndUpdate(post.user, { $inc: { totalLikesCount: -1 } });
    }
    // If like doesn't exist, this is idempotent — just return success

    // Get fresh count from DB
    const count = await Like.countDocuments({ post: postId });

    res.json({ 
      message: 'Post unliked successfully',
      liked: false,
      count 
    });  } catch (error) {
    res.status(500).json({ message: 'Server error: could not unlike post', error: error.message });
  }
};

// @desc    Check if current user has liked a post
// @route   GET /api/posts/:postId/like/check
// @access  Private
const checkUserLike = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;

    // Validate post exists
    const post = await Post.findById(postId).select('likesCount');
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user has liked this post
    const like = await Like.findOne({ user: userId, post: postId });

    res.json({ 
      isLiked: !!like,
      count: post.likesCount || 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error: could not check like status', error: error.message });
  }
};

module.exports = {
    likePost,
    unlikePost,
    getPostLikes,
    checkUserLike
};
