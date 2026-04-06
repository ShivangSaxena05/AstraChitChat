const express = require('express');
const {
  createPost,
  deletePost,
  getFeedPosts,
  getShortVideos,
  getUserPosts,
  getUserPostsById,
  searchPosts,
  sharePost
} = require('../controllers/postController');
const { likePost, unlikePost, getPostLikes, checkUserLike } = require('../controllers/likeController');
const { addComment, getPostComments, deleteComment, markCommentAsViewed, getCommentViews } = require('../controllers/commentController');
const { protect } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validateRequest');
const {
  createPostValidator,
  deletePostValidator,
  getPostValidator,
  likePostValidator,
  addCommentValidator,
  deleteCommentValidator,
  searchPostsValidator,
} = require('../validators/postValidators');

const router = express.Router();

// Search routes
router.get('/search', protect, validateRequest({ querySchema: searchPostsValidator }), searchPosts);

// Post CRUD routes
router.post('/upload', protect, validateRequest({ bodySchema: createPostValidator }), createPost);
router.get('/feed', protect, validateRequest({ querySchema: getPostValidator }), getFeedPosts);
router.get('/flicks', protect, validateRequest({ querySchema: getPostValidator }), getShortVideos);
router.get('/me', protect, validateRequest({ querySchema: getPostValidator }), getUserPosts);
router.get('/user/:userId', protect, validateRequest({ querySchema: getPostValidator }), getUserPostsById);
router.delete('/:postId', protect, validateRequest({ paramsSchema: deletePostValidator }), deletePost);

// Like routes
router.post('/:postId/like', protect, validateRequest({ paramsSchema: likePostValidator }), likePost);
router.delete('/:postId/like', protect, validateRequest({ paramsSchema: likePostValidator }), unlikePost);
router.get('/:postId/like/check', protect, validateRequest({ paramsSchema: likePostValidator }), checkUserLike);
router.get('/:postId/likes', protect, validateRequest({ paramsSchema: likePostValidator }), getPostLikes);

// Share route
router.post('/:postId/share', protect, validateRequest({ paramsSchema: likePostValidator }), sharePost);

// Comment routes
router.post('/:postId/comments', protect, validateRequest({ paramsSchema: addCommentValidator }), addComment);
router.get('/:postId/comments', protect, validateRequest({ paramsSchema: addCommentValidator }), getPostComments);
router.delete('/:postId/comments/:commentId', protect, validateRequest({ paramsSchema: deleteCommentValidator }), deleteComment);

// Comment view routes (pot-like functionality)
router.post('/:postId/comments/:commentId/view', protect, markCommentAsViewed);
router.get('/:postId/comments/:commentId/views', protect, getCommentViews);

module.exports = router;
