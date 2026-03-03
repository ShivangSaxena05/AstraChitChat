const multer = require('multer');
const multerS3 = require('multer-s3');
const s3 = require('../config/s3');

// Set up multer with S3 storage via CloudFront
const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_BUCKET_NAME,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
            // Organise by user ID and timestamp for uniqueness
            const userId = req.user._id.toString();
            const fileName = `${userId}/${Date.now()}-${file.originalname}`;
            cb(null, fileName);
        },
    }),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
    fileFilter: function (req, file, cb) {
        // Allow images and videos only
        const allowed = /image\/(jpeg|jpg|png|gif|webp)|video\/(mp4|quicktime|x-msvideo)/;
        if (allowed.test(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only image and video files are allowed'), false);
        }
    },
});

module.exports = upload;