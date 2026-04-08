# Unread Count Migration Guide (Bug #6)

## Overview
This guide explains how to migrate existing chats to the new `unreadCounts` persistence system.

## Migration Strategy

### Option 1: Automatic Fallback (No Database Migration Needed)
The application automatically handles chats without `unreadCounts`:

```javascript
// In getChats() function - automatic fallback
if (chat.unreadCounts && Array.isArray(chat.unreadCounts)) {
  // Use stored unreadCount
  unreadCount = chat.unreadCounts.find(uc => uc.user.equals(userId))?.count ?? 0;
} else {
  // Fallback: Calculate from Message.readBy array
  unreadCount = await Message.countDocuments({
    chat: chat._id,
    sender: { $ne: userId },
    'readBy.user': { $ne: userId }
  });
}
```

**Advantages:**
- No database downtime needed
- Zero-migration approach
- Gradual transition as chats receive new messages
- Backwards compatible with old data

**Disadvantages:**
- Fallback queries are slower for chats without `unreadCounts`
- Performance impact on large chat lists

### Option 2: One-Time Bulk Migration (Recommended for Performance)

Run this script in production to initialize `unreadCounts` for all existing chats:

```javascript
// backend/scripts/migrateUnreadCounts.js
const mongoose = require('mongoose');
const Chat = require('../models/Chat');
const Message = require('../models/Message');

async function migrateUnreadCounts() {
  try {
    console.log('🔄 Starting unread count migration...');
    
    const chats = await Chat.find({ unreadCounts: { $exists: false } });
    console.log(`Found ${chats.length} chats to migrate`);
    
    for (const chat of chats) {
      // Initialize unreadCounts for each participant
      const unreadCounts = [];
      
      for (const participant of chat.participants) {
        const userId = participant.user;
        
        // Calculate unread count for this user
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
        { $set: { unreadCounts } }
      );
      
      console.log(`✅ Migrated chat ${chat._id} with ${unreadCounts.length} participants`);
    }
    
    console.log('✅ Migration complete!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run: node backend/scripts/migrateUnreadCounts.js
migrateUnreadCounts();
```

**How to Run:**
```bash
cd backend
node scripts/migrateUnreadCounts.js
```

## What Changed

### Model Changes (Chat.js)
```javascript
// ADDED
unreadCounts: [{
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  count: { type: Number, default: 0, min: 0 }
}]
```

### Initialization Points
New chats now initialize `unreadCounts` at creation:
- `createChat()` - Direct messages
- `createGroupChat()` - Group chats
- `sendMessage()` - When creating chat inline

### Update Points
`unreadCounts` is updated in these scenarios:
- **New Message**: Incremented for all participants except sender (via `updateChatOnNewMessage`)
- **Mark as Read**: Reset to 0 for current user (via `markAllMessagesAsRead`)
- **Add Member**: New member gets count of 0 (via `addGroupMember`)
- **Remove Member**: Entry removed (via `removeGroupMember`)
- **Leave Group**: Entry removed (via `leaveGroup`)

### Query Changes
The `getChats()` endpoint now:
1. Tries to use stored `unreadCounts`
2. Falls back to calculating from `Message.readBy` if not stored
3. Returns accurate unread counts either way

## Testing Checklist

- [ ] Create a new direct chat and verify `unreadCounts` initialized with [0, 0]
- [ ] Create a new group chat and verify `unreadCounts` initialized for all participants
- [ ] Send a message and verify sender's count doesn't increase, others increase by 1
- [ ] Mark all messages as read and verify unreadCount resets to 0
- [ ] Add a member to a group and verify they get count of 0
- [ ] Remove a member and verify their unreadCount entry is removed
- [ ] Leave a group and verify your unreadCount entry is removed
- [ ] Restart app and verify unread counts persist correctly
- [ ] Check that old chats (without `unreadCounts`) still work with fallback calculation

## Performance Notes

### Without Migration (Fallback Mode)
- Each `getChats()` call triggers fallback query for old chats
- Query: `Message.countDocuments()` for each chat
- Slower response time for chats without `unreadCounts`

### With Migration (Optimized)
- All chats have `unreadCounts` initialized
- `getChats()` just reads from Chat document
- Faster response time, better UX

## Rollback

If issues occur, you can revert to fallback mode by not running the migration script. The application will automatically use the fallback calculation for any chats without `unreadCounts`.

## Notes

- The fallback calculation is safe and accurate; it just queries `Message.readBy` array
- No data loss occurs during migration
- Migration is idempotent - safe to run multiple times
- The migration preserves all existing read states from `Message.readBy`
