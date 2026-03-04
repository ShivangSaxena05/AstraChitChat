const express = require('express');
const {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  checkFollowStatus,
  acceptFollowRequest,
  rejectFollowRequest,
  getFollowRequests
} = require('../controllers/followController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Follow requests
router.get('/requests', protect, getFollowRequests);
router.post('/requests/:userId/accept', protect, acceptFollowRequest);
router.post('/requests/:userId/reject', protect, rejectFollowRequest);

// Follow/unfollow routes
router.post('/:userId', protect, followUser);
router.delete('/:userId', protect, unfollowUser);

// Get followers/following
router.get('/:userId/followers', protect, getFollowers);
router.get('/:userId/following', protect, getFollowing);

// Check follow status
router.get('/:userId/check', protect, checkFollowStatus);

module.exports = router;
