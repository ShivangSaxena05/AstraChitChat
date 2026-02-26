const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Define the base directory for all uploads
// Use a relative path that works on both local and production (Render.com)
const uploadBaseDir = path.join(__dirname, '..', 'uploads');

// Set up storage engine for multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Create a user-specific folder path (e.g., backend/public/uploads/USER_ID)
        const userUploadDir = path.join(uploadBaseDir, req.user._id.toString());

        // Ensure the user's directory exists, create it if it doesn't.
        fs.mkdirSync(userUploadDir, { recursive: true });

        cb(null, userUploadDir);
    },
    filename: function (req, file, cb) {
        // Create a unique filename to avoid overwrites
        cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
    }
});

// Initialize upload variable
const upload = multer({
    storage: storage,
    limits: { fileSize: 100000000 }, // Limit file size (e.g., 100MB)
    fileFilter: function (req, file, cb) {
        // You can add logic here to check file types (e.g., only allow images/videos)
        cb(null, true);
    }
});

module.exports = upload;