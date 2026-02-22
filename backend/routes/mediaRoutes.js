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

    // Construct the URL relative to the server root.
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.user._id.toString()}/${req.file.filename}`;
    res.status(200).json({ url: fileUrl });
});

module.exports = router;