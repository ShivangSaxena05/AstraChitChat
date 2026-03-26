/**
 * mediaService.js
 * ---------------
 * Centralised helpers for all Cloudinary / S3 media operations.
 *
 * Cloudinary folder structure:
 *   Astra/profile/{userId}      — profile pictures
 *   Astra/cover/{userId}        — cover photos
 *   Astra/posts/{userId}        — post images/videos
 *   Astra/chat/{chatId}         — chat media files
 *
 * S3 folder structure (backup):
 *   profile/{userId}/{timestamp}-{filename}   — profile pictures
 *   cover/{userId}/{timestamp}-{filename}     — cover photos
 *   posts/{userId}/{timestamp}-{filename}     — post images/videos
 *   chat/{chatId}/{timestamp}-{filename}      — chat media files
 *
 * Exports:
 *   uploadToCloudinary(fileBuffer, options)
 *     → { url, publicId, secure_url }
 *
 *   deleteFromCloudinary(publicId)
 *     → void
 *
 *   getPresignedUploadUrl(options) - S3 only
 *     → { presignedUrl, key, cloudfrontUrl }
 *
 *   deleteS3Object(key) - S3 only
 *     → void
 */

const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3 = require('../config/s3');
const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

const STORAGE_TYPE = process.env.STORAGE_TYPE || 'cloudinary';

const MEDIA_FOLDERS = {
    profile: 'profile',
    cover: 'cover',
    post: 'posts',
    chat: 'chat',
};

const uploadToCloudinary = (fileBuffer, options) => {
    return new Promise((resolve, reject) => {
        const { folder, ownerId, fileName, resourceType = 'auto' } = options;
        
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: `Astra/${folder}/${ownerId}`,
                public_id: fileName.replace(/\.[^/.]+$/, ''),
                resource_type: resourceType,
                transformation: [{ quality: 'auto', fetch_format: 'auto' }]
            },
            (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve({
                        url: result.secure_url,
                        publicId: result.public_id,
                        secureUrl: result.secure_url,
                        resourceType: result.resource_type,
                        format: result.format,
                        width: result.width,
                        height: result.height
                    });
                }
            }
        );

        streamifier.createReadStream(fileBuffer).pipe(uploadStream);
    });
};

const uploadFileToCloudinary = (file) => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload(file.path, {
            folder: `Astra/posts`,
            resource_type: 'auto',
            transformation: [{ quality: 'auto', fetch_format: 'auto' }]
        }, (error, result) => {
            if (error) {
                reject(error);
            } else {
                resolve({
                    url: result.secure_url,
                    publicId: result.public_id,
                    secureUrl: result.secure_url,
                    resourceType: result.resource_type,
                    format: result.format
                });
            }
        });
    });
};

const deleteFromCloudinary = async (publicId) => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.destroy(publicId, (error, result) => {
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
};

const getCloudinaryUploadUrl = async (options) => {
    const { folder, ownerId, fileName, resourceType = 'auto' } = options;
    
    const timestamp = Date.now();
    const publicId = `Astra/${folder}/${ownerId}/${timestamp}-${fileName.replace(/\.[^/.]+$/, '')}`;
    
    const signedUpload = cloudinary.utils.api_sign_request({
        timestamp: timestamp,
        folder: `Astra/${folder}/${ownerId}`,
        public_id: publicId,
        resource_type: resourceType
    }, process.env.CLOUDINARY_API_SECRET);

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;

    return {
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
        cloudName,
        apiKey,
        timestamp,
        publicId,
        signature: signedUpload,
        folder: `Astra/${folder}/${ownerId}`
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Presigned upload URL — client uploads directly to S3
//
//    options: {
//      folder:    'profile' | 'cover' | 'post' | 'chat'  (required)
//      ownerId:   userId or chatId — used as subfolder    (required)
//      fileName:  original file name                      (required)
//      fileType:  MIME type (e.g. 'image/jpeg')          (required)
//      expiresIn: presigned URL TTL in seconds            (default 300)
//    }
// ─────────────────────────────────────────────────────────────────────────────
const getPresignedUploadUrl = async (options) => {
    // Support legacy call signature: (userId, fileName, fileType, expiresIn)
    let folder, ownerId, fileName, fileType, fileSize, expiresIn;
    if (typeof options === 'string') {
        // Legacy: getPresignedUploadUrl(userId, fileName, fileType, expiresIn)
        ownerId   = options;
        fileName  = arguments[1];
        fileType  = arguments[2];
        expiresIn = arguments[3] || 300;
        folder    = 'posts'; // default folder for legacy calls
    } else {
        ({ folder, ownerId, fileName, fileType, fileSize, expiresIn = 300 } = options);
    }

    if (!MEDIA_FOLDERS[folder]) {
        throw new Error(`Invalid media folder: "${folder}". Must be one of: ${Object.keys(MEDIA_FOLDERS).join(', ')}`);
    }

    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const prefix = MEDIA_FOLDERS[folder];
    const key = `${prefix}/${ownerId}/${Date.now()}-${safeFileName}`;
    const bucket = process.env.AWS_BUCKET_NAME;
    const cloudfrontBase = process.env.CLOUDFRONT_URL.replace(/\/$/, '');

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: fileType,
        ContentLength: fileSize,
    });

    const presignedUrl = await getSignedUrl(s3, command, { expiresIn });

    return {
        presignedUrl,          // Client PUTs to this URL (expires in `expiresIn` seconds)
        key,                   // Store this in MongoDB as mediaKey for future deletion
        cloudfrontUrl: `${cloudfrontBase}/${key}`, // Store this as mediaUrl in MongoDB
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Delete an S3 object by key
// ─────────────────────────────────────────────────────────────────────────────
const deleteS3Object = async (key) => {
    if (!key) return; // Gracefully skip if no key stored
    await s3.send(new DeleteObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
    }));
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. CloudFront Signed URL — time-limited access for private chat media
//    Requires CLOUDFRONT_KEY_PAIR_ID and CLOUDFRONT_PRIVATE_KEY in .env
//    The private key value should be the PEM string with newlines replaced by \n
// ─────────────────────────────────────────────────────────────────────────────
const getSignedCloudfrontUrl = (s3Key, expiresInSeconds = 3600) => {
    const keyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID;
    const privateKey = process.env.CLOUDFRONT_PRIVATE_KEY;

    if (!keyPairId || !privateKey) {
        // Fall back to plain CloudFront URL if signing keys not configured yet.
        // Set up CloudFront key pair in AWS Console → CloudFront → Key management
        // to enable proper signed URLs for private chat media.
        console.warn('[mediaService] CLOUDFRONT_KEY_PAIR_ID or CLOUDFRONT_PRIVATE_KEY not set. Returning unsigned URL.');
        const cloudfrontBase = process.env.CLOUDFRONT_URL.replace(/\/$/, '');
        return `${cloudfrontBase}/${s3Key}`;
    }

    try {
        const { getSignedUrl: cfGetSignedUrl } = require('@aws-sdk/cloudfront-signer');
        const url = `${process.env.CLOUDFRONT_URL.replace(/\/$/, '')}/${s3Key}`;
        return cfGetSignedUrl({
            url,
            keyPairId,
            privateKey: privateKey.replace(/\\n/g, '\n'), // Handle escaped newlines in env
            dateLessThan: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
        });
    } catch (err) {
        console.error('[mediaService] Failed to create CF signed URL:', err.message);
        const cloudfrontBase = process.env.CLOUDFRONT_URL.replace(/\/$/, '');
        return `${cloudfrontBase}/${s3Key}`;
    }
};

module.exports = { 
    uploadToCloudinary,
    uploadFileToCloudinary,
    deleteFromCloudinary,
    getCloudinaryUploadUrl,
    getPresignedUploadUrl, 
    deleteS3Object, 
    getSignedCloudfrontUrl, 
    MEDIA_FOLDERS,
    STORAGE_TYPE
};
