# Story Image Upload 500 Error - Fix Summary

## Problem
The `/api/media/upload/story-image` endpoint was returning a 500 Internal Server Error when attempting to upload story images.

## Root Causes Identified

1. **Missing User Authentication Check**: The `createUploadHandler` didn't validate that `req.user` was properly set before attempting to access `req.user._id`
   - This could result in a TypeError when trying to call `.toString()` on undefined

2. **Missing Stream Error Handlers**: The `uploadToCloudinary` function used promises with a stream pipe but didn't handle stream errors
   - If the file read stream or upload stream failed, the promise would hang indefinitely instead of rejecting

3. **Insufficient Error Logging**: The error response didn't include enough diagnostic information
   - Made it difficult to identify whether the error was auth-related, file-related, or Cloudinary-related

## Fixes Applied

### 1. Backend Routes (`backend/routes/mediaRoutes.js`)

**Added authentication validation before processing uploads:**
```javascript
// ✅ CRITICAL FIX: Validate req.user before processing upload
// This prevents 500 errors when auth middleware fails silently
if (!req.user || !req.user._id) {
    console.error(`[mediaRoutes] Missing req.user for ${folder}`);
    return res.status(401).json({ success: false, message: 'Not authenticated' });
}
```

**Enhanced error logging** to include more diagnostic info:
- Added `statusCode`, `response.data`, and `stack` to error logs
- Returns error `code` field for client-side debugging

### 2. Media Service (`backend/services/mediaService.js`)

**Added parameter validation** in `uploadToCloudinary`:
```javascript
// ✅ CRITICAL FIX: Validate all required parameters
if (!fileBuffer) reject(new Error('fileBuffer is required'));
if (!folder) reject(new Error('folder is required'));
if (!ownerId) reject(new Error('ownerId is required'));
if (!fileName) reject(new Error('fileName is required'));
```

**Added error handlers for file streams:**
```javascript
// ✅ CRITICAL FIX: Add error handlers to the stream
// Without these, promise will hang if stream fails
const readStream = streamifier.createReadStream(fileBuffer);

// Handle read stream errors
readStream.on('error', (error) => {
    reject(new Error(`Failed to read file: ${error.message}`));
});

// Handle upload stream errors
uploadStream.on('error', (error) => {
    reject(new Error(`Upload stream error: ${error.message}`));
});

readStream.pipe(uploadStream);
```

**Improved public_id handling** to use Cloudinary's actual response value.

## Testing Steps

1. Ensure Cloudinary environment variables are set:
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`

2. Test the upload endpoint:
   ```bash
   # With proper auth token
   curl -X POST \
     -H "Authorization: Bearer <your_token>" \
     -F "file=@/path/to/image.jpg" \
     https://astrachitchat.onrender.com/api/media/upload/story-image
   ```

3. Expected response on success:
   ```json
   {
     "success": true,
     "message": "storyImage uploaded successfully",
     "url": "https://res.cloudinary.com/...",
     "publicId": "myapp/stories/images/<userId>/<timestamp>-<filename>",
     "secureUrl": "https://res.cloudinary.com/...",
     "resourceType": "image"
   }
   ```

## Common Issues to Check

| Issue | Check |
|-------|-------|
| 401 Not authenticated | Verify auth token is sent in Authorization header |
| 400 No file uploaded | Ensure FormData includes `file` field with File object |
| 500 Cloudinary error | Verify Cloudinary credentials in .env file |
| 500 Stream error | Check that file is valid and readable |

## Files Modified

- `backend/routes/mediaRoutes.js` - Added auth validation and enhanced error logging
- `backend/services/mediaService.js` - Added parameter validation and stream error handlers

## Cloudinary Folder Structure

Stories are uploaded to:
```
myapp/stories/images/{userId}/{timestamp}-{filename}
```

This folder is configured in `MEDIA_FOLDERS` mapping as `storyImage: 'stories/images'`.
