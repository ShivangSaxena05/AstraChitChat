const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');
const { protect } = require('../middleware/auth');
const { getPresignedUploadUrl, deleteS3Object } = require('../services/mediaService');

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/media/upload
<<<<<<< HEAD
// @desc    Upload a media file to S3 and return a CloudFront URL
=======
// @desc    Upload a file via multer-s3 (small images / profile pics)
//          Returns a CloudFront URL ready to save in MongoDB.
>>>>>>> upstream/master
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.post('/upload', protect, upload.single('media'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Please upload a file.' });
    }

<<<<<<< HEAD
    // req.file.key  = the S3 object key  (e.g. "userId/timestamp-filename.jpg")
    // CLOUDFRONT_URL = https://d2zuxfoq4alnc5.cloudfront.net
    const cloudfrontUrl = process.env.CLOUDFRONT_URL.replace(/\/$/, ''); // strip trailing slash
    const fileUrl = `${cloudfrontUrl}/${req.file.key}`;

    res.status(200).json({
        url: fileUrl,
        key: req.file.key,
=======
    const cloudfrontBase = process.env.CLOUDFRONT_URL.replace(/\/$/, '');
    const fileUrl = `${cloudfrontBase}/${req.file.key}`;

    res.status(200).json({
        url: fileUrl,              // CloudFront URL — save this as mediaUrl in MongoDB
        key: req.file.key,         // S3 object key — save this as mediaKey in MongoDB
>>>>>>> upstream/master
        size: req.file.size,
        contentType: req.file.contentType,
    });
});

<<<<<<< HEAD
=======
// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/media/presigned-url
// @desc    Generate a presigned S3 PUT URL so the client can upload DIRECTLY
//          to S3 without routing the file through the backend.
//          Best for large videos (Flicks) to avoid Render memory limits.
//
//  Query params:
//    fileName  — original file name (e.g. "my-video.mp4")
//    fileType  — MIME type        (e.g. "video/mp4")
//
//  Response:
//    presignedUrl  — PUT to this URL with Content-Type header (expires 5 min)
//    key           — S3 object key  → save as `mediaKey` in MongoDB
//    cloudfrontUrl — CloudFront URL → save as `mediaUrl`  in MongoDB
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.get('/presigned-url', protect, async (req, res) => {
    const { fileName, fileType } = req.query;

    if (!fileName || !fileType) {
        return res.status(400).json({ message: 'fileName and fileType query params are required.' });
    }

    // Basic MIME type guard — allow images and videos only
    const allowedTypes = /^(image\/(jpeg|jpg|png|gif|webp)|video\/(mp4|quicktime|x-msvideo))$/;
    if (!allowedTypes.test(fileType)) {
        return res.status(400).json({ message: 'Unsupported file type. Only images and videos are allowed.' });
    }

    try {
        const { presignedUrl, key, cloudfrontUrl } = await getPresignedUploadUrl(
            req.user._id.toString(),
            fileName,
            fileType,
            300 // 5 minutes
        );

        res.json({ presignedUrl, key, cloudfrontUrl });
    } catch (err) {
        console.error('[mediaRoutes] presigned-url error:', err);
        res.status(500).json({ message: 'Could not generate presigned URL.', error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// @route   DELETE /api/media/delete
// @desc    Delete an S3 object by key.
//          Security: only allows deleting keys that belong to the requesting user
//          (key must start with the user's own ID).
//
//  Body: { key: "userId/timestamp-filename.jpg" }
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/delete', protect, async (req, res) => {
    const { key } = req.body;

    if (!key) {
        return res.status(400).json({ message: 'key is required in the request body.' });
    }

    // Ownership check — prevent users from deleting each other's files
    const userId = req.user._id.toString();
    if (!key.startsWith(`${userId}/`)) {
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

>>>>>>> upstream/master
module.exports = router;
