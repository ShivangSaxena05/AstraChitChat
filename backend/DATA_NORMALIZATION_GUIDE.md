# Chat & Message Data Normalization Guide

## Overview

Your Chat and Message collections had several null/missing values due to inconsistent data entry. This guide provides two solutions:

1. **Backend Seeding Script** (`scripts/seedChatMessages.js`) - Fixes existing data in MongoDB
2. **Frontend Normalizer** (`utils/dataNormalizer.ts`) - Handles API responses safely on client

---

## 🔧 Backend Solution: Database Seeding

### What It Fixes

#### Chat Documents
- ✅ Sets `groupName` to empty string for direct chats
- ✅ Ensures `groupAvatar` is null for direct chats
- ✅ Generates `groupName` for group chats if missing
- ✅ Removes redundant `admins` array (use `participants[].role` instead)
- ✅ Sets `lastActivityTimestamp` from `updatedAt` if missing

#### Message Documents
- ✅ Sets empty `bodyText` to empty string
- ✅ Validates/fixes `msgType` enum
- ✅ Ensures `attachments` is an array
- ✅ Ensures `readBy` array exists
- ✅ Ensures `deliveredTo` array exists
- ✅ Ensures `deletedFor` array exists
- ✅ Fixes `isDeleted` boolean
- ✅ Validates/fixes `status` enum
- ✅ Converts empty string refs to null

### Installation & Usage

```bash
# 1. Ensure .env is configured in backend folder
cd backend

# 2. Run the seeding script
node scripts/seedChatMessages.js
```

Expected output:
```
═══ Starting Seeding/Fixing Process ═══
[INFO] Connecting to MongoDB...
[✓] Connected to MongoDB
═══ Fixing Chat Documents ═══
[INFO] Found 150 chat documents
[✓] Updated chat: 699dd620377555d2449b5412
...
[✓] Fixed 45/150 chat documents
═══ Fixing Message Documents ═══
[INFO] Found 2500 message documents
...
[✓] Fixed 320/2500 message documents

  Summary:
    • Chats: 150 total, 45 updated
    • Messages: 2500 total, 320 updated

  All null values have been fixed! ✓
```

---

## 💻 Frontend Solution: Data Normalizer

Use this when fetching chat/message data from the API to ensure consistency.

### Basic Usage

```typescript
import {
    normalizeChat,
    normalizeMessage,
    normalizeChats,
    normalizeMessages,
    validateChat,
    validateMessage,
} from '@/utils/dataNormalizer';

// Single chat
const apiChat = await fetchChat(chatId);
const normalizedChat = normalizeChat(apiChat);

// Single message
const apiMessage = await fetchMessage(messageId);
const normalizedMessage = normalizeMessage(apiMessage);

// Array of chats
const chats = await fetchChats();
const normalizedChats = normalizeChats(chats);

// Array of messages
const messages = await fetchMessages(chatId);
const normalizedMessages = normalizeMessages(messages);
```

### With Validation

```typescript
const { isValid, errors } = validateChat(apiChat);
if (!isValid) {
    console.error('Invalid chat data:', errors);
    return;
}

const normalizedChat = normalizeChat(apiChat);
```

### In React Components

```typescript
import { normalizeChat, validateChat } from '@/utils/dataNormalizer';

export function ChatPreview({ chatData }) {
    const { isValid, errors } = validateChat(chatData);

    if (!isValid) {
        return <div>Error loading chat</div>;
    }

    const chat = normalizeChat(chatData);

    return (
        <div>
            <h3>{chat.groupName || 'Direct Chat'}</h3>
            <p>{chat.lastMessage?.text || 'No messages yet'}</p>
            <p>Last activity: {new Date(chat.lastActivityTimestamp).toLocaleString()}</p>
        </div>
    );
}
```

### In Custom Hooks

```typescript
import { useEffect, useState } from 'react';
import { normalizeChats, validateChat } from '@/utils/dataNormalizer';

export function useChatList() {
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchChatList() {
            try {
                const response = await fetch('/api/chats');
                const data = await response.json();
                
                // Normalize and validate all chats
                const normalized = normalizeChats(data);
                const validChats = normalized.filter((chat) => {
                    const { isValid } = validateChat(chat);
                    return isValid;
                });

                setChats(validChats);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchChatList();
    }, []);

    return { chats, loading, error };
}
```

---

## 📊 Data Schema Reference

### Chat Schema (Normalized)

```typescript
interface NormalizedChat {
    _id: ObjectId;
    convoType: 'direct' | 'group';
    participants: Array<{
        user: ObjectId;
        role: 'admin' | 'moderator' | 'member';
        joinedAt: Date;
        lastReadMsgId: ObjectId | null;
    }>;
    groupName: string; // '' for direct chats
    groupAvatar: {
        public_id: string;
        secure_url: string;
        resource_type: string;
        version: number;
    } | null;
    lastMessage: {
        text: string;
        sender: ObjectId;
        msgType: string;
        createdAt: Date;
    } | null;
    lastActivityTimestamp: Date;
    createdAt: Date;
    updatedAt: Date;
    __v: number;
}
```

### Message Schema (Normalized)

```typescript
interface NormalizedMessage {
    _id: ObjectId;
    chat: ObjectId;
    sender: ObjectId;
    receiver: ObjectId | null;
    bodyText: string;
    msgType: 'text' | 'image' | 'video' | 'file' | 'audio';
    attachments: Array<{
        public_id: string;
        secure_url: string;
        resource_type: string;
        format: string;
        size: number;
        original_name: string;
    }>;
    readBy: Array<{
        user: ObjectId;
        readAt: Date;
    }>;
    deliveredTo: ObjectId[];
    isDeleted: boolean;
    deletedFor: ObjectId[];
    replyTo: ObjectId | null;
    replyPreview: { bodyText: string; msgType: string; sender: ObjectId } | null;
    quotedMsgId: ObjectId | null;
    quotedMessage: { _id: ObjectId; bodyText: string; msgType: string; sender: ObjectId } | null;
    status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
    editedAt: Date | null;
    unsentAt: Date | null;
    unsentBy: ObjectId | null;
    encryptedBody: string | null;
    nonce: string | null;
    createdAt: Date;
    updatedAt: Date;
    __v: number;
}
```

---

## ⚠️ Important Notes

### When to Use Backend Seeding

1. **First time cleanup** - Run once to fix all existing null values
2. **Maintenance** - Run periodically after bulk data operations
3. **Data migration** - Run when updating schema structure

### When to Use Frontend Normalizer

1. **Always** - Use on every API response to ensure consistency
2. **Defensive programming** - Handle unexpected data gracefully
3. **Type safety** - Ensures TypeScript compliance
4. **Edge cases** - Handles API edge cases and malformed data

### Best Practice

```typescript
// ✅ GOOD: Always normalize API responses
const response = await fetchMessages(chatId);
const messages = normalizeMessages(response);

// ❌ BAD: Using raw API data
const messages = response; // May have null values
const text = messages[0].bodyText; // Potential errors
```

---

## 🔍 Troubleshooting

### Script won't run

```bash
# Check Node.js is installed
node --version

# Check MongoDB connection
# Verify MONGO_URI in .env

# Make sure models are importable
node -e "require('./models/Chat')"
```

### Still seeing null values in frontend

1. Ensure you're using the normalizer:
   ```typescript
   const normalized = normalizeChat(apiResponse);
   ```

2. Check API endpoint returns data correctly:
   ```typescript
   const response = await fetch('/api/chats/123');
   console.log(response); // Check raw data
   ```

3. Run backend seeding script to fix source data:
   ```bash
   node scripts/seedChatMessages.js
   ```

### Validation errors

```typescript
const { isValid, errors } = validateChat(chat);
if (!isValid) {
    errors.forEach(err => console.error(err));
    // Handle error appropriately
}
```

---

## 📝 Summary

| Issue | Backend Solution | Frontend Solution |
|-------|------------------|-------------------|
| Null values in DB | ✅ `seedChatMessages.js` | ✅ `normalizeChat/Message` |
| Type consistency | ✅ Fixes enums & arrays | ✅ Ensures proper types |
| Missing defaults | ✅ Sets sensible defaults | ✅ Provides fallbacks |
| Data validation | ❌ | ✅ `validateChat/Message` |
| API safety | ❌ | ✅ Defensive normalization |

**Recommended approach**: Run backend script once, then use frontend normalizer on all API responses.
