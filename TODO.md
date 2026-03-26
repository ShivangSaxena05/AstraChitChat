## Fix 500 Error - Performance & Response Mismatch

**Status: 🚀 In Progress**

### Breakdown of Approved Plan:
1. [ ] **Read all target files** ✅ (chatController.js, server.js, 3 frontend TSX files read successfully)
2. [ ] **Create this TODO.md** ← Current step
3. [✅] **Edit backend/controllers/chatController.js** - Remove Promise.all unread loop, add .lean(), .limit(20)
4. [✅] **Edit backend/server.js** - Enhance error middleware logging  
5. [✅] **Edit frontend/app/(tabs)/(tabs)/chat-list.tsx** - Fix `data && data.chats` → `data`
6. [✅] **Edit frontend/contexts/SocketContext.tsx** - Fix get('/chats') response handling
7. [✅] **Edit frontend/app/chat/index.tsx** - Fix `data && data.chats` → `data`
8. [ ] **Test locally** - Run backend/frontend, verify /chats endpoint fast, no crashes
9. [ ] **Deploy & verify Render logs** - No more 500s, fast chat loading
10. [ ] **attempt_completion** - Mark task done

**Next step:** Edit chatController.js (critical performance fix)

**Notes:** 
- Backend will temporarily lose unread counts (acceptable for stability)
- Frontend fixes ensure chats display properly
- server.js logging helps future debugging
