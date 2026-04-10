# 🚀 Quick Start - Upload Images, Videos & Flicks

**TL;DR:** Yes, you can upload everything! Here's how:

---

## 📸 Upload an Image

```typescript
import { uploadImageWithValidation } from './services/mediaService';

async function handleImageUpload(fileUri) {
  try {
    const result = await uploadImageWithValidation(fileUri, 'photo.jpg');
    console.log('✅ Success! Image URL:', result.url);
  } catch (error) {
    console.error('❌ Failed:', error.message);
    // Show error to user: "File size (65MB) exceeds limit of 50MB"
  }
}
```

**Limits:** Max 50MB, 100x100 to 8000x8000 pixels  
**Formats:** JPG, PNG, GIF, WebP

---

## 🎬 Upload a Video

```typescript
import { uploadVideoWithValidation } from './services/mediaService';

async function handleVideoUpload(fileUri) {
  try {
    const result = await uploadVideoWithValidation(fileUri, 'video.mp4');
    console.log('✅ Success! Video URL:', result.url);
    console.log('Duration:', result.duration, 'milliseconds');
  } catch (error) {
    console.error('❌ Failed:', error.message);
    // Show error to user: "Video duration (3661s) exceeds limit of 3600s"
  }
}
```

**Limits:** Max 500MB, 1 second to 1 hour  
**Formats:** MP4, MOV, AVI, MKV

---

## 🎞️ Upload a Flick (Vertical Video)

```typescript
import { validateStoryVideo } from './services/fileValidationService';
import { uploadVideoWithValidation } from './services/mediaService';

async function handleFlickUpload(fileUri) {
  try {
    // Validate (max 60 seconds, portrait orientation)
    const validation = await validateStoryVideo(fileUri);
    
    if (!validation.valid) {
      throw new Error(validation.errors[0].message);
    }
    
    // Check if vertical (flick style)
    const { width, height } = validation.videoData;
    const isVertical = height > width;
    console.log(isVertical ? '✅ Portrait' : '❌ Landscape');
    
    // Upload
    const result = await uploadVideoWithValidation(fileUri, 'flick.mp4');
    console.log('✅ Flick uploaded:', result.url);
  } catch (error) {
    console.error('❌ Failed:', error.message);
  }
}
```

**Limits:** Max 100MB, max 60 seconds, portrait (9:16 aspect ratio)  
**Formats:** MP4, MOV

---

## 📚 Upload a Story (Images & Videos)

```typescript
import { uploadStory } from './services/uploadService';

async function handleStoryUpload(fileUri, mediaType) {
  try {
    // mediaType: 'image' or 'video'
    const result = await uploadStory(fileUri, mediaType, 'story.jpg');
    
    console.log('✅ Story created!');
    console.log('URL:', result.data.mediaUrl);
    console.log('Expires:', result.data.expiresAt); // 24 hours from now
  } catch (error) {
    console.error('❌ Failed:', error.message);
  }
}
```

**Image:** Max 50MB  
**Video:** Max 100MB, max 60 seconds  
**Auto-expires:** 24 hours after creation

---

## 👤 Update Profile Picture

```typescript
import { 
  uploadProfilePictureWithValidation, 
  validateProfilePicture 
} from './services/mediaService';
import { getValidationWarnings } from './services/fileValidationService';

async function handleProfilePictureUpload(fileUri) {
  try {
    // Check quality first
    const validation = await validateProfilePicture(fileUri);
    const warnings = getValidationWarnings(validation);
    
    if (warnings.length > 0) {
      console.warn('⚠️', warnings[0]); // Low quality warning
    }
    
    // Upload (old picture is auto-deleted)
    const result = await uploadProfilePictureWithValidation(fileUri, 'profile.jpg');
    console.log('✅ Profile picture updated:', result.url);
  } catch (error) {
    console.error('❌ Failed:', error.message);
  }
}
```

**Limits:** Max 20MB  
**Minimum:** 150x150 pixels  
**Recommended:** 300x300 pixels

---

## 🖼️ Update Cover Photo

```typescript
import { 
  uploadCoverPhotoWithValidation 
} from './services/mediaService';

async function handleCoverPhotoUpload(fileUri) {
  try {
    const result = await uploadCoverPhotoWithValidation(fileUri, 'cover.jpg');
    console.log('✅ Cover photo updated:', result.url);
  } catch (error) {
    console.error('❌ Failed:', error.message);
  }
}
```

**Limits:** Max 30MB  
**Minimum:** 300x100 pixels  
**Recommended:** 1200x400 pixels

---

## 🎯 Create Post with Images/Videos

```typescript
import { post } from './services/api';

async function createPost(mediaUrls, caption) {
  try {
    // mediaUrls: array of { url, publicId, resourceType, width?, height? }
    const response = await post('/api/posts/upload', {
      media: mediaUrls,
      caption: caption,
      hashtags: [],
      visibility: 'public'
    });
    
    console.log('✅ Post created:', response.post._id);
  } catch (error) {
    console.error('❌ Failed:', error.message);
  }
}

// Usage:
const mediaUrls = [
  {
    url: 'https://res.cloudinary.com/.../image1.jpg',
    publicId: 'myapp/images/posts/original/userId/abc1',
    resourceType: 'image',
    width: 1920,
    height: 1080
  },
  // ... more media
];
await createPost(mediaUrls, 'My awesome post!');
```

---

## ❌ Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "File size exceeds limit" | File too large | Use smaller file or compress |
| "Image dimensions too small" | Image too small | Use higher resolution image |
| "Video too long" | Video duration exceeds limit | Trim video to <1 hour |
| "File extension not allowed" | Wrong format | Use JPG, PNG, GIF for images; MP4, MOV for videos |
| "Video loading timed out" | Large/corrupted video | Try another video file |
| "Network error" | Connection failed | Retry automatically (up to 3x) |

---

## ✅ All Upload Functions

| Function | File | Purpose |
|----------|------|---------|
| `uploadImageWithValidation()` | mediaService.ts | Upload image with validation |
| `uploadVideoWithValidation()` | mediaService.ts | Upload video with validation |
| `uploadProfilePictureWithValidation()` | mediaService.ts | Upload profile picture |
| `uploadCoverPhotoWithValidation()` | mediaService.ts | Upload cover photo |
| `uploadStoryImageWithValidation()` | mediaService.ts | Upload story image |
| `uploadStoryVideoWithValidation()` | mediaService.ts | Upload story video |
| `uploadStory()` | uploadService.ts | Create story (auto-validates) |
| `validateImageFile()` | fileValidationService.ts | Validate image manually |
| `validateVideoFile()` | fileValidationService.ts | Validate video manually |
| `validateMediaFile()` | fileValidationService.ts | Auto-detect and validate |

---

## 🎬 Media Type Limits Reference

| Type | Max Size | Formats | Max Duration | Special |
|------|----------|---------|--------------|---------|
| 📸 Image | 50 MB | JPG, PNG, GIF, WebP | N/A | 100-8000 px |
| 🎬 Video | 500 MB | MP4, MOV, AVI | 1 hour | H.264 preferred |
| 🎞️ Flick | 100 MB | MP4, MOV | 60 sec | 9:16 aspect ratio |
| 📚 Story (image) | 50 MB | JPG, PNG, WebP | N/A | Expires 24h |
| 📚 Story (video) | 100 MB | MP4, MOV | 60 sec | Expires 24h |
| 👤 Profile Pic | 20 MB | JPG, PNG, WebP | N/A | Min 150x150 |
| 🖼️ Cover Photo | 30 MB | JPG, PNG, WebP | N/A | Min 300x100 |

---

## 💡 Pro Tips

1. **Use the `*WithValidation` functions** for user-facing uploads
   - Instant feedback before network request
   - Prevents wasted bandwidth
   - Better user experience

2. **Handle errors gracefully**
   - Show user-friendly error messages
   - Don't show raw JSON errors
   - Suggest solutions

3. **Test with different file sizes**
   - Small files (< 1 MB)
   - Medium files (5-20 MB)
   - Large files (near limit)

4. **Story videos should be vertical**
   - Use mobile camera for best results
   - Test with 1080x1920 (perfect 9:16)
   - Avoid landscape videos for stories

5. **Profile pictures need good quality**
   - Use 300x300 or larger
   - Avoid cropped/tiny images
   - System warns if too small

---

## 🧪 Quick Test Commands

```bash
# Test image upload (if you have curl)
curl -X POST http://localhost:5000/api/media/upload/image \
  -F "file=@/path/to/image.jpg" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test video upload
curl -X POST http://localhost:5000/api/media/upload/video \
  -F "file=@/path/to/video.mp4" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test post creation
curl -X POST http://localhost:5000/api/posts/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "media": [{"url": "...", "publicId": "...", "resourceType": "image"}],
    "caption": "Test post"
  }'
```

---

## 📞 Need Help?

- **Validation issues?** Check `FRONTEND_FILE_VALIDATION_GUIDE.md`
- **Upload failing?** See `UPLOAD_READY_TO_TEST.md`
- **Bug details?** Check `UPLOAD_BUGS_AND_ISSUES.md`
- **Backend info?** See `backend/routes/mediaRoutes.js`

---

## 🎉 You're Ready!

Everything is working. Start uploading! 🚀

```
✅ Images      - JPG, PNG, GIF, WebP
✅ Videos      - MP4, MOV, AVI, MKV
✅ Flicks      - Short vertical videos
✅ Stories     - Auto-expire in 24h
✅ Profiles    - Profile & cover photos
✅ Validation  - Instant feedback
✅ Retry       - Auto-retry on failure
```

Happy uploading! 🎊
