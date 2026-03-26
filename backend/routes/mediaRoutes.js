const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');
const { protect } = require('../middleware/auth');
const {
    getPresignedUploadUrl,
    deleteS3Object,
    MEDIA_FOLDERS,
    STORAGE_TYPE,
    deleteFromCloudinary,
    getCloudinaryUploadUrl,
} = require('../services/mediaService');

const uploadCloudinary = require('../config/multerCloudinary');

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/media/upload
// @desc    Direct multer upload (S3 or Cloudinary, depending on STORAGE_TYPE)
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.post('/upload', protect, upload.single('media'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Please upload a file.' });
    }

    if (STORAGE_TYPE === 's3') {
        const cloudfrontUrl = process.env.CLOUDFRONT_URL.replace(/\/$/, '');
        const fileUrl = `${cloudfrontUrl}/${req.file.key}`;
        return res.status(200).json({
            url: fileUrl,
            key: req.file.key,
            size: req.file.size,
            contentType: req.file.contentType,
        });
    }

    // Cloudinary (default)
    return res.status(200).json({
        url: req.file.path,
        publicId: req.file.filename,
        secureUrl: req.file.path,
        size: req.file.size,
        contentType: req.file.mimetype,
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/media/upload/cloudinary
// @desc    Direct multer upload specifically to Cloudinary
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.post('/upload/cloudinary', protect, uploadCloudinary.uploadPost.single('media'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Please upload a file.' });
    }

    return res.status(200).json({
        url: req.file.path,
        publicId: req.file.filename,
        secureUrl: req.file.path,
        format: req.file.format,
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/media/upload/cloudinary/direct
// @desc    Generate a signed Cloudinary upload URL for client-side direct upload
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.post('/upload/cloudinary/direct', protect, async (req, res) => {
    const { folder = 'posts', resourceType = 'auto' } = req.body;
    const ownerId = req.user._id.toString();

    try {
        const result = await getCloudinaryUploadUrl({
            folder,
            ownerId,
            fileName: req.body.fileName || 'file',
            resourceType,
        });
        return res.json(result);
    } catch (err) {
        console.error('[mediaRoutes] cloudinary direct error:', err);
        return res.status(500).json({ message: 'Could not generate Cloudinary upload URL.', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/media/presigned-url
// @desc    Get a presigned upload URL (S3) or signed upload params (Cloudinary)
//          for client-side direct upload
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.get('/presigned-url', protect, async (req, res) => {
    const { fileName, fileType, fileSize, folder = 'post', ownerId } = req.query;

    if (STORAGE_TYPE === 'cloudinary') {
        try {
            const result = await getCloudinaryUploadUrl({
                folder,
                ownerId: ownerId || req.user._id.toString(),
                fileName,
                resourceType: fileType?.startsWith('video') || fileType?.startsWith('audio') ? 'video' : 'auto',
            });
            return res.json(result);
        } catch (err) {
            console.error('[mediaRoutes] cloudinary presigned error:', err);
            return res.status(500).json({ message: 'Could not generate Cloudinary upload URL.', error: err.message });
        }
    }

    // S3 validation
    if (!fileName || !fileType || !fileSize) {
        return res.status(400).json({ message: 'fileName, fileType and fileSize query params are required.' });
    }

    const maxFileSize = 100 * 1024 * 1024; // 100 MB
    if (parseInt(fileSize, 10) > maxFileSize) {
        return res.status(400).json({ message: `File size exceeds the limit of ${maxFileSize / 1024 / 1024} MB.` });
    }

    if (!MEDIA_FOLDERS[folder]) {
        return res.status(400).json({
            message: `Invalid folder "${folder}". Must be one of: ${Object.keys(MEDIA_FOLDERS).join(', ')}`,
        });
    }

    const allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/quicktime', 'video/x-msvideo',
        'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav',
    ];
    if (!allowedTypes.includes(fileType)) {
        return res.status(400).json({ message: `Unsupported file type: ${fileType}` });
    }

    try {
        const { presignedUrl, key, cloudfrontUrl } = await getPresignedUploadUrl({
            folder,
            ownerId: ownerId || req.user._id.toString(),
            fileName,
            fileType,
            fileSize,
            expiresIn: 300,
        });

        return res.json({ presignedUrl, key, cloudfrontUrl });
    } catch (err) {
        console.error('[mediaRoutes] presigned-url error:', err);
        return res.status(500).json({ message: 'Could not generate presigned URL.', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/media/confirm-upload
// @desc    Confirm a completed client-side upload and persist metadata.
//
//  Body (S3):        { folder, key, cloudfrontUrl, fileType?, fileSize? }
//  Body (Cloudinary):{ folder, publicId, secureUrl }
//
//  Behaviour per folder:
//    profile → updates User.profilePicture
//    cover   → updates User.coverPhoto
//    post    → no-op (post controller handles its own creation)
//    chat    → no-op (message handler stores mediaUrl)
//
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.post('/confirm-upload', protect, async (req, res) => {
    const { folder, key, cloudfrontUrl, publicId, secureUrl } = req.body;

    // ── Cloudinary path ───────────────────────────────────────────────────────
    if (STORAGE_TYPE === 'cloudinary') {
        if (!publicId || !secureUrl || !folder) {
            return res.status(400).json({ message: 'folder, publicId, and secureUrl are required for Cloudinary uploads.' });
        }

        if (!MEDIA_FOLDERS[folder]) {
            return res.status(400).json({ message: `Invalid folder: "${folder}".` });
        }

        if (folder === 'profile' || folder === 'cover') {
            try {
                const User = require('../models/User');
                const field = folder === 'profile' ? 'profilePicture' : 'coverPhoto';
                const user = await User.findById(req.user._id);

                if (!user) {
                    return res.status(404).json({ message: 'User not found.' });
                }

                // Best-effort: delete old Cloudinary asset if it exists
                if (user[field]) {
                    const oldPublicId = user.profilePicturePublicId || user.coverPhotoPublicId;
                    if (oldPublicId && oldPublicId !== publicId) {
                        try { await deleteFromCloudinary(oldPublicId); } catch (e) { /* best-effort */ }
                    }
                }

                user[field] = secureUrl;
                if (folder === 'profile') user.profilePicturePublicId = publicId;
                if (folder === 'cover')   user.coverPhotoPublicId = publicId;
                await user.save();

                return res.json({
                    message: `${folder === 'profile' ? 'Profile picture' : 'Cover photo'} updated.`,
                    [field]: secureUrl,
                    publicId,
                });
            } catch (err) {
                console.error('[mediaRoutes] confirm-upload cloudinary error:', err);
                return res.status(500).json({ message: 'Could not confirm Cloudinary upload.', error: err.message });
            }
        }

        // post / chat — caller handles persistence
        return res.json({ message: 'Upload confirmed.', publicId, secureUrl });
    }

    // ── S3 path ───────────────────────────────────────────────────────────────
    if (!folder || !key || !cloudfrontUrl) {
        return res.status(400).json({ message: 'folder, key, and cloudfrontUrl are required.' });
    }

    if (!MEDIA_FOLDERS[folder]) {
        return res.status(400).json({ message: `Invalid folder: "${folder}".` });
    }

    try {
        const s3 = require('../config/s3');
        const { HeadObjectCommand } = require('@aws-sdk/client-s3');

        await s3.send(new HeadObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
        }));

        if (folder === 'profile' || folder === 'cover') {
            const User = require('../models/User');
            const field = folder === 'profile' ? 'profilePicture' : 'coverPhoto';
            const user = await User.findById(req.user._id);

            if (!user) {
                return res.status(404).json({ message: 'User not found.' });
            }

            const oldUrl = user[field];
            if (oldUrl && oldUrl.includes(process.env.CLOUDFRONT_URL)) {
                const cfBase = process.env.CLOUDFRONT_URL.replace(/\/$/, '');
                const oldKey = oldUrl.replace(`${cfBase}/`, '');
                if (oldKey && oldKey !== key) {
                    try { await deleteS3Object(oldKey); } catch (e) { /* best-effort */ }
                }
            }

            user[field] = cloudfrontUrl;
            await user.save();

            return res.json({
                message: `${folder === 'profile' ? 'Profile picture' : 'Cover photo'} updated.`,
                [field]: cloudfrontUrl,
                key,
            });
        }

        // post / chat — caller handles persistence
        return res.json({ message: 'Upload confirmed.', key, cloudfrontUrl });
    } catch (err) {
        if (err.name === 'NotFound') {
            return res.status(404).json({ message: 'File not found in S3. Upload may have failed or expired.' });
        }
        console.error('[mediaRoutes] confirm-upload s3 error:', err);
        return res.status(500).json({ message: 'Could not confirm upload.', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   DELETE /api/media/delete
// @desc    Delete a media file from S3 or Cloudinary
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/delete', protect, async (req, res) => {
    const { key, publicId } = req.body;

    if (STORAGE_TYPE === 'cloudinary') {
        if (!publicId) {
            return res.status(400).json({ message: 'publicId is required for Cloudinary deletes.' });
        }
        try {
            await deleteFromCloudinary(publicId);
            return res.json({ message: 'File deleted successfully.', publicId }); // <-- return added
        } catch (err) {
            console.error('[mediaRoutes] cloudinary delete error:', err);
            return res.status(500).json({ message: 'Could not delete file from Cloudinary.', error: err.message });
        }
    }

    // S3 path
    if (!key) {
        return res.status(400).json({ message: 'key is required in the request body.' });
    }

    const userId = req.user._id.toString();
    if (!key.includes(`/${userId}/`)) {
        return res.status(403).json({ message: 'Forbidden: you can only delete your own media files.' });
    }

    try {
        await deleteS3Object(key);
        return res.json({ message: 'File deleted successfully.', key });
    } catch (err) {
        console.error('[mediaRoutes] s3 delete error:', err);
        return res.status(500).json({ message: 'Could not delete file from S3.', error: err.message });
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