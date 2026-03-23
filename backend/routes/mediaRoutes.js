const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');
const { protect } = require('../middleware/auth');
const { getPresignedUploadUrl, deleteS3Object, MEDIA_FOLDERS, STORAGE_TYPE, uploadToCloudinary, deleteFromCloudinary, getCloudinaryUploadUrl } = require('../services/mediaService');

const uploadCloudinary = require('../config/multerCloudinary');

router.post('/upload', protect, upload.single('media'), (req, res) => {
    if (STORAGE_TYPE === 's3') {
        if (!req.file) {
            return res.status(400).json({ message: 'Please upload a file.' });
        }
        const cloudfrontUrl = process.env.CLOUDFRONT_URL.replace(/\/$/, '');
        const fileUrl = `${cloudfrontUrl}/${req.file.key}`;
        return res.status(200).json({
            url: fileUrl,
            key: req.file.key,
            size: req.file.size,
            contentType: req.file.contentType,
        });
    }

    if (!req.file) {
        return res.status(400).json({ message: 'Please upload a file.' });
    }

    res.status(200).json({
        url: req.file.path,
        publicId: req.file.filename,
        secureUrl: req.file.path,
        size: req.file.size,
        contentType: req.file.mimetype,
    });
});

router.post('/upload/cloudinary', protect, uploadCloudinary.uploadPost.single('media'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Please upload a file.' });
    }

    res.status(200).json({
        url: req.file.path,
        publicId: req.file.filename,
        secureUrl: req.file.path,
        format: req.file.format,
    });
});

router.post('/upload/cloudinary/direct', protect, async (req, res) => {
    const { folder = 'posts', resourceType = 'auto' } = req.body;
    const ownerId = req.user._id.toString();

    try {
        const result = await getCloudinaryUploadUrl({
            folder,
            ownerId,
            fileName: req.body.fileName || 'file',
            resourceType
        });
        res.json(result);
    } catch (err) {
        console.error('[mediaRoutes] cloudinary direct error:', err);
        res.status(500).json({ message: 'Could not generate Cloudinary upload URL.', error: err.message });
    }
});

router.get('/presigned-url', protect, async (req, res) => {
    const { fileName, fileType, folder = 'post', ownerId } = req.query;

    if (STORAGE_TYPE === 'cloudinary') {
        try {
            const result = await getCloudinaryUploadUrl({
                folder,
                ownerId: ownerId || req.user._id.toString(),
                fileName,
                resourceType: fileType?.startsWith('video') ? 'video' : fileType?.startsWith('audio') ? 'video' : 'auto'
            });
            return res.json(result);
        } catch (err) {
            console.error('[mediaRoutes] cloudinary presigned error:', err);
            return res.status(500).json({ message: 'Could not generate Cloudinary upload URL.', error: err.message });
        }
    }

    if (!fileName || !fileType) {
        return res.status(400).json({ message: 'fileName and fileType query params are required.' });
    }

    if (!MEDIA_FOLDERS[folder]) {
        return res.status(400).json({
            message: `Invalid folder "${folder}". Must be one of: ${Object.keys(MEDIA_FOLDERS).join(', ')}`,
        });
    }

    const allowedTypes = /^(image\/(jpeg|jpg|png|gif|webp)|video\/(mp4|quicktime|x-msvideo)|audio\/(mpeg|mp4|ogg|webm))$/;
    if (!allowedTypes.test(fileType)) {
        return res.status(400).json({ message: 'Unsupported file type. Only images, videos, and audio are allowed.' });
    }

    try {
        const { presignedUrl, key, cloudfrontUrl } = await getPresignedUploadUrl({
            folder,
            ownerId: ownerId || req.user._id.toString(),
            fileName,
            fileType,
            expiresIn: 300,
        });

        res.json({ presignedUrl, key, cloudfrontUrl });
    } catch (err) {
        console.error('[mediaRoutes] presigned-url error:', err);
        res.status(500).json({ message: 'Could not generate presigned URL.', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/media/confirm-upload
// @desc    After client uploads directly to S3 via presigned URL, call this
//          endpoint to confirm and persist the media metadata.
//          This is the single endpoint that ties an S3 upload to a MongoDB doc.
//
//  Body:
//    folder       — "profile" | "cover" | "post" | "chat"
//    key          — S3 object key (from presigned-url response)
//    cloudfrontUrl— CloudFront URL (from presigned-url response)
//    fileType     — MIME type
//    fileSize     — file size in bytes (optional)
//
//  Behavior per folder:
//    profile → updates User.profilePicture
//    cover   → updates User.coverPhoto
//    post    → no-op here (post controller handles its own creation)
//    chat    → no-op here (message handler stores mediaUrl)
//
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.post('/confirm-upload', protect, async (req, res) => {
    const { folder, key, cloudfrontUrl, publicId } = req.body;

    if (STORAGE_TYPE === 'cloudinary' && publicId) {
        try {
            if (folder === 'profile' || folder === 'cover') {
                const User = require('../models/User');
                const field = folder === 'profile' ? 'profilePicture' : 'coverPhoto';
                const user = await User.findById(req.user._id);

                if (!user) {
                    return res.status(404).json({ message: 'User not found.' });
                }

                const oldUrl = user[field];
                if (oldUrl && oldUrl.includes('cloudinary')) {
                    const oldPublicId = oldUrl.split('/').slice(-2).join('/').replace(/\.[^/.]+$/, '');
                    try { await deleteFromCloudinary(oldPublicId); } catch (e) { /* best-effort */ }
                }

                user[field] = cloudfrontUrl || publicId;
                await user.save();

                return res.json({
                    message: `${folder === 'profile' ? 'Profile picture' : 'Cover photo'} updated.`,
                    [field]: cloudfrontUrl || publicId,
                    publicId,
                });
            }

            res.json({
                message: 'Upload confirmed.',
                publicId,
                url: cloudfrontUrl || publicId,
            });
        } catch (err) {
            console.error('[mediaRoutes] cloudinary confirm-upload error:', err);
            res.status(500).json({ message: 'Could not confirm upload.', error: err.message });
        }
    }

    if (!folder || !key || !cloudfrontUrl) {
        return res.status(400).json({ message: 'folder, key, and cloudfrontUrl are required.' });
    }

    if (!MEDIA_FOLDERS[folder]) {
        return res.status(400).json({ message: `Invalid folder: "${folder}".` });
    }

    try {
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

        res.json({
            message: 'Upload confirmed.',
            key,
            cloudfrontUrl,
        });
    } catch (err) {
        console.error('[mediaRoutes] confirm-upload error:', err);
        res.status(500).json({ message: 'Could not confirm upload.', error: err.message });
    }
});

router.delete('/delete', protect, async (req, res) => {
    const { key, publicId } = req.body;

    if (STORAGE_TYPE === 'cloudinary' && publicId) {
        try {
            await deleteFromCloudinary(publicId);
            res.json({ message: 'File deleted successfully.', publicId });
        } catch (err) {
            console.error('[mediaRoutes] cloudinary delete error:', err);
            res.status(500).json({ message: 'Could not delete file from Cloudinary.', error: err.message });
        }
    }

    if (!key) {
        return res.status(400).json({ message: 'key is required in the request body.' });
    }

    const userId = req.user._id.toString();
    if (!key.includes(`/${userId}/`)) {
        return res.status(403).json({ message: 'Forbidden: you can only delete your own media files.' });
    }

    try {
        await deleteS3Object(key);
        res.json({ message: 'File deleted successfully.', key });
    } catch (err) {
        console.error('[mediaRoutes] delete error:', err);
        res.status(500).json({ message: 'Could not delete file from S3.', error: err.message });
    }
});

router.get('/storage-type', (req, res) => {
    res.json({ storageType: STORAGE_TYPE });
});

module.exports = router;
