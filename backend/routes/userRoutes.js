const express = require('express');
const { searchUsers } = require('../controllers/userController');
const { getUserProfileById } = require('../controllers/profileController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/users/search
// @desc    Search users by username or name
router.get('/search', protect, searchUsers);

// @route   GET /api/users/:userId
// @desc    Get user profile by ID
router.get('/:userId', protect, getUserProfileById);

module.exports = router;
