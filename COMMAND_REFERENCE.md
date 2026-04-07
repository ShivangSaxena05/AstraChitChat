# 🎯 Command Reference Card

## One-Liner Solutions

### Just want to fix everything? (5 minutes)

```bash
cd c:\AstraChitChat\backend && npm run seed:messages && npm run verify:messages
```

✅ **Done!** All data fixed and verified.

---

## Step-by-Step Commands

### Step 1: Navigate to Backend
```bash
cd c:\AstraChitChat\backend
```

### Step 2: Fix All Null Values
```bash
npm run seed:messages
```

Expected output:
```
═══ Starting Seeding/Fixing Process ═══
[INFO] Connecting to MongoDB...
[✓] Connected to MongoDB
═══ Fixing Chat Documents ═══
[INFO] Found X chat documents
[✓] Updated chat: 699dd620377555d2449b5412
...
[✓] Fixed Y/X chat documents
═══ Fixing Message Documents ═══
[INFO] Found Z message documents
...
[✓] Fixed W/Z message documents

  All null values have been fixed! ✓
```

### Step 3: Verify Everything Worked
```bash
npm run verify:messages
```

Expected output:
```
═══ Verifying Chat Documents ═══
[✓] All N chat documents are valid! ✨

═══ Verifying Message Documents ═══
[✓] All M message documents are valid! ✨

  Summary:
    • Chats: N total, 0 issues
    • Messages: M total, 0 issues

  All data is clean and valid! ✨
```

---

## Available NPM Scripts

```bash
# Development server
npm start
npm run dev        # with nodemon (auto-reload)

# Data Management
npm run seed:messages     # ← USE THIS to fix nulls
npm run verify:messages   # ← USE THIS to check
npm run seed:all         # Both: seed then verify

# Old/Other scripts
npm run fix:chat:quick
npm run fix:chat:full
npm run fix:chat
npm run diagnose
```

---

## Alternative Commands (Direct Node)

If npm scripts don't work:

```bash
# Fix data
node scripts/seedChatMessages.js

# Verify fixes
node scripts/verifyChatMessages.js
```

---

## Frontend Integration Commands

### Install dependencies (if needed)
```bash
cd c:\AstraChitChat\frontend
npm install
```

### Import in your components
```typescript
// At top of component file
import { normalizeChat, normalizeMessage } from '@/utils/dataNormalizer';
import { Chat, Message } from '@/types/chat';

// Use in component
const chat: Chat = normalizeChat(apiResponse);
const message: Message = normalizeMessage(apiResponse);
```

---

## Troubleshooting Commands

### Check if MongoDB is running
```bash
# On Windows with MongoDB installed
# MongoDB should be running as a service
# Or check connection in code:
node -e "require('mongoose').connect(process.env.MONGO_URI, ()=>console.log('Connected!'))"
```

### Check if .env is configured
```bash
# In backend folder
echo %MONGO_URI%  # Should show your MongoDB connection string
```

### Run with detailed logging
```bash
# Add DEBUG environment variable
set DEBUG=*
npm run seed:messages
```

### Check what will be fixed (dry run simulation)
```bash
# Modify seedChatMessages.js to use console.log instead of actual updates
# Or just run script - it shows what it fixed in output
```

---

## Interactive Command Guide

### I want to understand what will be fixed first
```bash
# Read the guide
cat CHAT_NULL_VALUES_FIX.md

# Then run it
npm run seed:messages
```

### I want to backup first (MongoDB)
```bash
# Using mongodump (if installed)
mongodump --uri="your-mongodb-uri" --out=./backup

# Then run seeding
npm run seed:messages
```

### I want to see detailed output
```bash
# Run script directly (more verbose)
node scripts/seedChatMessages.js

# Then verify
node scripts/verifyChatMessages.js
```

### I want to test locally first
```bash
# Use a test MongoDB instance
set MONGO_URI=mongodb://localhost:27017/test
npm run seed:messages
```

---

## Frontend Testing Commands

### Test normalizer in React
```typescript
import { normalizeChat, validateChat } from '@/utils/dataNormalizer';

// In a component or hook:
const testData = {
  _id: '123',
  convoType: 'direct',
  participants: [{ user: '456', role: 'member' }],
  // Other fields...
};

const normalized = normalizeChat(testData);
const { isValid, errors } = validateChat(normalized);

console.log('Valid:', isValid);
console.log('Errors:', errors);
```

### Run with console logs
```typescript
const chat = normalizeChat(apiResponse);
console.log('Normalized chat:', chat);
console.log('Safe to use!');
```

---

## Production Deployment Commands

### Before deployment
```bash
# In backend
npm run seed:messages       # Fix any existing data
npm run verify:messages     # Confirm all is well

# Deploy backend
git push origin main        # Or your deployment process

# Deploy frontend
# Frontend uses normalizer for safety
```

### After deployment (monitoring)
```bash
# SSH into server and run
npm run verify:messages

# If any issues found, run again
npm run seed:messages
npm run verify:messages
```

---

## Quick Reference Table

| Task | Command | Time |
|------|---------|------|
| Fix data | `npm run seed:messages` | 5s-30s |
| Verify | `npm run verify:messages` | 5s-30s |
| Fix + Verify | `npm run seed:all` | 10s-60s |
| Check script | `node scripts/seedChatMessages.js` | 5s-30s |
| Run dev server | `npm run dev` | - |
| Run production | `npm start` | - |

---

## Multi-Environment

### Development
```bash
set MONGO_URI=mongodb://localhost:27017/chitchat-dev
set NODE_ENV=development
npm run seed:messages
```

### Staging
```bash
set MONGO_URI=mongodb://staging-server:27017/chitchat-staging
set NODE_ENV=staging
npm run seed:messages
```

### Production
```bash
set MONGO_URI=mongodb://prod-server:27017/chitchat-prod
set NODE_ENV=production
npm run seed:messages
```

---

## Batch Operations (Advanced)

### Fix only chats
```bash
# Modify script to comment out fixMessageDocuments()
# Or create a custom version
node scripts/seedChatMessages.js
```

### Fix only messages
```bash
# Modify script to comment out fixChatDocuments()
# Or create a custom version
node scripts/seedChatMessages.js
```

### Export fixed data
```bash
# After seeding, export with mongodump
mongodump --uri="mongodb-uri" --out=./backup-fixed
```

---

## Command Cheat Sheet

```bash
# Most important commands:

# 1. Navigate to backend
cd c:\AstraChitChat\backend

# 2. Install dependencies (first time only)
npm install

# 3. FIX YOUR DATA (main task)
npm run seed:messages

# 4. VERIFY IT WORKED
npm run verify:messages

# 5. Import in frontend (code change)
import { normalizeChat } from '@/utils/dataNormalizer';

# 6. Use in component
const chat = normalizeChat(apiResponse);

# That's it! 🎉
```

---

## Visual Step-by-Step

```
START HERE
    ↓
┌─────────────────────────────────┐
│ cd c:\AstraChitChat\backend     │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ npm run seed:messages           │ ← WAIT FOR COMPLETION
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ npm run verify:messages         │ ← SHOULD SAY "ALL VALID"
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ Go to frontend code             │
│ Add import normalizeChat        │
│ Add: const chat = ...           │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ TEST IN DEVELOPMENT             │
│ npm run dev (frontend)          │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│ ✅ DONE!                        │
│ Your data is now safe!          │
└─────────────────────────────────┘
```

---

## Emergency Commands

### Something broke - Roll back (MongoDB backup)
```bash
# Restore from backup
mongorestore --uri="your-uri" ./backup
```

### Need to run again
```bash
npm run seed:messages
npm run verify:messages
```

### Check what changed
```bash
# Before: Check current state
npm run verify:messages > before.txt

# Run fix
npm run seed:messages

# After: Check new state
npm run verify:messages > after.txt

# Compare
diff before.txt after.txt
```

---

## Notes for Copy-Paste Ready Commands

```bash
# ★ COPY & PASTE READY - Windows Command Prompt ★

# Navigation
cd /d c:\AstraChitChat\backend

# Fix everything (main command)
npm run seed:messages

# Verify it worked
npm run verify:messages

# Both together
npm run seed:messages && npm run verify:messages

# Check MongoDB connection
node -e "require('mongoose').connect(process.env.MONGO_URI, ()=>console.log('✓ Connected'))"

# View .env
type .env

# List scripts
npm run
```

---

## Summary

**Main Command You Need:**
```bash
npm run seed:messages
```

**Then Verify:**
```bash
npm run verify:messages
```

**Then in Frontend:**
```typescript
import { normalizeChat } from '@/utils/dataNormalizer';
const chat = normalizeChat(apiResponse);
```

**That's literally all you need!** 🚀
