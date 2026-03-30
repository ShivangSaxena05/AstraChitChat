const mongoose = require('mongoose');
const path = require('path');

// ✅ Load .env from backend root directory
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Chat = require('../models/Chat');

async function migrateFixEmptyChats() {
  let connected = false;
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI is not set in .env file');
    }

    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 10000,
    });
    connected = true;
    console.log('✅ Connected to MongoDB\n');
    console.log('='.repeat(60));
    console.log('🔄 PRODUCTION MIGRATION: Fix Empty Chats');
    console.log('='.repeat(60) + '\n');

    // Step 1: Analysis
    console.log('📊 STEP 1: Analyzing Database...\n');
    
    const totalChats = await Chat.countDocuments();
    const emptyChats = await Chat.countDocuments({
      'lastMessage': { $exists: false }
    });

    console.log(`Total chats in database: ${totalChats}`);
    console.log(`Empty chats (no messages): ${emptyChats}`);
    console.log(`Chats with messages: ${totalChats - emptyChats}`);

    if (emptyChats === 0) {
      console.log('\n✅ No empty chats found - database is clean!');
      await mongoose.disconnect();
      return;
    }

    // Step 2: Show samples
    console.log('\n🔍 STEP 2: Sample of Empty Chats...\n');
    
    const samples = await Chat.find({
      'lastMessage': { $exists: false }
    }).limit(3);

    samples.forEach((chat, idx) => {
      console.log(`  ${idx + 1}. Chat ID: ${chat._id}`);
      console.log(`     Type: ${chat.convoType}, Participants: ${chat.participants.length}`);
      console.log(`     Created: ${new Date(chat.createdAt).toLocaleString()}`);
    });

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

    console.log(`Chats before cleanup: ${totalChats}`);
    console.log(`Chats after cleanup: ${remainingChats}`);
    console.log(`Empty chats remaining: ${verifyEmpty}`);

    // Step 5: Summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 MIGRATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`\nSummary:`);
    console.log(`- Deleted: ${result.deletedCount} empty chats`);
    console.log(`- Remaining chats: ${remainingChats}`);
    console.log(`- Database status: ${verifyEmpty === 0 ? '✅ CLEAN' : '⚠️  WARNING'}`);
    console.log('\n✅ Migration finished successfully!\n');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (connected) {
      try {
        await mongoose.disconnect();
      } catch (e) {
        // ignore
      }
    }
    process.exit(1);
  }
}

migrateFixEmptyChats();
