/**
 * mediaService.js (v2.0)
 * ---------------
 * Centralised helpers for all Cloudinary / S3 media operations.
 *
 * Cloudinary folder structure (myapp/):
 *   myapp/images/posts/original/{userId}       — post images
 *   myapp/profile/current/{userId}             — active profile pictures
 *   myapp/profile/history/{userId}             — old profile pictures (90 days)
 *   myapp/stories/images/{userId}              — story images (24-hour expiry)
 *   myapp/stories/videos/{userId}              — story videos (24-hour expiry)
 *   myapp/videos/original/{userId}             — original long videos
 *   myapp/videos/hls/{quality}/{userId}        — HLS processed (360p, 720p, 1080p, 4k)
 *   myapp/videos/thumbnails/{userId}           — video previews
 *   myapp/flick/original/{userId}              — raw short videos
 *   myapp/flick/processed/{quality}/{userId}   — optimized (480p, 720p, 1080p)
 *   myapp/flick/covers/{userId}                — flick thumbnails
 *
 * S3 folder structure (backup):
 *   images/posts/original/{userId}/{timestamp}-{filename}
 *   profile/current/{userId}/{timestamp}-{filename}
 *   profile/history/{userId}/{timestamp}-{filename}
 *   stories/images/{userId}/{timestamp}-{filename}
 *   stories/videos/{userId}/{timestamp}-{filename}
 *   videos/original/{userId}/{timestamp}-{filename}
 *   videos/hls/{quality}/{userId}/{timestamp}-{filename}
 *   videos/thumbnails/{userId}/{timestamp}-{filename}
 *   flick/original/{userId}/{timestamp}-{filename}
 *   flick/processed/{quality}/{userId}/{timestamp}-{filename}
 *   flick/covers/{userId}/{timestamp}-{filename}
 *
 * Exports:
 *   uploadToCloudinary(fileBuffer, options)
 *     → { url, publicId, secureUrl, resourceType, format, width, height }
 *
 *   deleteCloudinaryAsset(publicId, resourceType)
 *     → void
 *
 *   deleteFromCloudinary(publicId)
 *     → void
 *
 *   getCloudinaryUploadUrl(options)
 *     → { uploadUrl, cloudName, uploadPreset, folder, publicId, uploadType }
 *
 *   getPresignedUploadUrl(options) - S3 only
 *     → { presignedUrl, key, cloudfrontUrl }
 *
 *   deleteS3Object(key) - S3 only
 *     → void
 *
 *   getSignedCloudfrontUrl(s3Key, expiresInSeconds)
 *     → signed URL string
 */

const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3 = require('../config/s3');
const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

const STORAGE_TYPE = process.env.STORAGE_TYPE || 'cloudinary';

const MEDIA_FOLDERS = {
    // Images
    postImage: 'images/posts/original',
    
    // Profile
    profileCurrent: 'profile/current',
    profileHistory: 'profile/history',
    
    // Stories (24-hour expiry)
    storyImage: 'stories/images',
    storyVideo: 'stories/videos',
    
    // Videos (long-form)
    videoOriginal: 'videos/original',
    videoHLS360p: 'videos/hls/360p',
    videoHLS720p: 'videos/hls/720p',
    videoHLS1080p: 'videos/hls/1080p',
    videoHLS4K: 'videos/hls/4k',
    videoThumbnail: 'videos/thumbnails',
    
    // Flick (short vertical videos)
    flickOriginal: 'flick/original',
    flickProcessed480p: 'flick/processed/480p',
    flickProcessed720p: 'flick/processed/720p',
    flickProcessed1080p: 'flick/processed/1080p',
    flickCover: 'flick/covers',
    
    // Legacy support (for backward compatibility)
    post: 'images/posts/original',
    profile: 'profile/current',
    cover: 'profile/current', // Maps to profile/current (old cover logic)
    chat: 'chat',
};

const uploadToCloudinary = (fileBuffer, options) => {
    return new Promise((resolve, reject) => {
        const { folder, ownerId, fileName, resourceType = 'auto' } = options;
        
        // ✅ CRITICAL FIX: Validate all required parameters
        if (!fileBuffer) {
            return reject(new Error('fileBuffer is required'));
        }
        if (!folder) {
            return reject(new Error('folder is required'));
        }
        if (!ownerId) {
            return reject(new Error('ownerId is required'));
        }
        if (!fileName) {
            return reject(new Error('fileName is required'));
        }

        // Validate folder path — prevents typos and ensures consistent structure
        // Refer to MEDIA_FOLDERS mapping for valid folder keys
        if (!MEDIA_FOLDERS[folder]) {
            return reject(new Error(`Invalid media folder: "${folder}". Must be one of: ${Object.keys(MEDIA_FOLDERS).join(', ')}`));
        }

        const folderPath = MEDIA_FOLDERS[folder];
        // ✅ FIX: Use SECONDS consistently across all functions
        // Cloudinary API expects timestamps in SECONDS for consistency
        // This matches getCloudinaryUploadUrl() implementation
        const timestamp = Math.floor(Date.now() / 1000);
        const safeFileName = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
        // ✅ FIX: Properly construct publicId to match what Cloudinary will return
        // When folder contains full path, don't include myapp prefix again
        const publicIdSuffix = `${timestamp}-${safeFileName}`;
        
        // Upload to Cloudinary using programmatic API (not preset-based)
        // Folder path: myapp/{folderPath}/{ownerId}/{timestamp}-{safeFileName}
        // Example for profile: myapp/profile/current/{userId}/{timestamp}-{filename}
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: `myapp/${folderPath}/${ownerId}`,
                public_id: publicIdSuffix,
                resource_type: resourceType,
                transformation: [{ quality: 'auto', fetch_format: 'auto' }]
            },
            (error, result) => {
                if (error) {
                    console.error('[uploadToCloudinary] Cloudinary upload failed:', {
                        folder,
                        ownerId,
                        fileName,
                        error: error.message,
                        http_code: error.http_code
                    });
                    reject(error);
                } else {
                    // ✅ FIX: Use the actual public_id from Cloudinary response
                    // This ensures we have the correct ID for future deletion
                    resolve({
                        url: result.secure_url,
                        publicId: result.public_id,  // Use Cloudinary's returned public_id
                        secureUrl: result.secure_url,
                        resourceType: result.resource_type,
                        format: result.format,
                        width: result.width,
                        height: result.height
                    });
                }
            }
        );

        // ✅ CRITICAL FIX: Add error handlers to the stream
        // Without these, promise will hang if stream fails
        const readStream = streamifier.createReadStream(fileBuffer);
        
        // Handle read stream errors
        readStream.on('error', (error) => {
            console.error('[uploadToCloudinary] Read stream error:', error.message);
            reject(new Error(`Failed to read file: ${error.message}`));
        });
        
        // Handle upload stream errors
        uploadStream.on('error', (error) => {
            console.error('[uploadToCloudinary] Upload stream error:', error.message);
            reject(new Error(`Upload stream error: ${error.message}`));
        });
        
        // Pipe the file to Cloudinary
        readStream.pipe(uploadStream);
    });
};



const deleteCloudinaryAsset = async (publicId, resourceType = 'image') => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.destroy(publicId, { resource_type: resourceType }, (error, result) => {
            if (error) {
                reject(error);
            } else {
                resolve(result);
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
    
    // Validate folder
    if (!MEDIA_FOLDERS[folder]) {
        throw new Error(`Invalid media folder: "${folder}". Must be one of: ${Object.keys(MEDIA_FOLDERS).join(', ')}`);
    }

    const folderPath = MEDIA_FOLDERS[folder];
    // ⚠️ IMPORTANT: Cloudinary expects timestamp in SECONDS, not milliseconds
    const timestamp = Math.floor(Date.now() / 1000);
    const safeFileName = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const publicId = `myapp/${folderPath}/${ownerId}/${timestamp}-${safeFileName}`;
    
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.CLOUDINARY_UNSIGNED_PRESET;

    // Check if unsigned preset is configured
    if (!uploadPreset) {
        console.warn('[getCloudinaryUploadUrl] CLOUDINARY_UNSIGNED_PRESET not configured. Falling back to signed upload.');
        
        // Fallback to signed upload (secure but requires API key/secret management)
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const signedUpload = cloudinary.utils.api_sign_request({
            timestamp: timestamp,
            folder: `myapp/${folderPath}/${ownerId}`,
            public_id: `${timestamp}-${safeFileName}`,
            resource_type: resourceType
        }, process.env.CLOUDINARY_API_SECRET);

        return {
            uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
            cloudName,
            apiKey,
            timestamp,
            publicId,
            signature: signedUpload,
            folder: `myapp/${folderPath}/${ownerId}`,
            uploadType: 'signed'
        };
    }

    // Use unsigned upload (recommended for frontend apps)
    // This requires configuring an unsigned preset in Cloudinary dashboard
    return {
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
        cloudName,
        uploadPreset,
        folder: `myapp/${folderPath}/${ownerId}`,
        publicId,
        uploadType: 'unsigned'
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Presigned upload URL — client uploads directly to S3
//
//    options: {
//      folder:    'postImage' | 'profileCurrent' | 'storyImage' | 'videoOriginal' | 'flickOriginal' | 'videoHLS720p' etc (required)
//      ownerId:   userId or chatId — used as subfolder    (required)
//      fileName:  original file name                      (required)
//      fileType:  MIME type (e.g. 'image/jpeg')          (required)
//      fileSize:  file size in bytes (optional)
//      expiresIn: presigned URL TTL in seconds            (default 300)
//    }
//
//    Example:
//      const result = await getPresignedUploadUrl({
//        folder: 'postImage',
//        ownerId: userId,
//        fileName: 'photo.jpg',
//        fileType: 'image/jpeg',
//        expiresIn: 600
//      });
// ─────────────────────────────────────────────────────────────────────────────
const getPresignedUploadUrl = async (options) => {
    // ⚠️ IMPORTANT: Must pass options as an object
    // The arguments object is unreliable in arrow functions and strict mode
    if (!options || typeof options !== 'object') {
        throw new Error('getPresignedUploadUrl() requires an options object. Example: { folder, ownerId, fileName, fileType, expiresIn }');
    }

    const { folder, ownerId, fileName, fileType, fileSize, expiresIn = 300 } = options;

    // Validate required fields
    if (!folder || !ownerId || !fileName || !fileType) {
        throw new Error('getPresignedUploadUrl() requires: folder, ownerId, fileName, fileType');
    }

    if (!MEDIA_FOLDERS[folder]) {
        throw new Error(`Invalid media folder: "${folder}". Must be one of: ${Object.keys(MEDIA_FOLDERS).join(', ')}`);
    }

    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const folderPath = MEDIA_FOLDERS[folder];
    const key = `${folderPath}/${ownerId}/${Date.now()}-${safeFileName}`;
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
    deleteCloudinaryAsset,
    deleteFromCloudinary,
    getCloudinaryUploadUrl,
    getPresignedUploadUrl, 
    deleteS3Object, 
    getSignedCloudfrontUrl, 
    MEDIA_FOLDERS,
    STORAGE_TYPE
};
