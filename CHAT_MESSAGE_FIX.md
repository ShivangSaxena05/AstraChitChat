# Chat Message History Fix

## Problem Found
**Old messages were not loading when scrolling up in the chat screen.** This was caused by a mismatch between the frontend and backend pagination implementations.

### Issues Identified:

1. **Frontend Expected**: Cursor-based pagination with `beforeMessageId` parameter
   - Frontend sends: `GET /chats/{chatId}/messages?limit=30&beforeMessageId=messageId`
   - Frontend expects to load older messages when scrolling up

2. **Backend Provided**: Offset-based pagination with `page` parameter
   - Backend only accepted: `?page=1` 
   - Backend ignored `limit` and `beforeMessageId` parameters
   - Backend always returned with fixed limit of 50

3. **Response Format Mismatch**: 
   - Frontend expected: `{ messages: [], hasMore: boolean }`
   - Backend returned: `[]` (just the messages array)

## Changes Made

### Backend (`chatController.js` - `getChatMessages` function):

✅ **Implemented Cursor-Based Pagination**
- Now accepts `limit` parameter (default 50)
- Now accepts `beforeMessageId` parameter for cursor-based pagination
- When `beforeMessageId` is provided, fetches messages created BEFORE that message's timestamp

✅ **Fixed Message Order**
- Messages are now fetched in descending order (`createdAt: -1`) then reversed
- This ensures proper chronological display when loading older messages

✅ **Added `hasMore` Response**
- Response now includes: `{ messages: [], hasMore: boolean }`
- `hasMore` is `true` if the number of returned messages equals the limit (indicating more exist)

**Before:**
```javascript
const messages = await Message.find({ chat: chatId })
  .sort({ createdAt: 1 })
  .skip((page - 1) * limit)
  .limit(50)
  .lean();
res.json(messages);
```

**After:**
```javascript
let query = { chat: chatId };
if (beforeMessageId) {
  const beforeMessage = await Message.findById(beforeMessageId);
  if (beforeMessage) {
    query.createdAt = { $lt: beforeMessage.createdAt };
  }
}

const messages = await Message.find(query)
  .sort({ createdAt: -1 })
  .limit(limit)
  .lean();
messages.reverse();

res.json({
  messages: messages,
  hasMore: messages.length === limit
});
```

### Frontend (`chat/detail.tsx` - `fetchMessages` function):

✅ **Fixed `oldestMessageId` Tracking**
- Now correctly identifies the oldest message in the returned batch
- Uses the first message in the processed array (`processedMessages[0]._id`)
- This ensures subsequent "load more" requests fetch messages BEFORE this one

**Before:**
```typescript
const newOldestId = data.oldestMessageId || 
  (processedMessages.length > 0 
    ? processedMessages[processedMessages.length - 1]._id 
    : null);
```

**After:**
```typescript
const newOldestId = processedMessages.length > 0
  ? processedMessages[0]._id  // First message is oldest
  : oldestMessageId;  // Keep previous if no new messages
```

## How It Now Works

1. **Initial Load**: 
   - App fetches first 30 messages: `GET /chats/{chatId}/messages?limit=30`
   - Backend returns 30 newest messages
   - Frontend sets `oldestMessageId` to the oldest of these 30

2. **Scroll Up to Load More**:
   - User scrolls to top of chat
   - App fetches older messages: `GET /chats/{chatId}/messages?limit=30&beforeMessageId={oldestMessageId}`
   - Backend finds messages created BEFORE that ID's timestamp
   - Returns the next batch of 30 older messages
   - Frontend updates `oldestMessageId` to the new oldest message

3. **Cursor Continuation**:
   - Process repeats until `hasMore: false`
   - Full chat history is accessible by scrolling up

## Testing

To verify the fix works:
1. Open a chat with message history
2. Scroll to the top (oldest messages)
3. Scroll up further - you should see older messages load
4. Continue scrolling to load full history
5. Compare with the database to ensure all messages are visible

## Files Modified
- `backend/controllers/chatController.js` - `getChatMessages()` function
- `frontend/app/chat/detail.tsx` - `fetchMessages()` and `oldestMessageId` logic
