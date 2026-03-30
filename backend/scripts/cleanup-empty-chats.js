const mongoose = require('mongoose');
const path = require('path');

// ✅ Load .env from backend root directory (same as server.js)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Chat = require('../models/Chat');

/**
 * ✅ PRODUCTION CLEANUP SCRIPT
 * Removes orphaned/empty chats that were created but never had messages sent
 * Run this periodically or once to clean up database
 * 
 * Usage: node scripts/cleanup-empty-chats.js
 */

async function cleanupEmptyChats() {
  try {
    // Check env var
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI is not set in .env file');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find all chats without messages
    const emptyChats = await Chat.find({
      'lastMessage': { $exists: false }
    });

    console.log(`\n📊 Found ${emptyChats.length} empty chats`);

    if (emptyChats.length === 0) {
      console.log('✅ No empty chats to clean up');
      await mongoose.disconnect();
      return;
    }

    // Show sample of empty chats
    console.log('\n📋 Sample of empty chats (first 5):');
    emptyChats.slice(0, 5).forEach((chat, idx) => {
      console.log(`  ${idx + 1}. Chat ID: ${chat._id}`);
      console.log(`     Participants: ${chat.participants.map(p => p.user).join(', ')}`);
      console.log(`     Created: ${chat.createdAt}`);
      console.log(`     Type: ${chat.convoType}`);
    });

    // Delete empty chats
    const result = await Chat.deleteMany({
      'lastMessage': { $exists: false }
    });

    console.log(`\n✅ Deleted ${result.deletedCount} empty chats`);
    console.log(`📈 Database cleaned up successfully`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    process.exit(1);
  }
}

cleanupEmptyChats();
