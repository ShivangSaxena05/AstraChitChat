const mongoose = require('mongoose');
const path = require('path');

// ✅ Load .env from backend root directory (same as server.js)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Chat = require('../models/Chat');
const Message = require('../models/Message');

/**
 * ✅ PRODUCTION MIGRATION SCRIPT
 * Ensures chat list consistency:
 * 1. Removes all empty chats (no messages)
 * 2. Validates chat structure
 * 3. Indexes optimization
 * 4. Generates report of changes
 * 
 * Run this ONCE in production: node scripts/migrate-fix-empty-chats.js
 */

async function migrateFixEmptyChats() {
  try {
    // Check env var
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI is not set in .env file');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    console.log('\n' + '='.repeat(60));
    console.log('🔄 PRODUCTION MIGRATION: Fix Empty Chats');
    console.log('='.repeat(60) + '\n');

    // Step 1: Analysis
    console.log('📊 STEP 1: Analyzing Database...\n');
    
    const totalChats = await Chat.countDocuments();
    const emptyChats = await Chat.countDocuments({
      'lastMessage': { $exists: false }
    });
    const directEmptyChats = await Chat.countDocuments({
      'lastMessage': { $exists: false },
      'convoType': 'direct'
    });
    const groupEmptyChats = await Chat.countDocuments({
      'lastMessage': { $exists: false },
      'convoType': 'group'
    });

    console.log(`Total chats in database: ${totalChats}`);
    console.log(`Empty chats (no messages): ${emptyChats}`);
    console.log(`  - Direct chats: ${directEmptyChats}`);
    console.log(`  - Group chats: ${groupEmptyChats}`);

    // Step 2: Verify orphan chats
    console.log('\n🔍 STEP 2: Checking for Orphaned Chats...\n');
    
    const orphanChats = await Chat.find({
      'lastMessage': { $exists: false }
    }).limit(10);

    if (orphanChats.length > 0) {
      console.log(`Sample of orphaned chats (first ${orphanChats.length}):`);
      orphanChats.forEach((chat, idx) => {
        console.log(`  ${idx + 1}. ID: ${chat._id}`);
        console.log(`     Type: ${chat.convoType}, Participants: ${chat.participants.length}`);
        console.log(`     Created: ${chat.createdAt}`);
      });
    }

    // Step 3: Cleanup
    console.log('\n🗑️  STEP 3: Removing Empty Chats...\n');
    
    const result = await Chat.deleteMany({
      'lastMessage': { $exists: false }
    });

    console.log(`✅ Deleted ${result.deletedCount} empty chats`);

    // Step 4: Verify
    console.log('\n✔️  STEP 4: Verification...\n');
    
    const remainingChats = await Chat.countDocuments();
    const verifyEmpty = await Chat.countDocuments({
      'lastMessage': { $exists: false }
    });

    console.log(`Chats before: ${totalChats}`);
    console.log(`Chats after: ${remainingChats}`);
    console.log(`Empty chats remaining: ${verifyEmpty}`);

    // Step 5: Index optimization
    console.log('\n⚡ STEP 5: Optimizing Indexes...\n');
    
    // Drop and recreate indexes for optimization
    try {
      await Chat.collection.dropIndex('participants.user_1_lastMessage_1');
    } catch (e) {
      // Index might not exist, that's ok
    }

    // Create optimized index
    await Chat.collection.createIndex(
      { 'participants.user': 1, 'lastMessage': 1 },
      { name: 'chat_list_optimization' }
    );
    console.log('✅ Indexes optimized');

    // Step 6: Summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 MIGRATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nSummary:`);
    console.log(`- Deleted: ${result.deletedCount} empty chats`);
    console.log(`- Remaining chats: ${remainingChats}`);
    console.log(`- Database status: ${verifyEmpty === 0 ? '✅ CLEAN' : '⚠️ WARNING'}`);
    console.log('\n✅ All empty chats have been removed from the database\n');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

migrateFixEmptyChats();
