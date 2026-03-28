const mongoose = require('mongoose');

/**
 * UserStats Schema
 * 
 * Dedicated stats model for user statistics.
 * This allows for:
 * - Atomic stat updates (no race conditions)
 * - Separate scaling if needed
 * - Better performance (stats queries don't load entire user doc)
 * - Easier to archive or reset stats
 * 
 * Stats are denormalized here from relationships:
 * - followersCount: COUNT of Follow docs where following = userId
 * - followingCount: COUNT of Follow docs where follower = userId
 * - postsCount: COUNT of Post docs where author = userId
 * - totalLikesCount: COUNT of Like docs where likedBy = userId (for received likes)
 * 
 * All counts are kept in sync via hooks on the related models.
 */
const userStatsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    postsCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    followersCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    followingCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalLikesCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    commentsCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Metadata for future features (e.g., trending, engagement tracking)
    engagementScore: {
      type: Number,
      default: 0,
    },

    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance on stats retrieval
userStatsSchema.index({ followersCount: -1 }); // For trending/popular users
userStatsSchema.index({ postsCount: -1 }); // For leaderboards
userStatsSchema.index({ updatedAt: -1 }); // For recent updates

module.exports = mongoose.model('UserStats', userStatsSchema);
