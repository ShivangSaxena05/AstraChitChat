// backend/scripts/migrateParticipantsFormat.js
// Migrate all chats from old format (raw ObjectId[]) to new format (object with user, role, joinedAt, lastReadMsgId)
// Run: node backend/scripts/migrateParticipantsFormat.js

const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import models
const Chat = require('../models/Chat');

async function migrateParticipantsFormat() {
  try {
    // Connect to MongoDB
    if (!mongoose.connection.readyState) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/astratchitchat');
    }
    
    console.log('\n🔄 Starting participants format migration...');
    console.log('📊 Converting old format (ObjectId[]) → new format (object[])\n');
    
    // Find all chats
    const allChats = await Chat.find({});
    console.log(`Found ${allChats.length} total chats\n`);
    
    let converted = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const chat of allChats) {
      try {
        if (!Array.isArray(chat.participants) || chat.participants.length === 0) {
          skipped++;
          continue;
        }
        
        // Check if any participant is in old format (raw ObjectId or string)
        const hasOldFormat = chat.participants.some(p => {
          // Old format: just an ObjectId/string
          if (typeof p === 'string') return true;
          if (mongoose.Types.ObjectId.isValid(p)) return true;
          // New format: object with user property
          if (p && typeof p === 'object' && p.user !== undefined) return false;
          // Unknown format
          return true;
        });
        
        if (!hasOldFormat) {
          skipped++;
          continue;
        }
        
        // Convert participants to new format
        const convertedParticipants = chat.participants.map(p => {
          // Already in new format
          if (p && typeof p === 'object' && p.user !== undefined) {
            return {
              user: p.user,
              role: p.role || 'member',
              joinedAt: p.joinedAt || chat.createdAt || new Date(),
              lastReadMsgId: p.lastReadMsgId || null
            };
          }
          
          // Old format: convert to new
          const userId = mongoose.Types.ObjectId.isValid(p) ? p : new mongoose.Types.ObjectId(p);
          return {
            user: userId,
            role: 'member',
            joinedAt: chat.createdAt || new Date(),
            lastReadMsgId: null
          };
        });
        
        // Update chat
        await Chat.updateOne(
          { _id: chat._id },
          { $set: { participants: convertedParticipants } }
        );
        
        converted++;
        const chatType = chat.convoType === 'direct' ? 'Direct' : `Group (${chat.groupName || 'Unnamed'})`;
        console.log(`✅ [${converted}] ${chatType} - ${convertedParticipants.length} participants converted`);
        
      } catch (error) {
        failed++;
        console.error(`❌ Failed to migrate chat ${chat._id}:`, error.message);
      }
    }
    
    console.log(`\n📈 Migration Summary:`);
    console.log(`   ✅ Converted: ${converted}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📊 Total: ${allChats.length}\n`);
    
    if (failed === 0 && converted > 0) {
      console.log('✅ Migration completed successfully!');
      console.log('📝 All chats now use the new participants format\n');
    } else if (failed === 0) {
      console.log('✅ No conversions needed - all chats already in new format!\n');
    } else {
      console.log('⚠️ Migration completed with errors. Please check logs above.\n');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateParticipantsFormat();
