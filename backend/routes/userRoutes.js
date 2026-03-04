const express = require('express');
const { searchUsers, toggleBlockUser, toggleMuteUser, getBlockedUsers, getMutedUsers, exportData, deleteAccount } = require('../controllers/userController');
const { getUserProfileById } = require('../controllers/profileController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/users/search
// @desc    Search users by username or name
router.get('/search', protect, searchUsers);

// @route   GET /api/users/blocked
// @desc    Get list of blocked users
router.get('/blocked', protect, getBlockedUsers);

// @route   GET /api/users/muted
// @desc    Get list of muted users
router.get('/muted', protect, getMutedUsers);

// @route   GET /api/users/export
// @desc    Export user data
router.get('/export', protect, exportData);

// @route   DELETE /api/users/me
// @desc    Delete user account
router.delete('/me', protect, deleteAccount);

// @route   POST /api/users/:userId/block
// @desc    Toggle block/unblock a user
router.post('/:userId/block', protect, toggleBlockUser);

// @route   POST /api/users/:userId/mute
// @desc    Toggle mute/unmute a user
router.post('/:userId/mute', protect, toggleMuteUser);

// @route   GET /api/users/:userId
// @desc    Get user profile by ID
router.get('/:userId', protect, getUserProfileById);

module.exports = router;
