# TODO - Messaging Bug Fixes

## Phase 1: Critical Bugs (Frontend)

### Bug 1: Chat List Not Updating Properly
- [x] File: frontend/app/chat/index.tsx
- [ ] Fix socket handler to properly update chat list

### Bug 2: Unread Count Not Updating
- [x] File: frontend/app/chat/index.tsx  
- [ ] Add real-time unread count increment on new message

### Bug 3: No Message Send Failure Handling
- [x] File: frontend/app/chat/detail.tsx
- [ ] Add optimistic updates and rollback on failure

### Bug 4: Inconsistent Message Field Names
- [x] Files: backend/models/Message.js, frontend/app/chat/detail.tsx
- [ ] Normalize bodyText vs content field usage

### Bug 5: Chat Re-fetch on New Conversation
- [x] File: frontend/app/chat/index.tsx
- [ ] Optimize to add new chat to list instead of full refetch

### Bug 6: Auto-scroll Timing Issues
- [x] File: frontend/app/chat/detail.tsx
- [ ] Improve auto-scroll reliability

### Bug 7: Profile Picture Field Inconsistencies
- [x] File: frontend/app/chat/index.tsx
- [ ] Handle multiple field name variations

## Phase 2: Backend Bugs

### Bug 8: Missing Participant in New Chat Response
- [x] File: backend/controllers/chatController.js
- [ ] Return full chat object with participants

### Bug 9: Last Message Sender Not Populated
- [x] File: backend/server.js
- [ ] Ensure consistent sender object structure

### Bug 10: No Message Retry Mechanism
- [ ] Add failed message queue and retry logic

## Phase 3: New Features (Ask User First)
- [ ] Typing Indicators
- [ ] Message Reactions
- [ ] Message Edit/Delete UI
- [ ] Reply/Quote Feature
- [ ] Attachments Support

