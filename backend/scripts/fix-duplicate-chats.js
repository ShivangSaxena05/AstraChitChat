#!/usr/bin/env node

/**
 * Fix Duplicate Chats Script
 * 
 * This script:
 * 1. Finds and removes duplicate direct chats between the same two users
 * 2. Keeps the chat with the most recent lastActivityTimestamp
 * 3. Migrates all messages from duplicate chats to the main chat
 * 
 * Usage:
 *   npm run fix:chats              (dry-run)
 *   npm run fix:chats:apply        (apply changes)
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Chat = require('../models/Chat');
const Message = require('../models/Message');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || args.length === 0;

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
  try {
    // Connect to MongoDB
    const dbUri = process.env.MONGO_URI || 'mongodb://localhost:27017/test';
    
    // Set connection timeout
    await mongoose.connect(dbUri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 10000,
    });
    
    log('================================================================================', 'cyan');
    log('  🔧 Fix Duplicate Chats Script', 'cyan');
    log('================================================================================', 'cyan');
    
    log(`✓ Connected to MongoDB: ${mongoose.connection.host}`);
    log(`✓ Database: ${mongoose.connection.name}\n`);

    // Find all direct chats
    const allChats = await Chat.find({ convoType: 'direct' });
    log(`→ Found ${allChats.length} direct chats\n`);

    // Group chats by participant pairs
    const chatGroups = new Map();
    allChats.forEach(chat => {
      if (chat.participants.length !== 2) return;
      
      // Create a unique key from sorted user IDs
      const userIds = chat.participants
        .map(p => p.user.toString())
        .sort()
        .join('|');
      
      if (!chatGroups.has(userIds)) {
        chatGroups.set(userIds, []);
      }
      chatGroups.get(userIds).push(chat);
    });

    let duplicateCount = 0;
    let messagesAffected = 0;
    const chatsToDelete = [];

    // Process each group
    for (const [userPair, chats] of chatGroups) {
      if (chats.length > 1) {
        duplicateCount++;
        
        // Sort by lastActivityTimestamp, keep the most recent one
        chats.sort((a, b) => {
          const aTime = a.lastActivityTimestamp ? new Date(a.lastActivityTimestamp).getTime() : 0;
          const bTime = b.lastActivityTimestamp ? new Date(b.lastActivityTimestamp).getTime() : 0;
          return bTime - aTime;
        });

        const mainChat = chats[0];
        const duplicateChats = chats.slice(1);

        log(`\n🔗 User pair: ${userPair}`, 'yellow');
        log(`  Main chat: ${mainChat._id} (${new Date(mainChat.lastActivityTimestamp).toLocaleString()})`);
        
        for (const dupChat of duplicateChats) {
          log(`  Duplicate: ${dupChat._id} (${new Date(dupChat.lastActivityTimestamp).toLocaleString()})`);
          
          // Count messages in duplicate chat
          const msgCount = await Message.countDocuments({ chat: dupChat._id });
          messagesAffected += msgCount;
          
          chatsToDelete.push({
            duplicateChatId: dupChat._id,
            mainChatId: mainChat._id,
            messageCount: msgCount
          });
        }
      }
    }

    if (chatsToDelete.length === 0) {
      log('\n✓ No duplicate chats found!', 'green');
      await mongoose.connection.close();
      return;
    }

    log(`\n→ Summary`, 'cyan');
    log(`Total duplicate groups found: ${duplicateCount}`);
    log(`Total chats to delete: ${chatsToDelete.length}`);
    log(`Total messages to migrate: ${messagesAffected}`);

    if (!isDryRun) {
      log(`\n→ Applying fixes...`, 'cyan');
      
      for (const {duplicateChatId, mainChatId, messageCount} of chatsToDelete) {
        // Migrate messages
        if (messageCount > 0) {
          await Message.updateMany(
            { chat: duplicateChatId },
            { $set: { chat: mainChatId } }
          );
          log(`  ✓ Migrated ${messageCount} messages from ${duplicateChatId} to ${mainChatId}`);
        }
        
        // Delete duplicate chat
        await Chat.deleteOne({ _id: duplicateChatId });
      }
      
      log(`\n✓ All duplicates fixed!`, 'green');
    } else {
      log(`\n⚠  DRY RUN MODE - No changes were made`, 'yellow');
      log(`Run with --auto-yes flag to apply changes`, 'yellow');
    }

    await mongoose.connection.close();
  } catch (error) {
    log(`\n✗ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();
