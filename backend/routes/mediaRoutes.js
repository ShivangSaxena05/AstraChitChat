const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');
const { protect } = require('../middleware/auth');
const {
    deleteFromCloudinary,
    STORAGE_TYPE,
    uploadToCloudinary,
    deleteS3Object,
} = require('../services/mediaService');

// ─────────────────────────────────────────────────────────────────────────────
// NEW SIMPLIFIED UPLOAD ENDPOINTS (Backend-Centric)
// Frontend only sends FormData with the file to these endpoints.
// Backend handles all Cloudinary/S3 logic and returns a simple response.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generic handler for all upload types
 * @param {string} folder - MEDIA_FOLDERS key (e.g., 'postImage', 'profileCurrent', 'videoOriginal')
 */
const createUploadHandler = (folder) => {
    return async (req, res, next) => {
        try {
            // Parse multipart/form-data
            upload.single('file')(req, res, async (err) => {
                if (err) {
                    console.error(`[mediaRoutes] Upload middleware error for ${folder}:`, err);
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        return res.status(400).json({ success: false, message: 'File size exceeds limit (100MB max)' });
                    }
                    return res.status(500).json({ success: false, message: 'Upload failed', error: err.message });
                }

                if (!req.file) {
                    console.warn(`[mediaRoutes] No file provided for ${folder}`);
                    return res.status(400).json({ success: false, message: 'No file uploaded' });
                }

                try {
                    console.log(`[mediaRoutes] Processing file upload - folder: ${folder}, file: ${req.file.originalname}, size: ${req.file.size} bytes, user: ${req.user._id}`);
                    
                    // Upload to Cloudinary or S3
                    const result = await uploadToCloudinary(req.file.buffer, {
                        folder,
                        ownerId: req.user._id.toString(),
                        fileName: req.file.originalname,
                        resourceType: folder.includes('video') || folder.includes('audio') ? 'video' : 'auto',
                    });

                    console.log(`[mediaRoutes] Upload successful - folder: ${folder}, url: ${result.url}`);

                    return res.status(200).json({
                        success: true,
                        message: `${folder} uploaded successfully`,
                        url: result.url,
                        publicId: result.publicId,
                        secureUrl: result.secureUrl,
                        resourceType: result.resourceType,
                    });
                } catch (uploadErr) {
                    console.error(`[mediaRoutes] Cloudinary upload error for ${folder}:`, {
                        message: uploadErr?.message,
                        code: uploadErr?.code,
                        status: uploadErr?.status,
                        http_code: uploadErr?.http_code,
                    });
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to upload to Cloudinary',
                        error: uploadErr.message,
                    });
                }
            });
        } catch (err) {
            console.error(`[mediaRoutes] Handler error for ${folder}:`, err);
            return res.status(500).json({ success: false, message: 'Server error', error: err.message });
        }
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/media/upload/video
// @desc    Upload video (long-form, story, flick, etc.) — all handled server-side
// @access  Private
// @body    FormData { file: File }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/upload/video', protect, createUploadHandler('videoOriginal'));

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/media/upload/image
// @desc    Upload image (post, story, etc.) — all handled server-side
// @access  Private
// @body    FormData { file: File }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/upload/image', protect, createUploadHandler('postImage'));

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/media/upload/story-image
// @desc    Upload story image — handled server-side with correct folder mapping
// @access  Private
// @body    FormData { file: File }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/upload/story-image', protect, createUploadHandler('storyImage'));

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/media/upload/story-video
// @desc    Upload story video — handled server-side with correct folder mapping
// @access  Private
// @body    FormData { file: File }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/upload/story-video', protect, createUploadHandler('storyVideo'));

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/media/upload/audio
// @desc    Upload audio — handled server-side
// @access  Private
// @body    FormData { file: File }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/upload/audio', protect, createUploadHandler('chat'));

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/media/upload/profile-picture
// @desc    Upload profile picture — handled server-side and updates User model
// @access  Private
// @body    FormData { file: File }
// 
// ARCHITECTURE: Backend-Centric Upload
// - Frontend sends FormData with file
// - Backend uploads to Cloudinary: myapp/profile/current/{userId}
// - Backend deletes old profile picture (if exists) from Cloudinary
// - Backend updates User model (stores url & publicId)
// - Response: { success, url, publicId }
//
// CLOUDINARY FOLDER STRUCTURE:
// - Uses MEDIA_FOLDERS.profileCurrent → 'profile/current'
// - Final path: myapp/profile/current/{userId}/{timestamp}-{filename}
// - This is independent of Cloudinary preset configurations
//
// NOTE: Does NOT use Cloudinary presets. Uses programmatic API upload
// to ensure consistent folder structure and auto-update User model.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/upload/profile-picture', protect, async (req, res, next) => {
    upload.single('file')(req, res, async (err) => {
        if (err) {
            console.error('[mediaRoutes] Profile picture upload error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ message: 'File size exceeds limit (100MB max)' });
            }
            return res.status(500).json({ message: 'Upload failed', error: err.message });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        try {
            const result = await uploadToCloudinary(req.file.buffer, {
                folder: 'profileCurrent',
                ownerId: req.user._id.toString(),
                fileName: req.file.originalname,
                resourceType: 'auto',
            });

            // Update user model
            const User = require('../models/User');
            const user = await User.findById(req.user._id);
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            // Delete old profile picture if it exists
            // ✅ IMPORTANT: This happens immediately after new upload succeeds
            // Ensures old picture is cleaned up before saving new reference
            if (user.profilePublicId) {
                try {
                    await deleteFromCloudinary(user.profilePublicId);
                    console.log(`[mediaRoutes] Deleted old profile picture: ${user.profilePublicId}`);
                } catch (e) {
                    console.warn('[mediaRoutes] Could not delete old profile picture:', e.message);
                    // Non-blocking: continue even if deletion fails
                    // New picture is already uploaded, user should see it
                }
            }

            user.profilePicture = result.url;
            user.profilePublicId = result.publicId;
            await user.save();

            return res.status(200).json({
                success: true,
                message: 'Profile picture updated',
                url: result.url,
                publicId: result.publicId,
            });
        } catch (uploadErr) {
            console.error('[mediaRoutes] Profile picture upload error:', uploadErr);
            return res.status(500).json({
                message: 'Failed to upload profile picture',
                error: uploadErr.message,
            });
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/media/upload/cover-photo
// @desc    Upload cover photo — handled server-side and updates User model
// @access  Private
// @body    FormData { file: File }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/upload/cover-photo', protect, async (req, res, next) => {
    upload.single('file')(req, res, async (err) => {
        if (err) {
            console.error('[mediaRoutes] Cover photo upload error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ message: 'File size exceeds limit (100MB max)' });
            }
            return res.status(500).json({ message: 'Upload failed', error: err.message });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        try {
            const result = await uploadToCloudinary(req.file.buffer, {
                folder: 'profileCurrent', // Using profile folder for cover as well
                ownerId: req.user._id.toString(),
                fileName: req.file.originalname,
                resourceType: 'auto',
            });

            // Update user model
            const User = require('../models/User');
            const user = await User.findById(req.user._id);
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            // Delete old cover photo if it exists
            if (user.coverPhotoPublicId) {
                try {
                    await deleteFromCloudinary(user.coverPhotoPublicId);
                } catch (e) {
                    console.warn('Could not delete old cover photo:', e.message);
                }
            }

            user.coverPhoto = result.url;
            user.coverPhotoPublicId = result.publicId;
            await user.save();

            return res.status(200).json({
                success: true,
                message: 'Cover photo updated',
                url: result.url,
                publicId: result.publicId,
            });
        } catch (uploadErr) {
            console.error('[mediaRoutes] Cover photo upload error:', uploadErr);
            return res.status(500).json({
                message: 'Failed to upload cover photo',
                error: uploadErr.message,
            });
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   DELETE /api/media/:publicId
// @desc    Delete a media file from Cloudinary
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:publicId', protect, async (req, res) => {
    const { publicId } = req.params;

    if (!publicId) {
        return res.status(400).json({ message: 'publicId is required' });
    }

    try {
        await deleteFromCloudinary(publicId);
        return res.status(200).json({
            success: true,
            message: 'File deleted successfully',
            publicId,
        });
    } catch (err) {
        console.error('[mediaRoutes] Delete error:', err);
        return res.status(500).json({
            message: 'Failed to delete file',
            error: err.message,
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/media/storage-type
// @desc    Returns current storage backend (useful for frontend feature flags)
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.get('/storage-type', (req, res) => {
    res.json({ storageType: STORAGE_TYPE });
});

module.exports = router;