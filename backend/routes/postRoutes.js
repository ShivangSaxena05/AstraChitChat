const express = require('express');
const {
  createPost,
  getFeedPosts,
  getShortVideos,
  getUserPosts
} = require('../controllers/postController');
const { likePost, getPostLikes } = require('../controllers/likeController');
const { addComment, getPostComments, deleteComment } = require('../controllers/commentController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Post CRUD routes
router.post('/upload', protect, createPost);
router.get('/feed', protect, getFeedPosts);
router.get('/flicks', protect, getShortVideos);
router.get('/me', protect, getUserPosts);

// Like routes
router.post('/:postId/like', protect, likePost);
router.get('/:postId/likes', protect, getPostLikes);

// Comment routes
router.post('/:postId/comments', protect, addComment);
router.get('/:postId/comments', protect, getPostComments);
router.delete('/:postId/comments/:commentId', protect, deleteComment);

module.exports = router;
