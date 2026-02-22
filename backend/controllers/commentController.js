const Comment = require('../models/Comment');
const Post = require('../models/Post');

// @desc    Add a comment to a post
// @route   POST /api/posts/:postId/comments
// @access  Private
const addComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { text } = req.body;
    const userId = req.user._id;

    // Basic validation
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    // Check if post exists
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const comment = await Comment.create({
      user: userId,
      post: postId,
      text: text.trim()
    });

    // Populate user details
    await comment.populate('user', 'name username profilePicture');

    res.status(201).json({
      message: 'Comment added successfully',
      comment
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error: could not add comment', error: error.message });
  }
};

// @desc    Get comments for a post
// @route   GET /api/posts/:postId/comments
// @access  Private
const getPostComments = async (req, res) => {
  try {
    const { postId } = req.params;

    const comments = await Comment.find({ post: postId })
      .populate('user', 'name username profilePicture')
      .sort({ createdAt: -1 }); // Most recent first

    res.json({ comments, count: comments.length });
  } catch (error) {
    res.status(500).json({ message: 'Server error: could not fetch comments', error: error.message });
  }
};

// @desc    Delete a comment
// @route   DELETE /api/posts/:postId/comments/:commentId
// @access  Private
const deleteComment = async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const userId = req.user._id;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // Check if user owns the comment
    if (comment.user.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this comment' });
    }

    await Comment.findByIdAndDelete(commentId);

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error: could not delete comment', error: error.message });
  }
};

module.exports = {
  addComment,
  getPostComments,
  deleteComment
};
