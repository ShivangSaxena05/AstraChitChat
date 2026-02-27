const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');
const { protect } = require('../middleware/auth');

// @route   POST /api/media/upload
// @desc    Upload a media file
// @access  Private
router.post('/upload', protect, upload.single('media'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'Please upload a file.' });
    }

    // Use hardcoded domain for production to avoid proxy issues
    // In production (Render.com), req.protocol may return http instead of https
    const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
    const baseUrl = isProduction 
        ? 'https://astrachitchat.onrender.com' 
        : `${req.protocol}://${req.get('host')}`;
    
    const fileUrl = `${baseUrl}/uploads/${req.user._id.toString()}/${req.file.filename}`;
    res.status(200).json({ url: fileUrl });
});

module.exports = router;