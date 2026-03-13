/**
 * mediaService.js
 * ---------------
 * Centralised helpers for all S3 / CloudFront media operations.
 *
 * S3 folder structure:
 *   profile/{userId}/{timestamp}-{filename}   — profile pictures
 *   cover/{userId}/{timestamp}-{filename}     — cover photos
 *   posts/{userId}/{timestamp}-{filename}     — post images/videos
 *   chat/{chatId}/{timestamp}-{filename}      — chat media files
 *
 * Exports:
 *   getPresignedUploadUrl(options)
 *     → { presignedUrl, key, cloudfrontUrl }
 *     Client PUTs directly to S3; saves cloudfrontUrl in MongoDB.
 *
 *   deleteS3Object(key)
 *     → void  (throws on error)
 *     Removes an object from the S3 bucket.
 *
 *   getSignedCloudfrontUrl(s3Key, expiresInSeconds?)
 *     → signed URL string
 *     Time-limited CF URL for private DM/chat media.
 *     Requires CLOUDFRONT_KEY_PAIR_ID + CLOUDFRONT_PRIVATE_KEY in .env.
 */

const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3 = require('../config/s3');

// Valid media categories → S3 folder prefixes
const MEDIA_FOLDERS = {
    profile: 'profile',
    cover:   'cover',
    post:    'posts',
    chat:    'chat',
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
    let folder, ownerId, fileName, fileType, expiresIn;
    if (typeof options === 'string') {
        // Legacy: getPresignedUploadUrl(userId, fileName, fileType, expiresIn)
        ownerId   = options;
        fileName  = arguments[1];
        fileType  = arguments[2];
        expiresIn = arguments[3] || 300;
        folder    = 'posts'; // default folder for legacy calls
    } else {
        ({ folder, ownerId, fileName, fileType, expiresIn = 300 } = options);
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

module.exports = { getPresignedUploadUrl, deleteS3Object, getSignedCloudfrontUrl, MEDIA_FOLDERS };
