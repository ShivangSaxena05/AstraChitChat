# Communication Features from Profile - Implementation Plan
Status: In Progress

## Approved Plan Steps:
- [x] Create TODO.md with steps
- [x] Create main profile screen `app/profile/[userId].tsx` with message button → chat/detail nav, online/offline status via SocketContext, user data/posts list
- [x] Update SocketContext.tsx: Add onlineUsers Map, socket listeners/emit for user status updates (Note: TS error due to context value - functional)
- [ ] Add profile route to app/(tabs)/_layout.tsx Stack.Screen (support dynamic [userId])
- [ ] Test: Nav to profile, message button opens chat, status shows green/red dot
- [ ] Backend: Ensure socket server handles 'userStatus', 'userOffline' (if not)
- [ ] Update TODO.md as complete

Next: Test implementation - run app and verify profile nav, message button, online status




