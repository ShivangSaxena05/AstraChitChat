const express = require('express');
const {
  createPost,
  deletePost,
  getFeedPosts,
  getShortVideos,
  getUserPosts,
  getUserPostsById
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
router.get('/user/:userId', protect, getUserPostsById);
router.delete('/:postId', protect, deletePost);

// Like routes
router.post('/:postId/like', protect, likePost);
router.get('/:postId/likes', protect, getPostLikes);

// Comment routes
router.post('/:postId/comments', protect, addComment);
router.get('/:postId/comments', protect, getPostComments);
router.delete('/:postId/comments/:commentId', protect, deleteComment);

module.exports = router;
