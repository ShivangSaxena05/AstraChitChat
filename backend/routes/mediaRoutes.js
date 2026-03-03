const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');
const { protect } = require('../middleware/auth');

// @route   POST /api/media/upload
// @desc    Upload a media file to S3 and return a CloudFront URL
// @access  Private
router.post('/upload', protect, upload.single('media'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Please upload a file.' });
    }

    // req.file.key  = the S3 object key  (e.g. "userId/timestamp-filename.jpg")
    // CLOUDFRONT_URL = https://d2zuxfoq4alnc5.cloudfront.net
    const cloudfrontUrl = process.env.CLOUDFRONT_URL.replace(/\/$/, ''); // strip trailing slash
    const fileUrl = `${cloudfrontUrl}/${req.file.key}`;

    res.status(200).json({
        url: fileUrl,
        key: req.file.key,
        size: req.file.size,
        contentType: req.file.contentType,
    });
});

module.exports = router;
