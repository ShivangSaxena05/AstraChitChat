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

// Follow requests (most specific - has 'requests' path)
router.get('/requests', protect, getFollowRequests);
router.post('/requests/:userId/accept', protect, acceptFollowRequest);
router.post('/requests/:userId/reject', protect, rejectFollowRequest);

// Get followers/following (specific before generic parameter)
router.get('/:userId/followers', protect, getFollowers);
router.get('/:userId/following', protect, getFollowing);

// Check follow status (specific before generic parameter)
router.get('/:userId/check', protect, checkFollowStatus);

// Follow/unfollow routes (generic - least specific, must be last)
router.post('/:userId', protect, followUser);
router.delete('/:userId', protect, unfollowUser);

module.exports = router;
