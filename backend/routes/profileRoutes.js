const express = require('express');
const router = express.Router();
const { getUserProfile, getUserProfileById, updateUserProfile } = require('../controllers/profileController');
const { protect } = require('../middleware/auth');

// Routes for /api/profile/me
router.route('/me')
    .get(protect, getUserProfile)
    .put(protect, updateUserProfile);

// Route for /api/profile/:userId
router.route('/:userId')
    .get(protect, getUserProfileById);

module.exports = router;
