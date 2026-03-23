const multer = require('multer');
const multerS3 = require('multer-s3');
const s3 = require('../config/s3');
const cloudinary = require('../config/cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const STORAGE_TYPE = process.env.STORAGE_TYPE || 'cloudinary';

const createCloudinaryStorage = (folder) => {
    return new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: `Astra/${folder}`,
            allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'mp3', 'wav', 'ogg'],
            resource_type: 'auto',
            transformation: [{ quality: 'auto', fetch_format: 'auto' }]
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
            const allowed = /image\/(jpeg|jpg|png|gif|webp)|video\/(mp4|quicktime|x-msvideo)/;
            if (allowed.test(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Only image and video files are allowed'), false);
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

const upload = createUpload('posts');

module.exports = upload;
module.exports.createUpload = createUpload;
module.exports.STORAGE_TYPE = STORAGE_TYPE;
