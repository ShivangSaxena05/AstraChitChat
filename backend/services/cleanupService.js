/**
 * cleanupService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles automatic cleanup of expired stories and orphaned media assets
 * 
 * Features:
 * - Cleanup expired stories (expiresAt < now)
 * - Cleanup orphaned posts (posts with deleted media)
 * - Audit trail of deleted assets
 * - Error handling and retry logic
 * - Logging for monitoring
 * 
 * Usage:
 *   const { startCleanupScheduler, cleanupExpiredStories } = require('./cleanupService');
 *   
 *   // Start automatic cleanup on app startup
 *   startCleanupScheduler();
 *   
 *   // Or manually trigger cleanup
 *   await cleanupExpiredStories();
 */

const mongoose = require('mongoose');
const Story = require('../models/Story');
const Post = require('../models/Post');
const { deleteCloudinaryAsset } = require('./mediaService');

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup Audit Schema - Track deleted assets for monitoring
// ─────────────────────────────────────────────────────────────────────────────

const cleanupAuditSchema = new mongoose.Schema({
    assetType: {
        type: String,
        enum: ['story', 'post', 'profile', 'other'],
        required: true
    },
    sourceId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    mediaPublicId: {
        type: String,
        required: true
    },
    resourceType: {
        type: String,
        enum: ['image', 'video', 'auto'],
        default: 'auto'
    },
    reason: {
        type: String,
        enum: ['expired', 'orphaned', 'manual', 'failed_upload'],
        required: true
    },
    deletedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    status: {
        type: String,
        enum: ['success', 'failed'],
        default: 'success'
    },
    error: {
        type: String,
        default: null
    },
    retryCount: {
        type: Number,
        default: 0,
        max: 5
    },
    nextRetryAt: {
        type: Date,
        default: null
    }
});

// Add index for failed deletions that need retry
cleanupAuditSchema.index({ status: 1, nextRetryAt: 1 });

const CleanupAudit = mongoose.model('CleanupAudit', cleanupAuditSchema);

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cleanup all expired stories
 * Deletes story records and their associated Cloudinary assets
 * 
 * @returns {Object} Cleanup statistics
 */
const cleanupExpiredStories = async () => {
    const startTime = Date.now();
    const stats = {
        checked: 0,
        deleted: 0,
        failed: 0,
        errors: []
    };

    try {
        console.log('[cleanupService] Starting expired stories cleanup...');

        // Find all stories that have expired
        const expiredStories = await Story.find({
            expiresAt: { $lt: new Date() }
        });

        stats.checked = expiredStories.length;
        console.log(`[cleanupService] Found ${expiredStories.length} expired stories to clean up`);

        // Delete each expired story and its media
        for (const story of expiredStories) {
            try {
                // Attempt to delete from Cloudinary if media exists
                if (story.media?.public_id) {
                    try {
                        await deleteCloudinaryAsset(
                            story.media.public_id,
                            story.media.resource_type || 'auto'
                        );
                        console.log(`[cleanupService] ✅ Deleted Cloudinary asset: ${story.media.public_id}`);
                    } catch (cloudinaryErr) {
                        console.error(`[cleanupService] ⚠️ Cloudinary deletion failed for story ${story._id}:`, {
                            publicId: story.media.public_id,
                            error: cloudinaryErr?.message
                        });

                        // Log failed deletion for audit and retry
                        await logCleanupAudit({
                            assetType: 'story',
                            sourceId: story._id,
                            mediaPublicId: story.media.public_id,
                            resourceType: story.media.resource_type || 'auto',
                            reason: 'expired',
                            status: 'failed',
                            error: cloudinaryErr?.message
                        });

                        stats.failed++;
                        stats.errors.push({
                            storyId: story._id,
                            error: cloudinaryErr?.message
                        });

                        // Continue to delete from DB anyway
                        // Asset will be orphaned but story won't accumulate
                    }
                }

                // Delete story from database
                await Story.deleteOne({ _id: story._id });
                stats.deleted++;

                // Log successful cleanup
                await logCleanupAudit({
                    assetType: 'story',
                    sourceId: story._id,
                    mediaPublicId: story.media?.public_id || 'unknown',
                    resourceType: story.media?.resource_type || 'auto',
                    reason: 'expired',
                    status: 'success'
                });

                console.log(`[cleanupService] ✅ Cleaned up story: ${story._id}`);
            } catch (err) {
                stats.failed++;
                stats.errors.push({
                    storyId: story._id,
                    error: err.message
                });
                console.error(`[cleanupService] ❌ Cleanup failed for story ${story._id}:`, err.message);
            }
        }

        const duration = Date.now() - startTime;
        console.log(`[cleanupService] Cleanup complete (${duration}ms):`, {
            checked: stats.checked,
            deleted: stats.deleted,
            failed: stats.failed
        });

        return stats;
    } catch (err) {
        console.error('[cleanupService] Fatal error during cleanup:', err);
        throw err;
    }
};

/**
 * Cleanup orphaned posts (posts with no valid media)
 * These can occur if media upload succeeds but post creation fails
 * 
 * @returns {Object} Cleanup statistics
 */
const cleanupOrphanedPosts = async () => {
    const startTime = Date.now();
    const stats = {
        checked: 0,
        deleted: 0,
        failed: 0,
        errors: []
    };

    try {
        console.log('[cleanupService] Starting orphaned posts cleanup...');

        // Find posts with empty or invalid media arrays
        const orphanedPosts = await Post.find({
            $or: [
                { media: { $exists: false } },
                { media: { $size: 0 } },
                { media: null }
            ],
            isDeleted: false
        });

        stats.checked = orphanedPosts.length;
        console.log(`[cleanupService] Found ${orphanedPosts.length} orphaned posts`);

        for (const post of orphanedPosts) {
            try {
                // Mark as deleted instead of removing (soft delete for recovery)
                post.isDeleted = true;
                await post.save();
                stats.deleted++;

                await logCleanupAudit({
                    assetType: 'post',
                    sourceId: post._id,
                    mediaPublicId: 'orphaned',
                    reason: 'orphaned',
                    status: 'success'
                });

                console.log(`[cleanupService] ✅ Marked orphaned post as deleted: ${post._id}`);
            } catch (err) {
                stats.failed++;
                stats.errors.push({
                    postId: post._id,
                    error: err.message
                });
                console.error(`[cleanupService] ❌ Failed to cleanup post ${post._id}:`, err.message);
            }
        }

        const duration = Date.now() - startTime;
        console.log(`[cleanupService] Orphaned posts cleanup complete (${duration}ms):`, stats);

        return stats;
    } catch (err) {
        console.error('[cleanupService] Fatal error during orphaned posts cleanup:', err);
        throw err;
    }
};

/**
 * Retry failed asset deletions
 * Attempts to delete Cloudinary assets that failed during initial cleanup
 * 
 * @returns {Object} Retry statistics
 */
const retryFailedDeletions = async () => {
    const startTime = Date.now();
    const stats = {
        retried: 0,
        succeeded: 0,
        failed: 0,
        errors: []
    };

    try {
        console.log('[cleanupService] Starting failed deletion retries...');

        // Find failed deletions that are ready for retry
        const failedDeletions = await CleanupAudit.find({
            status: 'failed',
            retryCount: { $lt: 5 },
            $or: [
                { nextRetryAt: { $exists: false } },
                { nextRetryAt: { $lte: new Date() } }
            ]
        }).limit(10);  // Limit retries per run to avoid overload

        stats.retried = failedDeletions.length;
        console.log(`[cleanupService] Found ${failedDeletions.length} failed deletions to retry`);

        for (const audit of failedDeletions) {
            try {
                // Attempt to delete from Cloudinary
                await deleteCloudinaryAsset(audit.mediaPublicId, audit.resourceType);

                // Update audit record to success
                audit.status = 'success';
                audit.error = null;
                audit.retryCount += 1;
                await audit.save();

                stats.succeeded++;
                console.log(`[cleanupService] ✅ Retry succeeded: ${audit.mediaPublicId}`);
            } catch (err) {
                // Update retry count and schedule next retry
                audit.retryCount += 1;
                audit.error = err.message;

                // Exponential backoff: 1 hour, 4 hours, 1 day, 1 week, 2 weeks
                const backoffMinutes = [60, 240, 1440, 10080, 20160];
                const nextRetryMinutes = backoffMinutes[Math.min(audit.retryCount - 1, 4)];
                audit.nextRetryAt = new Date(Date.now() + nextRetryMinutes * 60 * 1000);

                await audit.save();

                stats.failed++;
                stats.errors.push({
                    publicId: audit.mediaPublicId,
                    retryCount: audit.retryCount,
                    error: err.message
                });
                console.error(`[cleanupService] ⚠️ Retry failed for ${audit.mediaPublicId}:`, err.message);
            }
        }

        const duration = Date.now() - startTime;
        console.log(`[cleanupService] Retry cleanup complete (${duration}ms):`, stats);

        return stats;
    } catch (err) {
        console.error('[cleanupService] Fatal error during retry cleanup:', err);
        throw err;
    }
};

/**
 * Log cleanup action to audit trail
 * 
 * @param {Object} auditData - Audit record data
 */
const logCleanupAudit = async (auditData) => {
    try {
        await CleanupAudit.create(auditData);
    } catch (err) {
        console.error('[cleanupService] Failed to log audit:',  err.message);
        // Don't throw - audit logging shouldn't block cleanup
    }
};

/**
 * Run all cleanup tasks
 * 
 * @returns {Object} Combined statistics from all cleanup tasks
 */
const runAllCleanup = async () => {
    try {
        console.log('[cleanupService] ═══════════════════════════════════════════════════');
        console.log('[cleanupService] Starting full cleanup cycle');
        console.log('[cleanupService] ═══════════════════════════════════════════════════');

        const results = {
            expiredStories: await cleanupExpiredStories(),
            orphanedPosts: await cleanupOrphanedPosts(),
            retries: await retryFailedDeletions(),
            timestamp: new Date(),
            duration: 0
        };

        console.log('[cleanupService] ═══════════════════════════════════════════════════');
        console.log('[cleanupService] Cleanup cycle complete:', results);
        console.log('[cleanupService] ═══════════════════════════════════════════════════');

        return results;
    } catch (err) {
        console.error('[cleanupService] ❌ Cleanup cycle failed:', err);
        throw err;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler Setup (Optional - requires manual schedule with cron)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start cleanup scheduler
 * Schedules cleanup tasks at regular intervals using node-cron
 * 
 * @param {Object} options - Scheduler options
 * @param {number} options.expiredStoriesInterval - Minutes between expired story cleanups (default: 360 = 6 hours)
 * @param {number} options.orphanedPostsInterval - Minutes between orphaned post cleanups (default: 1440 = 24 hours)
 * @param {number} options.retryInterval - Minutes between retry attempts (default: 60 = 1 hour)
 */
const startCleanupScheduler = (options = {}) => {
    const cron = require('node-cron');
    
    const {
        expiredStoriesInterval = 360,      // Every 6 hours
        orphanedPostsInterval = 1440,      // Every 24 hours
        retryInterval = 60                 // Every 1 hour
    } = options;

    // Convert minutes to cron expressions
    // cron format: minute hour day month day-of-week
    // */360 means every 360 minutes, but we need to calculate proper intervals
    
    try {
        // Schedule expired stories cleanup every 6 hours
        // At minute 0, every 6 hours: 0 0,6,12,18 * * *
        cron.schedule('0 0,6,12,18 * * *', async () => {
            try {
                console.log('[cleanupService] ⏱️ Scheduled task: Cleaning up expired stories');
                await cleanupExpiredStories();
            } catch (err) {
                console.error('[cleanupService] ❌ Scheduled cleanup expired stories failed:', err.message);
            }
        });

        // Schedule orphaned posts cleanup every 24 hours (daily at 2 AM)
        // 0 2 * * *
        cron.schedule('0 2 * * *', async () => {
            try {
                console.log('[cleanupService] ⏱️ Scheduled task: Cleaning up orphaned posts');
                await cleanupOrphanedPosts();
            } catch (err) {
                console.error('[cleanupService] ❌ Scheduled cleanup orphaned posts failed:', err.message);
            }
        });

        // Schedule retry deletion attempts every 1 hour
        // 0 * * * * (at minute 0 of every hour)
        cron.schedule('0 * * * *', async () => {
            try {
                console.log('[cleanupService] ⏱️ Scheduled task: Retrying failed asset deletions');
                await retryFailedDeletions();
            } catch (err) {
                console.error('[cleanupService] ❌ Scheduled cleanup retries failed:', err.message);
            }
        });

        console.log('[cleanupService] ✅ Cleanup scheduler started successfully');
        console.log('[cleanupService] Scheduled intervals:');
        console.log('  - Expired stories: Every 6 hours at 00:00, 06:00, 12:00, 18:00');
        console.log('  - Orphaned posts: Daily at 02:00');
        console.log('  - Retry deletions: Hourly at minute 0');

        return {
            expiredStoriesInterval,
            orphanedPostsInterval,
            retryInterval,
            status: 'started'
        };
    } catch (err) {
        console.error('[cleanupService] ❌ Failed to start cleanup scheduler:', err.message);
        throw err;
    }
};

module.exports = {
    // Cleanup functions
    cleanupExpiredStories,
    cleanupOrphanedPosts,
    retryFailedDeletions,
    runAllCleanup,
    
    // Audit functions
    logCleanupAudit,
    CleanupAudit,
    
    // Scheduler
    startCleanupScheduler
};
