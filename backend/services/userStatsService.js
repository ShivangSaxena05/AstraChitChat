const UserStats = require('../models/UserStats');
const User = require('../models/User');

/**
 * Initialize or get user stats for a user
 * This ensures every user has a UserStats document
 */
const initializeUserStats = async (userId) => {
  try {
    let userStats = await UserStats.findOne({ userId });
    
    if (!userStats) {
      userStats = await UserStats.create({
        userId,
        postsCount: 0,
        followersCount: 0,
        followingCount: 0,
        totalLikesCount: 0,
        commentsCount: 0,
        engagementScore: 0,
      });
      console.log(`✅ Created UserStats for user ${userId}`);
    }
    
    return userStats;
  } catch (error) {
    console.error(`❌ Error initializing UserStats for ${userId}:`, error.message);
    throw error;
  }
};

/**
 * Increment a stat for a user (atomically)
 * Usage: await incrementStat(userId, 'postsCount', 1)
 */
const incrementStat = async (userId, statField, amount = 1) => {
  try {
    const update = {};
    update[statField] = amount;
    update.lastUpdated = Date.now();

    const userStats = await UserStats.findOneAndUpdate(
      { userId },
      { $inc: update },
      { new: true, upsert: true } // upsert ensures doc is created if missing
    );

    return userStats;
  } catch (error) {
    console.error(`❌ Error incrementing ${statField} for user ${userId}:`, error.message);
    throw error;
  }
};

/**
 * Decrement a stat for a user (atomically)
 * Usage: await decrementStat(userId, 'postsCount', 1)
 */
const decrementStat = async (userId, statField, amount = 1) => {
  try {
    const update = {};
    update[statField] = -amount;
    update.lastUpdated = Date.now();

    const userStats = await UserStats.findOneAndUpdate(
      { userId },
      { $inc: update, $max: { [statField]: 0 } }, // ensure no negative counts
      { new: true, upsert: true }
    );

    return userStats;
  } catch (error) {
    console.error(`❌ Error decrementing ${statField} for user ${userId}:`, error.message);
    throw error;
  }
};

/**
 * Set a stat to a specific value
 * Usage: await setStat(userId, 'followersCount', 42)
 */
const setStat = async (userId, statField, value) => {
  try {
    const update = {};
    update[statField] = Math.max(0, value); // no negative values
    update.lastUpdated = Date.now();

    const userStats = await UserStats.findOneAndUpdate(
      { userId },
      update,
      { new: true, upsert: true }
    );

    return userStats;
  } catch (error) {
    console.error(`❌ Error setting ${statField} for user ${userId}:`, error.message);
    throw error;
  }
};

/**
 * Get all stats for a user
 * If UserStats document doesn't exist, compute stats from database
 */
const getUserStats = async (userId) => {
  try {
    let userStats = await UserStats.findOne({ userId });
    
    if (!userStats) {
      // Calculate stats from database if UserStats doesn't exist
      const Post = require('../models/Post');
      const Follow = require('../models/Follow');
      const Like = require('../models/Like');
      
      const [postsCount, followersCount, followingCount, likesCount] = await Promise.all([
        Post.countDocuments({ user: userId }),
        Follow.countDocuments({ following: userId }),
        Follow.countDocuments({ follower: userId }),
        Like.countDocuments({ user: userId }),
      ]);
      
      // Create the UserStats document with computed values
      userStats = await UserStats.create({
        userId,
        postsCount,
        followersCount,
        followingCount,
        totalLikesCount: likesCount,
        commentsCount: 0,
        engagementScore: 0,
      });
      
      console.log(`✅ Created UserStats for user ${userId} with computed values`);
    }
    
    return userStats;
  } catch (error) {
    console.error(`❌ Error fetching UserStats for ${userId}:`, error.message);
    throw error;
  }
};

/**
 * Migrate stats from User model to UserStats model
 * Run this once as a migration after deploying the new UserStats model
 */
const migrateStatsFromUser = async () => {
  try {
    console.log('🔄 Starting stats migration from User to UserStats...');
    
    const users = await User.find().select('_id postsCount followersCount followingCount totalLikesCount');
    let migratedCount = 0;

    for (const user of users) {
      const userStats = await UserStats.findOneAndUpdate(
        { userId: user._id },
        {
          userId: user._id,
          postsCount: user.postsCount || 0,
          followersCount: user.followersCount || 0,
          followingCount: user.followingCount || 0,
          totalLikesCount: user.totalLikesCount || 0,
          commentsCount: 0, // new field, default 0
          engagementScore: 0, // new field, default 0
        },
        { upsert: true, new: true }
      );

      migratedCount++;

      if (migratedCount % 100 === 0) {
        console.log(`   ✓ Migrated ${migratedCount} users...`);
      }
    }

    console.log(`✅ Migration complete! Migrated ${migratedCount} users.`);
    return migratedCount;
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
};

module.exports = {
  initializeUserStats,
  incrementStat,
  decrementStat,
  setStat,
  getUserStats,
  migrateStatsFromUser,
};
