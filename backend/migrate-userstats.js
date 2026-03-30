#!/usr/bin/env node

/**
 * UserStats Migration Script
 * 
 * This script migrates all user statistics from the User model to the UserStats collection.
 * 
 * Usage:
 *   node migrate-userstats.js
 * 
 * Or from package.json:
 *   npm run migrate:userstats
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const mongoose = require('mongoose');
const User = require('./models/User');
const UserStats = require('./models/UserStats');
const { migrateStatsFromUser } = require('./services/userStatsService');

async function main() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');

    // Check if migration has already run
    const userStatsCount = await UserStats.countDocuments();
    const userCount = await User.countDocuments();

    console.log(`📊 Current Status:`);
    console.log(`   Users in database: ${userCount}`);
    console.log(`   UserStats documents: ${userStatsCount}\n`);

    if (userStatsCount > 0 && userStatsCount === userCount) {
      console.log('✅ Migration appears to be complete already.');
      const response = await askQuestion('Run migration again anyway? (y/n): ');
      if (response.toLowerCase() !== 'y') {
        console.log('Aborting. No changes made.\n');
        await mongoose.disconnect();
        process.exit(0);
      }
    }

    // Run the migration
    console.log('🚀 Starting migration...\n');
    const migratedCount = await migrateStatsFromUser();

    // Verify results
    console.log('\n📊 Migration Results:');
    const newUserStatsCount = await UserStats.countDocuments();
    console.log(`   UserStats documents created/updated: ${newUserStatsCount}`);
    console.log(`   Total users: ${userCount}`);
    
    if (newUserStatsCount === userCount) {
      console.log('\n✅ Migration successful! All users have UserStats.\n');
    } else {
      console.warn(`\n⚠️  Warning: ${userCount - newUserStatsCount} users are missing UserStats\n`);
    }

    // Sample verification
    console.log('📋 Sample Verification (10 random users):\n');
    const sampleUsers = await User.find().limit(10);
    
    for (const user of sampleUsers) {
      const stats = await UserStats.findOne({ userId: user._id });
      if (stats) {
        console.log(`   User: ${user.username}`);
        console.log(`     Posts: ${stats.postsCount}`);
        console.log(`     Followers: ${stats.followersCount}`);
        console.log(`     Following: ${stats.followingCount}`);
        console.log('');
      } else {
        console.warn(`   ⚠️  User ${user.username} has NO UserStats document\n`);
      }
    }

    console.log('✅ Migration complete!\n');
    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Helper function to ask user a question
function askQuestion(question) {
  return new Promise((resolve) => {
    if (process.argv.includes('--auto-yes')) {
      console.log(question + 'y (auto)');
      resolve('y');
      return;
    }
    
    process.stdout.write(question);
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim());
      process.stdin.pause();
    });
  });
}

// Run the migration
main();
