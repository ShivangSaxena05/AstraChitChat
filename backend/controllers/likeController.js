const Like = require('../models/Like');
const Post = require('../models/Post');

// @desc    Like or unlike a post
// @route   POST /api/posts/:postId/like
// @access  Private
const likePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user already liked the post
    const existingLike = await Like.findOne({ user: userId, post: postId });

    if (existingLike) {
      // Unlike the post
      await Like.findByIdAndDelete(existingLike._id);
      res.json({ message: 'Post unliked successfully' });
    } else {
      // Like the post
      await Like.create({ user: userId, post: postId });
      res.status(201).json({ message: 'Post liked successfully' });
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

module.exports = {
  likePost,
  getPostLikes
};
