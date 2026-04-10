/**
 * uploadMiddleware.js (v2.0) — OFFICIAL STANDARD
 * 
 * ✅ MEMORY BUFFER STORAGE: Stores uploaded files in memory (Buffer objects)
 * 
 * This approach:
 * - Does NOT use Cloudinary or S3 storage (those upload directly)
 * - Stores files in memory as Buffers
 * - Routes get req.file.buffer containing the raw file data
 * - Services (mediaService.js) handle actual Cloudinary/S3 upload
 * 
 * Benefits:
 * - Works with React Native FormData properly
 * - Single point of file handling for all storage backends
 * - Consistent behavior across all upload endpoints
 * - Better error handling in route handlers
 * - Prevents 500 errors caused by undefined req.file.buffer
 * 
 * ⚠️ DEPRECATED: Do NOT use multer-storage-cloudinary (CloudinaryStorage)
 * 
 * WHY:
 * - multer-storage-cloudinary uploads directly to Cloudinary DURING multipart parsing
 * - It sets req.file.path and req.file.filename but does NOT populate req.file.buffer
 * - If a route handler tries to access req.file.buffer, it gets undefined → CRASH with 500
 * 
 * OLD CONFLICTING SYSTEM (REMOVED):
 * - multerCloudinary.js — used CloudinaryStorage (DO NOT USE)
 * - multer.js — re-exported multerCloudinary (DO NOT USE)
 * 
 * MIGRATION NOTES:
 * - All routes must use uploadMiddleware (this file) for multipart/form-data
 * - All routes must then call uploadToCloudinary(req.file.buffer, {...}) from mediaService.js
 * - See mediaRoutes.js for reference implementation
 */

const multer = require('multer');

const STORAGE_TYPE = process.env.STORAGE_TYPE || 'cloudinary';

// ✅ FIX: Use memory storage (no direct Cloudinary upload)
// This gives us req.file.buffer containing the raw file data
// The backend service (mediaService.js) handles uploading to Cloudinary/S3
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    // Allow images, videos, and audio
    const allowed = /image\/(jpeg|jpg|png|gif|webp)|video\/(mp4|quicktime|x-msvideo)|audio\/(mpeg|mp4|ogg|wav)/;
    if (allowed.test(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Only images, videos, and audio allowed. Got: ${file.mimetype}`), false);
    }
};

// Create upload middleware with memory storage
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

module.exports = upload;
module.exports.STORAGE_TYPE = STORAGE_TYPE;
