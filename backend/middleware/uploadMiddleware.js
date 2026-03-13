const multer = require('multer');
const multerS3 = require('multer-s3');
const s3 = require('../config/s3');

/**
 * Creates a multer upload instance that stores files in a specific S3 folder.
 *
 * S3 key format: {folder}/{ownerId}/{timestamp}-{originalname}
 *
 * @param {string} folder - S3 folder prefix: 'profile', 'cover', 'posts', or 'chat'
 * @param {Function} [getOwnerId] - Function to extract the ownerId from the request.
 *   Defaults to req.user._id. For chat uploads, pass (req) => req.params.chatId.
 */
const createUpload = (folder, getOwnerId) => {
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
        limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
        fileFilter: function (req, file, cb) {
            const allowed = /image\/(jpeg|jpg|png|gif|webp)|video\/(mp4|quicktime|x-msvideo)/;
            if (allowed.test(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Only image and video files are allowed'), false);
            }
        },
    });
};

// Default upload instance (posts folder, keyed by userId) — backward-compatible
const upload = createUpload('posts');

module.exports = upload;
module.exports.createUpload = createUpload;
