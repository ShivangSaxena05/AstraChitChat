const express = require('express');
const {
  uploadStory,
  getStoriesFeed,
  getUserStories,
  viewStory,
  deleteStory,
  getStoryViewers
} = require('../controllers/storyController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Protected routes
router.post('/', protect, uploadStory);
router.get('/feed', protect, getStoriesFeed);
router.post('/:storyId/view', protect, viewStory);
router.delete('/:storyId', protect, deleteStory);
router.get('/:storyId/viewers', protect, getStoryViewers);

// Public route
router.get('/user/:userId', getUserStories);

module.exports = router;
