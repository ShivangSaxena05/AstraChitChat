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
const { validateRequest } = require('../middleware/validateRequest');
const {
  uploadStoryValidator,
  deleteStoryValidator,
  viewStoryValidator,
  getStoryViewersValidator,
  getUserStoriesValidator,
} = require('../validators/storyValidators');

const router = express.Router();

// Protected routes
router.post('/', protect, validateRequest({ bodySchema: uploadStoryValidator }), uploadStory);
router.get('/feed', protect, getStoriesFeed);
router.post('/:storyId/view', protect, validateRequest({ paramsSchema: viewStoryValidator }), viewStory);
router.delete('/:storyId', protect, validateRequest({ paramsSchema: deleteStoryValidator }), deleteStory);
router.get('/:storyId/viewers', protect, validateRequest({ paramsSchema: getStoryViewersValidator }), getStoryViewers);

// Public route
router.get('/user/:userId', validateRequest({ paramsSchema: getUserStoriesValidator }), getUserStories);

module.exports = router;
