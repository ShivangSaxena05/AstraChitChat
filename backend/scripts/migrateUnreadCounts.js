// backend/scripts/migrateUnreadCounts.js
// One-time migration script to initialize unreadCounts for all existing chats
// Run: node backend/scripts/migrateUnreadCounts.js

const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import models
const Chat = require('../models/Chat');
const Message = require('../models/Message');

async function migrateUnreadCounts() {
  try {
    // Connect to MongoDB
    if (!mongoose.connection.readyState) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/astratchitchat');
    }
    
    console.log('\n🔄 Starting unread count migration...');
    console.log('📊 This will initialize unreadCounts for all existing chats\n');
    
    // Find all chats without unreadCounts
    const chatsWithoutCounts = await Chat.find({ 
      $or: [
        { unreadCounts: { $exists: false } },
        { unreadCounts: { $size: 0 } }
      ]
    });
    
    console.log(`Found ${chatsWithoutCounts.length} chats to migrate\n`);
    
    if (chatsWithoutCounts.length === 0) {
      console.log('✅ All chats already have unreadCounts initialized!');
      process.exit(0);
    }
    
    let processed = 0;
    let failed = 0;
    
    for (const chat of chatsWithoutCounts) {
      try {
        // Initialize unreadCounts for each participant
        const unreadCounts = [];
        
        for (const participant of chat.participants) {
          const userId = participant.user;
          
          // Calculate unread count for this user
          // Unread = messages from others that this user hasn't read yet
          const count = await Message.countDocuments({
            chat: chat._id,
            sender: { $ne: userId },
            'readBy.user': { $ne: userId }
          });
          
          unreadCounts.push({
            user: userId,
            count: count
          });
        }
        
        // Update chat with calculated unreadCounts
        await Chat.updateOne(
          { _id: chat._id },
          { 
            $set: { 
              unreadCounts: unreadCounts 
            } 
          }
        );
        
        processed++;
        const chatType = chat.convoType === 'direct' ? 'Direct' : `Group (${chat.groupName || 'Unnamed'})`;
        console.log(`✅ [${processed}/${chatsWithoutCounts.length}] ${chatType} - ${unreadCounts.length} participants`);
        
      } catch (error) {
        failed++;
        console.error(`❌ Failed to migrate chat ${chat._id}:`, error.message);
      }
    }
    
    console.log(`\n📈 Migration Summary:`);
    console.log(`   ✅ Processed: ${processed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📊 Success rate: ${((processed / chatsWithoutCounts.length) * 100).toFixed(1)}%\n`);
    
    if (failed === 0) {
      console.log('✅ Migration completed successfully!');
    } else {
      console.log('⚠️ Migration completed with errors. Please check logs above.');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateUnreadCounts();
