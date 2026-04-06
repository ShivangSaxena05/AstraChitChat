/**
 * ⚠️ DEPRECATED: uploadMiddleware.js
 * 
 * This middleware has been superseded by:
 *   - config/multerCloudinary.js (for Cloudinary uploads)
 *   - services/mediaService.js (for S3 presigned URLs)
 * 
 * All routes should now use:
 *   - /api/media/upload/post
 *   - /api/media/upload/profile
 *   - /api/media/upload/story/image
 *   - /api/media/upload/story/video
 *   - /api/media/upload/video
 *   - /api/media/upload/flick
 *   - /api/media/upload/flick-cover
 * 
 * Or for S3 direct uploads:
 *   - GET /api/media/presigned-url
 * 
 * Legacy support (DO NOT USE IN NEW CODE):
 */

const multer = require('multer');
const multerS3 = require('multer-s3');
const s3 = require('../config/s3');
const cloudinary = require('../config/cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const STORAGE_TYPE = process.env.STORAGE_TYPE || 'cloudinary';

const createCloudinaryStorage = (folder) => {
    return new CloudinaryStorage({
        cloudinary: cloudinary,
        params: async (req, file, cb) => {
            const userId = req.user?._id?.toString() || 'anonymous';
            const timestamp = Date.now();
            const safeFileName = file.originalname.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
            
            cb(null, {
                folder: `myapp/${folder}/${userId}`,
                allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'mp3', 'wav', 'ogg'],
                resource_type: 'auto',
                public_id: `${timestamp}-${safeFileName}`,
                transformation: [{ quality: 'auto', fetch_format: 'auto' }]
            });
        }
    });
};

const createS3Upload = (folder, getOwnerId) => {
    return multer({
        storage: multerS3({
            s3: s3,
            bucket: process.env.AWS_BUCKET_NAME,
            contentType: multerS3.AUTO_CONTENT_TYPE,
            key: function (req, file, cb) {
                const ownerId = getOwnerId
                    ? getOwnerId(req)
                    : req.user._id.toString();
                const key = `${folder}/${ownerId}/${Date.now()}-${file.originalname}`;
                cb(null, key);
            },
        }),
        limits: { fileSize: 100 * 1024 * 1024 },
        fileFilter: function (req, file, cb) {
            const allowed = /image\/(jpeg|jpg|png|gif|webp)|video\/(mp4|quicktime|x-msvideo)|audio\/(mpeg|mp4|ogg|wav)/;
            if (allowed.test(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error(`Only images, videos, and audio allowed. Got: ${file.mimetype}`), false);
            }
        },
    });
};

const createUpload = (folder, getOwnerId) => {
    if (STORAGE_TYPE === 's3') {
        return createS3Upload(folder, getOwnerId);
    }
    return multer({ storage: createCloudinaryStorage(folder) });
};

const upload = createUpload('images/posts/original');

module.exports = upload;
module.exports.createUpload = createUpload;
module.exports.STORAGE_TYPE = STORAGE_TYPE;
