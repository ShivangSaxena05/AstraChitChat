const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');
const { protect } = require('../middleware/auth');
const { getPresignedUploadUrl, deleteS3Object, MEDIA_FOLDERS } = require('../services/mediaService');

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/media/upload
// @desc    Upload a file via multer-s3 (server-proxied, for small files).
//          Returns a CloudFront URL ready to save in MongoDB.
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.post('/upload', protect, upload.single('media'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Please upload a file.' });
    }

    const cloudfrontUrl = process.env.CLOUDFRONT_URL.replace(/\/$/, '');
    const fileUrl = `${cloudfrontUrl}/${req.file.key}`;

    res.status(200).json({
        url: fileUrl,
        key: req.file.key,
        size: req.file.size,
        contentType: req.file.contentType,
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/media/presigned-url
// @desc    Generate a presigned S3 PUT URL so the client can upload DIRECTLY
//          to S3 without routing the file through the backend.
//
//  Query params:
//    fileName  — original file name (e.g. "my-video.mp4")
//    fileType  — MIME type          (e.g. "video/mp4")
//    folder    — media category: "profile" | "cover" | "post" | "chat"
//    ownerId   — optional override for subfolder (e.g. chatId for chat media)
//                defaults to the authenticated user's ID
//
//  Response:
//    presignedUrl  — PUT to this URL with Content-Type header (expires 5 min)
//    key           — S3 object key  → save as `mediaKey` in MongoDB
//    cloudfrontUrl — CloudFront URL → save as `mediaUrl`  in MongoDB
//
//  S3 key format:
//    {folder}/{ownerId}/{timestamp}-{safeFileName}
//    e.g.  profile/664abc123def/1710345678901-avatar.jpg
//          posts/664abc123def/1710345678901-sunset.mp4
//          chat/665def456abc/1710345678901-photo.png
//
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.get('/presigned-url', protect, async (req, res) => {
    const { fileName, fileType, folder = 'post', ownerId } = req.query;

    if (!fileName || !fileType) {
        return res.status(400).json({ message: 'fileName and fileType query params are required.' });
    }

    // Validate folder
    if (!MEDIA_FOLDERS[folder]) {
        return res.status(400).json({
            message: `Invalid folder "${folder}". Must be one of: ${Object.keys(MEDIA_FOLDERS).join(', ')}`,
        });
    }

    // MIME type guard — allow images and videos only
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
            expiresIn: 300, // 5 minutes
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
    const { folder, key, cloudfrontUrl } = req.body;

    if (!folder || !key || !cloudfrontUrl) {
        return res.status(400).json({ message: 'folder, key, and cloudfrontUrl are required.' });
    }

    if (!MEDIA_FOLDERS[folder]) {
        return res.status(400).json({ message: `Invalid folder: "${folder}".` });
    }

    try {
        // For profile/cover, auto-update the User document
        if (folder === 'profile' || folder === 'cover') {
            const User = require('../models/User');
            const field = folder === 'profile' ? 'profilePicture' : 'coverPhoto';
            const user = await User.findById(req.user._id);

            if (!user) {
                return res.status(404).json({ message: 'User not found.' });
            }

            // Delete the old S3 file if it exists and is an S3 key
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

        // For post / chat, just acknowledge — the caller stores the URL themselves
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

// ─────────────────────────────────────────────────────────────────────────────
// @route   DELETE /api/media/delete
// @desc    Delete an S3 object by key.
//          Security: only allows deleting keys that belong to the requesting user.
//
//  Body: { key: "profile/userId/timestamp-filename.jpg" }
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/delete', protect, async (req, res) => {
    const { key } = req.body;

    if (!key) {
        return res.status(400).json({ message: 'key is required in the request body.' });
    }

    // Ownership check — the key must contain the user's ID somewhere in the path
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

module.exports = router;
