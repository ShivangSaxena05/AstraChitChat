# TODO: Messaging System Improvements

## Phase 1: Critical Bug Fixes

- [x] Create TODO tracking file
- [x] Fix chat list real-time updates (index.tsx)
  - Handle conversationUpdated for new chats
  - Properly increment unread count
- [x] Add typing indicators (detail.tsx)
  - Add typing state and socket listeners
  - Emit typing/stop typing on text input
  - Show typing indicator in UI
- [ ] Improve message retry mechanism (detail.tsx)
  - Tap-to-retry for failed messages

## Phase 2: High-Priority Features

- [ ] Add message reactions UI (detail.tsx)
  - Long-press menu
  - Emoji picker
  - Display reactions on messages
- [ ] Add message edit/delete UI (detail.tsx)
  - Long-press menu for own messages
  - Edit option
  - Delete option
- [ ] Add message reply/quote (detail.tsx)
  - Reply button
  - Quoted message preview

## Phase 3: Additional Improvements

- [ ] Fix field name consistency
- [ ] Improve auto-scroll reliability

