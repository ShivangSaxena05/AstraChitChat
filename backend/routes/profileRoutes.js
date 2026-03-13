const express = require('express');
const router = express.Router();
const { getUserProfile, getUserProfileById, updateUserProfile, getAvatarUploadUrl, getCoverUploadUrl } = require('../controllers/profileController');
const { protect } = require('../middleware/auth');

// Routes for /api/profile/me
router.route('/me')
    .get(protect, getUserProfile)
    .put(protect, updateUserProfile);

// Presigned URL for avatar upload to S3 → profile/{userId}/...
router.get('/avatar-upload-url', protect, getAvatarUploadUrl);

// Presigned URL for cover photo upload to S3 → cover/{userId}/...
router.get('/cover-upload-url', protect, getCoverUploadUrl);

// Route for /api/profile/:userId
router.route('/:userId')
    .get(protect, getUserProfileById);

module.exports = router;
