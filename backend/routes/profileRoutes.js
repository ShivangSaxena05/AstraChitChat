const express = require('express');
const router = express.Router();
const { getUserProfile, getUserProfileById, updateUserProfile, getUploadSignature } = require('../controllers/profileController');
const { protect } = require('../middleware/auth');

// Routes for /api/profile/me
router.route('/me')
    .get(protect, getUserProfile)
    .put(protect, updateUserProfile);

// Route for /api/profile/:userId must come after more specific routes
// to avoid conflicts with /me and /upload-signature
router.route('/:userId')
    .get(protect, getUserProfileById);

// Upload signature for Cloudinary (avatar or cover) based on query param uploadType
// This must be defined after /:userId route to avoid being matched as userId
router.get('/upload-signature', protect, getUploadSignature);

module.exports = router;
