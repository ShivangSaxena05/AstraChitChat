const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('./cloudinary');

const createCloudinaryStorage = (folder) => {
    return new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: `Astra/${folder}`,
            allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'avi', 'mp3', 'm4a', 'wav', 'ogg'],
            resource_type: 'auto',
            transformation: [{ quality: 'auto', fetch_format: 'auto' }]
        }
    });
};

const storageProfile = createCloudinaryStorage('profile');
const storageCover = createCloudinaryStorage('cover');
const storagePost = createCloudinaryStorage('posts');
const storageChat = createCloudinaryStorage('chat');

const uploadProfile = multer({ storage: storageProfile });
const uploadCover = multer({ storage: storageCover });
const uploadPost = multer({ storage: storagePost });
const uploadChat = multer({ storage: storageChat });
const upload = uploadPost;

module.exports = upload;
module.exports.uploadProfile = uploadProfile;
module.exports.uploadCover = uploadCover;
module.exports.uploadPost = uploadPost;
module.exports.uploadChat = uploadChat;
module.exports.createCloudinaryStorage = createCloudinaryStorage;
