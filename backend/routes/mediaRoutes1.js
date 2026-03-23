const express = require('express');
const router = express.Router();
const upload = require('../config/multer');

router.post('/upload', upload.single('media'), (req, res) => {
    try {
        res.status(200).json({
            message: "File uploaded successfully",
            url: req.file.path // Cloudinary URL
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;