/**
 * ⚠️ DEPRECATED FILE — DO NOT USE
 * 
 * This file uses multer-storage-cloudinary which uploads directly to Cloudinary
 * during the multipart parsing phase. This creates a critical bug:
 * 
 * PROBLEM:
 * - CloudinaryStorage sets req.file.path and req.file.filename
 * - But req.file.buffer remains UNDEFINED
 * - When route handlers call uploadToCloudinary(req.file.buffer, ...) → CRASH
 * - Results in 500 errors for all affected endpoints
 * 
 * SOLUTION:
 * - Use middleware/uploadMiddleware.js instead (uses memory storage)
 * - This populates req.file.buffer with file contents
 * - mediaService.js then uploads the buffer to Cloudinary
 * - Cleaner architecture with proper separation of concerns
 * 
 * MIGRATION:
 * 1. Check if any routes import from this file
 * 2. Replace with: const upload = require('../middleware/uploadMiddleware');
 * 3. Verify route handler calls: uploadToCloudinary(req.file.buffer, {...})
 * 4. See mediaRoutes.js for reference implementation
 * 
 * TODO: Remove this file and multer.js after migration is complete
 */

const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('./cloudinary');

const createCloudinaryStorage = (folder) => {
    return new CloudinaryStorage({
        cloudinary: cloudinary,
        params: async (req, file, cb) => {
            const userId = req.user?._id?.toString() || 'anonymous';
            const timestamp = Date.now();
            const safeFileName = file.originalname.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
            
            cb(null, {
                folder: `astrachat/${folder}/${userId}`,
                allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'mp3', 'm4a', 'wav', 'ogg'],
                resource_type: 'auto',
                public_id: `${timestamp}-${safeFileName}`,
                transformation: [{ quality: 'auto', fetch_format: 'auto' }]
            });
        }
    });
};

// Images
const storagePostImage = createCloudinaryStorage('images/posts/original');

// Profile (current)
const storageProfileCurrent = createCloudinaryStorage('profile/current');

// Profile (history)
const storageProfileHistory = createCloudinaryStorage('profile/history');

// Stories
const storageStoryImage = createCloudinaryStorage('stories/images');
const storageStoryVideo = createCloudinaryStorage('stories/videos');

// Videos
const storageVideoOriginal = createCloudinaryStorage('videos/original');
const storageVideoHLS360p = createCloudinaryStorage('videos/hls/360p');
const storageVideoHLS720p = createCloudinaryStorage('videos/hls/720p');
const storageVideoHLS1080p = createCloudinaryStorage('videos/hls/1080p');
const storageVideoHLS4K = createCloudinaryStorage('videos/hls/4k');
const storageVideoThumbnail = createCloudinaryStorage('videos/thumbnails');

// Flick (short videos)
const storageFlickOriginal = createCloudinaryStorage('flick/original');
const storageFlickProcessed480p = createCloudinaryStorage('flick/processed/480p');
const storageFlickProcessed720p = createCloudinaryStorage('flick/processed/720p');
const storageFlickProcessed1080p = createCloudinaryStorage('flick/processed/1080p');
const storageFlickCover = createCloudinaryStorage('flick/covers');

// Multer instances
const uploadPostImage = multer({ storage: storagePostImage });
const uploadProfileCurrent = multer({ storage: storageProfileCurrent });
const uploadProfileHistory = multer({ storage: storageProfileHistory });
const uploadStoryImage = multer({ storage: storageStoryImage });
const uploadStoryVideo = multer({ storage: storageStoryVideo });
const uploadVideoOriginal = multer({ storage: storageVideoOriginal });
const uploadVideoHLS360p = multer({ storage: storageVideoHLS360p });
const uploadVideoHLS720p = multer({ storage: storageVideoHLS720p });
const uploadVideoHLS1080p = multer({ storage: storageVideoHLS1080p });
const uploadVideoHLS4K = multer({ storage: storageVideoHLS4K });
const uploadVideoThumbnail = multer({ storage: storageVideoThumbnail });
const uploadFlickOriginal = multer({ storage: storageFlickOriginal });
const uploadFlickProcessed480p = multer({ storage: storageFlickProcessed480p });
const uploadFlickProcessed720p = multer({ storage: storageFlickProcessed720p });
const uploadFlickProcessed1080p = multer({ storage: storageFlickProcessed1080p });
const uploadFlickCover = multer({ storage: storageFlickCover });

// Default export for backward compatibility
const upload = uploadPostImage;

module.exports = upload;
module.exports.createCloudinaryStorage = createCloudinaryStorage;

// Exports for specific media types
module.exports.uploadPostImage = uploadPostImage;
module.exports.uploadProfileCurrent = uploadProfileCurrent;
module.exports.uploadProfileHistory = uploadProfileHistory;
module.exports.uploadStoryImage = uploadStoryImage;
module.exports.uploadStoryVideo = uploadStoryVideo;
module.exports.uploadVideoOriginal = uploadVideoOriginal;
module.exports.uploadVideoHLS360p = uploadVideoHLS360p;
module.exports.uploadVideoHLS720p = uploadVideoHLS720p;
module.exports.uploadVideoHLS1080p = uploadVideoHLS1080p;
module.exports.uploadVideoHLS4K = uploadVideoHLS4K;
module.exports.uploadVideoThumbnail = uploadVideoThumbnail;
module.exports.uploadFlickOriginal = uploadFlickOriginal;
module.exports.uploadFlickProcessed480p = uploadFlickProcessed480p;
module.exports.uploadFlickProcessed720p = uploadFlickProcessed720p;
module.exports.uploadFlickProcessed1080p = uploadFlickProcessed1080p;
module.exports.uploadFlickCover = uploadFlickCover;

// Legacy exports for backward compatibility
module.exports.uploadProfile = uploadProfileCurrent;
module.exports.uploadCover = uploadProfileCurrent;
module.exports.uploadPost = uploadPostImage;
module.exports.uploadChat = upload;
