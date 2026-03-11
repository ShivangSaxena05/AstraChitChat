# AstraChitChat - Comprehensive Bug & Error Report

## Executive Summary
This report identifies critical bugs, functional issues, UI/UX problems, and potential improvements across the entire AstraChitChat application. The app includes a React Native (Expo) frontend and Node.js/Express backend with MongoDB.

---

## 🚨 CRITICAL BUGS (Production Breaking)

### 1. Login Flow Broken - Git Merge Conflict Code
**File:** `frontend/app/auth/login.tsx`
**Severity:** CRITICAL

The login component contains unresolved git merge conflicts that break the authentication flow:

```javascript
<<<<<<< HEAD
// Old branch code - stores token immediately
=======
// New branch code - checks for 2FA first
>>>>>>> upstream/master
```

**Issues:**
- The login function has duplicate code blocks due to merge conflicts
- The 2FA verification flow (`completeLogin` function) is only in one branch
- Token is stored before checking if 2FA is required in some code paths
- If a user has 2FA enabled, the app might navigate before verification

**Recommendation:** Resolve the git conflicts properly and ensure 2FA flow is correctly implemented.

---

### 2. Chat Detail Missing Props - Git Merge Conflicts
**File:** `frontend/app/chat/detail.tsx`
**Severity:** CRITICAL

The chat detail screen has git merge conflicts that result in:
- `onLongPress` and `onSwipeReply` props not passed to `MessageItem` component in HEAD version
- Swipeable message functionality won't work for messages
- Long-press reply feature won't work

**Missing Props:**
```javascript
// In renderItem function - missing from HEAD branch:
onLongPress={handleMessageLongPress}
onSwipeReply={handleSwipeReply}
```

---

### 3. API Service - Confusing DELETE Request Handling
**File:** `frontend/services/api.ts`
**Severity:** CRITICAL

The `post` function has incorrect logic for handling DELETE requests:

```javascript
export const post = async (url: string, data: any) => {
  if (data && data.method === 'DELETE') {
    const response = await api.delete(url);
    return response.data;
  }
  const response = await api.post(url, data);
  return response.data;
};
```

**Issues:**
- This is highly confusing and error-prone
- A caller passing `{method: 'DELETE'}` to `post()` would get unexpected behavior
- Should use the `del` function for DELETE requests, but the naming is inconsistent

**Recommendation:** Remove this logic from `post` function. Ensure all DELETE calls use the `del` function.

---

### 4. Server.js - Git Merge Conflicts in Socket Handler
**File:** `backend/server.js`
**Severity:** CRITICAL

Multiple git merge conflicts in the socket.io message handler:

```javascript
<<<<<<< HEAD
// Old code - stores sender as object
=======
// New code - stores sender as ObjectId
>>>>>>> upstream/master
```

**Issues:**
- Duplicate code blocks for message handling
- `quotedMsgId` handling inconsistent between branches
- Could cause message saving failures or data inconsistency

---

## 🔴 HIGH PRIORITY ISSUES

### 5. Missing Error Handling - Home Screen Flicks
**File:** `frontend/app/(tabs)/(tabs)/index.tsx`
**Function:** `fetchFlicks`

```javascript
const fetchFlicks = async (isRefresh = false) => {
  try {
    // ... fetch logic
  } catch (error: any) {
    Alert.alert('Error', error.response?.data?.message || 'Failed to fetch flicks');
  } finally {
    // ...
  }
};
```

**Issue:** No loading state reset on error if `showLoading` parameter handling is inconsistent.

---

### 6. Race Condition in SocketContext
**File:** `frontend/contexts/SocketContext.tsx`
**Function:** `updateConversation`

**Issues:**
- Uses `currentUserIdRef` but the callback might have stale closures
- New conversation detection triggers API fetch inside state update, which can cause infinite loops
- No cleanup of old conversation data when switching accounts

---

### 7. Profile Screen - Duplicate Conditional Rendering
**File:** `frontend/app/(tabs)/(tabs)/profile.tsx`

```javascript
{user.stats.posts > 0 && (
<<<<<<< HEAD
  <View style={styles.stat}>
    <ThemedText style={styles.statNumber}>{user.stats.likes}</ThemedText>
    <ThemedText style={styles.statLabel}>Likes</ThemedText>
  </View>
=======
   <View style={styles.stat}>
     <ThemedText style={styles.statNumber}>{user.stats.likes}</ThemedText>
     <ThemedText style={styles.statLabel}>Likes</ThemedText>
   </View>
>>>>>>> upstream/master
)}
```

**Issue:** Duplicate rendering logic with git conflict markers - needs cleanup.

---

### 8. Chat List - Unread Badge Inconsistency
**File:** `frontend/app/chat/index.tsx`

```javascript
<Text style={styles.unreadText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
```

**Issue:** Shows "99+" but the '+' sign is not displayed - should be `'99+'` vs just `99`.

---

### 9. Memory Leak - Typing Timeout Not Cleared
**File:** `frontend/app/chat/detail.tsx`

**Issue:** `typingTimeoutRef` is not always cleared on component unmount in all code paths.

```javascript
// This cleanup exists in one branch but not the main:
// In return cleanup:
if (typingTimeoutRef.current) {
  clearTimeout(typingTimeoutRef.current);
}
```

---

## 🟡 MEDIUM PRIORITY ISSUES

### 10. No Network Error Feedback - Explore Feed
**File:** `frontend/app/(tabs)/(tabs)/index.tsx`
**Function:** `fetchPosts`

```javascript
} catch (error: any) {
  console.error('API Error:', error.response?.data || error.message);
  // No Alert or user feedback!
}
```

---

### 11. PostCard - Like State Not Persisted from Server
**File:** `frontend/components/PostCard.tsx`

```javascript
const [isLiked, setIsLiked] = useState(false);  // Always starts as false
```

**Issue:** Component doesn't fetch initial like state from server - always shows as unliked initially.

---

### 12. Video Playback - State Lost on Scroll
**File:** `frontend/components/PostCard.tsx`

**Issue:** Video playback state (`isPlaying`) is local to each card. When scrolling, videos reset.

---

### 13. Flicks - Videos Not Auto-Pause When Scrolled Away
**File:** `frontend/app/(tabs)/(tabs)/index.tsx`

**Issue:** Only the currently visible video plays (`shouldPlay={isVisible}`), but there's no explicit pause when scrolled away, which could cause audio issues.

---

### 14. Search Users - No Debounce on Input
**File:** `frontend/app/chat/add.tsx`

```javascript
useEffect(() => {
  if (searchQuery.trim().length > 0) {
    searchUsers();
  }
}, [searchQuery]);
```

**Issue:** API called on every keystroke - should have debounce to reduce API load.

---

### 15. Settings - Delete Account Uses Hardcoded URL
**File:** `frontend/app/profile/settings.tsx`

```javascript
await fetch('http://localhost:5000/api/users/me', {
  method: 'DELETE',
  // ...
});
```

**Issue:** Uses hardcoded localhost URL instead of API service - won't work in production.

---

### 16. Edit Profile - Location Suggestions Z-Index Issues
**File:** `frontend/app/profile/edit.tsx`

```javascript
locationContainer: {
  zIndex: 100,
},
suggestionsContainer: {
  zIndex: 1000,
```

**Issue:** Fixed z-index values might not work properly in nested contexts. Should use `Platform.select` for proper handling.

---

### 17. Follow Requests - No Empty State Component
**File:** `frontend/app/profile/follow-requests.tsx`

**Issue:** While there's an empty text, there's no visual indicator when requests array is empty after loading completes.

---

### 18. Other Profile - Posts Not Fetched
**File:** `frontend/app/(tabs)/(tabs)/other-profile.tsx`

```javascript
// For now, skip posts to avoid additional API calls
setPosts([]);
```

**Issue:** This is intentional but creates incomplete UX - users can't see the other person's posts.

---

### 19. Chat Detail - Read Receipt Logic Bug
**File:** `frontend/app/chat/detail.tsx`

```javascript
// Current logic marks messages WE received as read
// But the read receipt should indicate WE read THEIR messages
if (String(m.sender._id) !== String(currentUserId) && ...)
```

**Issue:** Read receipt logic is confusing - should mark messages WE sent as read when recipient reads them, not messages we received.

---

### 20. Followers List - Type Safety
**File:** `frontend/app/(tabs)/(tabs)/followers-list.tsx`

**Issue:** Uses `useLocalSearchParams` without proper typing in some places - could cause navigation issues.

---

## 🟢 LOW PRIORITY / IMPROVEMENTS

### 21. Missing Loading States
- **Chat detail screen:** Shows spinner initially but doesn't show loading when sending messages
- **Profile edit:** No loading indicator while uploading images

### 22. No Offline Mode Detection
- App doesn't detect when device is offline and show appropriate messages

### 23. Token Not Refreshed
- JWT tokens expire after 30 days but there's no refresh mechanism
- Users will be logged out when token expires

### 24. No Pagination in Followers/Following Lists
- Could cause performance issues with large follower counts

### 25. Search - No Recent Searches
- Could improve UX by storing recent searches

### 26. Chat - No Message Search
- Could add functionality to search within conversations

### 27. Profile - No Verification Badge
- No visual indicator for verified accounts (if implemented)

### 28. Media Upload - No Progress Indicator
- Large uploads don't show progress feedback

### 29. Call Feature - No Call History
- No log of past calls

### 30. Notifications - No In-App Notification Center
- All notifications appear as system notifications only

---

## 📊 STATISTICS

- **Critical Issues:** 4
- **High Priority Issues:** 6
- **Medium Priority Issues:** 10
- **Low Priority / Improvements:** 10

**Total Issues Identified:** 30

---

## ✅ RECOMMENDED FIXES PRIORITY

### Phase 1 (Immediate - Fix Before Launch)
1. Resolve git merge conflicts in login.tsx, chat/detail.tsx, server.js
2. Fix API service DELETE handling
3. Fix unread badge display
4. Add error handling to explore feed fetch
5. Fix delete account hardcoded URL

### Phase 2 (High Priority)
1. Add proper error boundaries
2. Fix socket context race conditions
3. Implement proper loading states
4. Fix read receipt logic
5. Add typing timeout cleanup

### Phase 3 (Improvements)
1. Add debounce to search
2. Implement token refresh
3. Add pagination to lists
4. Improve video playback handling
5. Add offline detection

---

*Report generated from comprehensive code review of AstraChitChat application.*
*Date: ${new Date().toISOString()}*

---

## 📋 APPENDIX: TODO.md ALSO HAS GIT CONFLICTS

The TODO.md file also contains unresolved git merge conflicts:

```markdown
<<<<<<< HEAD
# TODO: Merge changes from AstraChitChat-master to AstraChitChat
=======
# TODO: Fix Chat and Calling Features - COMPLETED
>>>>>>> upstream/master
```

This should be resolved by choosing either the merge task list or the completed fixes list (or combining both).

