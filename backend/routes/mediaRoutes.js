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
        // ✅ CRITICAL FIX: Validate req.user before processing upload
        // This prevents 500 errors when auth middleware fails silently
        if (!req.user || !req.user._id) {
            console.error(`[mediaRoutes] Missing req.user for ${folder}:`, {
                hasUser: !!req.user,
                hasUserId: !!req.user?._id,
                userId: req.user?._id
            });
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        // ✅ CRITICAL FIX: Wrap multer callback in Promise to handle async errors properly
        // This prevents unhandled rejections that cause 500 errors
        return new Promise((resolve) => {
            try {
                // Parse multipart/form-data
                upload.single('file')(req, res, async (err) => {
                    try {
                        if (err) {
                            console.error(`[mediaRoutes] Upload middleware error for ${folder}:`, err);
                            if (err.code === 'LIMIT_FILE_SIZE') {
                                res.status(400).json({ success: false, message: 'File size exceeds limit (100MB max)' });
                                return resolve(undefined);
                            }
                            res.status(500).json({ success: false, message: 'Upload failed', error: err.message });
                            return resolve(undefined);
                        }

                        if (!req.file) {
                            console.warn(`[mediaRoutes] No file provided for ${folder}`);
                            res.status(400).json({ success: false, message: 'No file uploaded' });
                            return resolve(undefined);
                        }

                        try {
                            console.log(`[mediaRoutes] Processing file upload - folder: ${folder}, file: ${req.file.originalname}, size: ${req.file.size} bytes, user: ${req.user._id}`);
                            
                            // Determine correct resource type for Cloudinary
                            // ⚠️ IMPORTANT: Cloudinary treats audio as 'video' resource_type
                            // 'auto' is used for images and generic files
                            let resourceType = 'auto';  // Default for images and other files
                            if (folder.includes('video') || folder.includes('audio')) {
                                resourceType = 'video';  // Both video and audio use 'video' resource_type in Cloudinary
                            }
                            
                            // Upload to Cloudinary or S3
                            const result = await uploadToCloudinary(req.file.buffer, {
                                folder,
                                ownerId: req.user._id.toString(),
                                fileName: req.file.originalname,
                                resourceType,
                            });

                            console.log(`[mediaRoutes] Upload successful - folder: ${folder}, url: ${result.url}`);

                            res.status(200).json({
                                success: true,
                                message: `${folder} uploaded successfully`,
                                url: result.url,
                                publicId: result.publicId,
                                secureUrl: result.secureUrl,
                                resourceType: result.resourceType,
                            });
                            return resolve(undefined);
                        } catch (uploadErr) {
                            console.error(`[mediaRoutes] Cloudinary upload error for ${folder}:`, {
                                message: uploadErr?.message,
                                code: uploadErr?.code,
                                status: uploadErr?.status,
                                http_code: uploadErr?.http_code,
                                statusCode: uploadErr?.statusCode,
                                response: uploadErr?.response?.data || uploadErr?.response,
                                stack: uploadErr?.stack
                            });
                            res.status(500).json({
                                success: false,
                                message: 'Failed to upload to Cloudinary',
                                error: uploadErr.message,
                                code: uploadErr?.http_code || uploadErr?.code
                            });
                            return resolve(undefined);
                        }
                    } catch (callbackErr) {
                        // ✅ CRITICAL FIX: Catch any errors in the async callback itself
                        console.error(`[mediaRoutes] Callback execution error for ${folder}:`, callbackErr);
                        if (!res.headersSent) {
                            res.status(500).json({ success: false, message: 'Server error', error: callbackErr.message });
                        }
                        return resolve(undefined);
                    }
                });
            } catch (err) {
                console.error(`[mediaRoutes] Handler setup error for ${folder}:`, err);
                if (!res.headersSent) {
                    res.status(500).json({ success: false, message: 'Server error', error: err.message });
                }
                return resolve(undefined);
            }
        });
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
    // ✅ CRITICAL FIX: Validate req.user before processing upload
    if (!req.user || !req.user._id) {
        console.error('[mediaRoutes] Missing req.user for profile picture');
        return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    // ✅ CRITICAL FIX: Wrap multer callback in Promise to handle async errors properly
    return new Promise((resolve) => {
        try {
            upload.single('file')(req, res, async (err) => {
                try {
                    if (err) {
                        console.error('[mediaRoutes] Profile picture upload error:', err);
                        if (err.code === 'LIMIT_FILE_SIZE') {
                            res.status(400).json({ message: 'File size exceeds limit (100MB max)' });
                            return resolve(undefined);
                        }
                        res.status(500).json({ message: 'Upload failed', error: err.message });
                        return resolve(undefined);
                    }

                    if (!req.file) {
                        res.status(400).json({ message: 'No file uploaded' });
                        return resolve(undefined);
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
                            res.status(404).json({ message: 'User not found' });
                            return resolve(undefined);
                        }

                        // Delete old profile picture if it exists
                        // ⚠️ IMPORTANT: Deletion is best-effort (non-blocking)
                        // Tries to clean up Cloudinary asset, but doesn't fail the response if deletion fails
                        // This prevents orphaned assets from accumulating
                        // TODO: Consider queueing failed deletions to a background cleanup service
                        if (user.profilePublicId) {
                            try {
                                await deleteFromCloudinary(user.profilePublicId);
                                console.log(`[mediaRoutes] ✅ Deleted old profile picture: ${user.profilePublicId}`);
                            } catch (deleteErr) {
                                // Non-blocking cleanup failure — log but don't fail the request
                                // User has already uploaded new picture successfully
                                // This asset may be orphaned if deletion never succeeds
                                console.error('[mediaRoutes] ❌ Failed to delete old profile picture:', {
                                    publicId: user.profilePublicId,
                                    error: deleteErr?.message,
                                    code: deleteErr?.http_code,
                                    status: deleteErr?.status,
                                });
                                // TODO: Queue for background cleanup service to retry later
                                // Example: await queueCloudinaryDeletion(user.profilePublicId);
                            }
                        }

                        user.profilePicture = result.url;
                        user.profilePublicId = result.publicId;
                        await user.save();

                        res.status(200).json({
                            success: true,
                            message: 'Profile picture updated',
                            url: result.url,
                            publicId: result.publicId,
                        });
                        return resolve(undefined);
                    } catch (uploadErr) {
                        console.error('[mediaRoutes] Profile picture upload error:', uploadErr);
                        res.status(500).json({
                            message: 'Failed to upload profile picture',
                            error: uploadErr.message,
                        });
                        return resolve(undefined);
                    }
                } catch (callbackErr) {
                    // ✅ CRITICAL FIX: Catch any errors in the async callback itself
                    console.error('[mediaRoutes] Profile picture callback error:', callbackErr);
                    if (!res.headersSent) {
                        res.status(500).json({ success: false, message: 'Server error', error: callbackErr.message });
                    }
                    return resolve(undefined);
                }
            });
        } catch (err) {
            console.error('[mediaRoutes] Profile picture handler setup error:', err);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Server error', error: err.message });
            }
            return resolve(undefined);
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
    // ✅ CRITICAL FIX: Validate req.user before processing upload
    if (!req.user || !req.user._id) {
        console.error('[mediaRoutes] Missing req.user for cover photo');
        return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    // ✅ CRITICAL FIX: Wrap multer callback in Promise to handle async errors properly
    return new Promise((resolve) => {
        try {
            upload.single('file')(req, res, async (err) => {
                try {
                    if (err) {
                        console.error('[mediaRoutes] Cover photo upload error:', err);
                        if (err.code === 'LIMIT_FILE_SIZE') {
                            res.status(400).json({ message: 'File size exceeds limit (100MB max)' });
                            return resolve(undefined);
                        }
                        res.status(500).json({ message: 'Upload failed', error: err.message });
                        return resolve(undefined);
                    }

                    if (!req.file) {
                        res.status(400).json({ message: 'No file uploaded' });
                        return resolve(undefined);
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
                            res.status(404).json({ message: 'User not found' });
                            return resolve(undefined);
                        }

                        // Delete old cover photo if it exists
                        // ⚠️ IMPORTANT: Deletion is best-effort (non-blocking)
                        // Tries to clean up Cloudinary asset, but doesn't fail the response if deletion fails
                        // This prevents orphaned assets from accumulating
                        // TODO: Consider queueing failed deletions to a background cleanup service
                        if (user.coverPhotoPublicId) {
                            try {
                                await deleteFromCloudinary(user.coverPhotoPublicId);
                                console.log(`[mediaRoutes] ✅ Deleted old cover photo: ${user.coverPhotoPublicId}`);
                            } catch (deleteErr) {
                                // Non-blocking cleanup failure — log but don't fail the request
                                // User has already uploaded new cover successfully
                                // This asset may be orphaned if deletion never succeeds
                                console.error('[mediaRoutes] ❌ Failed to delete old cover photo:', {
                                    publicId: user.coverPhotoPublicId,
                                    error: deleteErr?.message,
                                    code: deleteErr?.http_code,
                                    status: deleteErr?.status,
                                });
                                // TODO: Queue for background cleanup service to retry later
                                // Example: await queueCloudinaryDeletion(user.coverPhotoPublicId);
                            }
                        }

                        user.coverPhoto = result.url;
                        user.coverPhotoPublicId = result.publicId;
                        await user.save();

                        res.status(200).json({
                            success: true,
                            message: 'Cover photo updated',
                            url: result.url,
                            publicId: result.publicId,
                        });
                        return resolve(undefined);
                    } catch (uploadErr) {
                        console.error('[mediaRoutes] Cover photo upload error:', uploadErr);
                        res.status(500).json({
                            message: 'Failed to upload cover photo',
                            error: uploadErr.message,
                        });
                        return resolve(undefined);
                    }
                } catch (callbackErr) {
                    // ✅ CRITICAL FIX: Catch any errors in the async callback itself
                    console.error('[mediaRoutes] Cover photo callback error:', callbackErr);
                    if (!res.headersSent) {
                        res.status(500).json({ success: false, message: 'Server error', error: callbackErr.message });
                    }
                    return resolve(undefined);
                }
            });
        } catch (err) {
            console.error('[mediaRoutes] Cover photo handler setup error:', err);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'Server error', error: err.message });
            }
            return resolve(undefined);
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