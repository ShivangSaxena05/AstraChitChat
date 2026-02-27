# TODO: Merge changes from AstraChitChat-master to AstraChitChat

## Task: Merge recent changes from server.js and detail.tsx

## Steps:

### Step 1: Merge server.js changes
- [ ] Add detailed FIX EXPLANATION comments (from master)
- [ ] Add more sophisticated 'read messages' handler with JWT verification
- [ ] Keep current performance optimizations (bufferCommands, maxPoolSize, perMessageDeflate, production detection)

### Step 2: Merge detail.tsx changes
- [ ] Add refs for currentUserIdRef, otherUserIdRef, chatIdRef
- [ ] Add inputRef for TextInput
- [ ] Add autoFocus={true} and blurOnSubmit={false} to TextInput
- [ ] Update handleMessagesRead with refs to avoid stale closures
- [ ] Add updates to local message read status in markAllAsRead

