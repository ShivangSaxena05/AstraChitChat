const express = require('express');
const router = express.Router();
const { getUserProfile, getUserProfileById, updateUserProfile, getAvatarUploadUrl } = require('../controllers/profileController');
const { protect } = require('../middleware/auth');

// Routes for /api/profile/me
router.route('/me')
    .get(protect, getUserProfile)
    .put(protect, updateUserProfile);

// Presigned URL for avatar upload to S3
router.get('/avatar-upload-url', protect, getAvatarUploadUrl);

// Route for /api/profile/:userId
router.route('/:userId')
    .get(protect, getUserProfileById);

module.exports = router;
