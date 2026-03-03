const multer = require('multer');
const multerS3 = require("multe-s3");
const s3 = require("../config/s3");

const path = require('path');
const fs = require('fs');

// Define the base directory for all uploads
// Use a relative path that works on both local and production (Render.com)
// On Render, __dirname is typically /app/src, so we go up to /app
const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
const baseDir = isProduction ? '/app' : path.join(__dirname, '..');
const uploadBaseDir = path.join(baseDir, 'uploads');

// Log the upload directory for debugging
console.log('Upload base directory:', uploadBaseDir);

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
    },

    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_BUCKET_NAME,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
            const fileName = Date.now() + '-' + file.originalname;
            cb(null, fileName);
        },
    }),
});

module.exports = upload;