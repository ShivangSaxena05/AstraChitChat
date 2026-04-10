/**
 * DEPRECATED: This file should not be used.
 * 
 * MIGRATION NOTICE:
 * - Use middleware/uploadMiddleware.js instead
 * - mediaRoutes.js shows the correct pattern
 * 
 * WHY: The old multer-storage-cloudinary system creates req.file with:
 * - req.file.path (Cloudinary URL)
 * - req.file.filename (public ID)
 * - req.file.buffer = UNDEFINED ❌
 * 
 * This causes 500 errors when route handlers call:
 *   uploadToCloudinary(req.file.buffer, ...) // buffer is undefined!
 * 
 * The new system (uploadMiddleware.js) uses memory storage:
 * - req.file.buffer = File contents in memory ✓
 * - mediaService.js handles Cloudinary upload
 * - Cleaner separation of concerns
 */

throw new Error(
  'DO NOT USE config/multer.js. This file uses the deprecated multer-storage-cloudinary system.\n' +
  'Use middleware/uploadMiddleware.js instead. See config/multer.js for migration details.'
);
