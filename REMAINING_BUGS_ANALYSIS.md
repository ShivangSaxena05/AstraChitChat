# Remaining Frontend Bugs Analysis - Phase 2

## Summary
After reviewing secondary files, identified **24 bugs** across remaining components that need fixing.

---

## CRITICAL BUGS (5)

### 1. **useAccountSwitcher: Multiple Account Management Issues**
- **File**: `hooks/useAccountSwitcher.tsx`
- **Issue**: Socket connection not properly validated before switching accounts
- **Impact**: User may get stuck in invalid state if socket connection fails during account switch
- **Fix**: Add validation and error handling for socket connection

### 2. **HomeScreen (index.tsx): Memory Leaks in Video Refs**
- **File**: `app/(tabs)/(tabs)/index.tsx` (lines ~200)
- **Issue**: Video refs stored in `videoRefs.current` are never cleaned up
- **Impact**: Memory leak grows as user scrolls through more flicks
- **Fix**: Clean up video refs when component unmounts or when flick goes out of view

### 3. **chat/detail.tsx: Race Condition in Message Sending**
- **File**: `app/chat/detail.tsx`
- **Issue**: No debounce on rapid send attempts, multiple identical messages sent
- **Impact**: Duplicate messages in chat
- **Fix**: Add debounce/throttle to message send

### 4. **HamburgerMenu: Duplicate Account Switch Logic**
- **File**: `components/HamburgerMenu.tsx`
- **Issue**: `handleSwitchAccount` disconnects/reconnects socket without waiting for connection confirmation
- **Impact**: Socket may be in invalid state, messages not received
- **Fix**: Add proper await and validation

### 5. **TopHeaderComponent: Unused Account Fetch**
- **File**: `components/TopHeaderComponent.tsx`
- **Issue**: `AccountSwitcherModal` visible state not properly managed, can cause UI flickering
- **Impact**: Poor UX when switching accounts
- **Fix**: Add proper state management for modal visibility

---

## HIGH PRIORITY BUGS (8)

### 6. **HomeScreen: Missing Error Handling in Video Playback**
- **File**: `app/(tabs)/(tabs)/index.tsx`
- **Issue**: No error callback for failed video loads
- **Impact**: Failed videos display as blank black screens with no feedback
- **Fix**: Add `onError` handler to Video component

### 7. **HomeScreen: Unvalidated Post/Flick Data**
- **File**: `app/(tabs)/(tabs)/index.tsx`
- **Issue**: No validation of mediaUrl before rendering Video/Image
- **Impact**: Possible crashes on null/undefined URLs
- **Fix**: Add data validation before rendering media

### 8. **ExpandableBio: Navigation Without Error Handling**
- **File**: `components/ExpandableBio.tsx`
- **Issue**: `router.push` can fail silently, no error handling for invalid routes
- **Impact**: Navigation failures not reported to user
- **Fix**: Add error handling and logging

### 9. **ChatMediaGrid: Missing null/undefined Checks**
- **File**: `components/ChatMediaGrid.tsx`
- **Issue**: `item.thumbnail` and `item.url` not validated before use
- **Impact**: Possible crashes on malformed API data
- **Fix**: Add defensive checks for media item properties

### 10. **chat/detail.tsx: XSS Vulnerability in sanitizeMessage**
- **File**: `app/chat/detail.tsx` (line 88-95)
- **Issue**: `sanitizeMessage` function escapes HTML but is not applied to all message text
- **Impact**: XSS vulnerability through quoted messages
- **Fix**: Apply sanitization consistently to all message text

### 11. **HamburgerMenu: No Connection Validation After Switch**
- **File**: `components/HamburgerMenu.tsx`
- **Issue**: After switching account, no check if socket reconnection succeeded
- **Impact**: User thinks they switched but socket didn't reconnect
- **Fix**: Validate socket connection after account switch

### 12. **BottomTabBarComponent: No State Synchronization**
- **File**: `components/BottomTabBarComponent.tsx`
- **Issue**: Tab state from `state.routes[state.index]` can be out of sync with actual navigation
- **Impact**: Wrong tab highlighted after navigation
- **Fix**: Add proper tab state management

### 13. **useAccountSwitcher: No Token Expiry Validation**
- **File**: `hooks/useAccountSwitcher.tsx`
- **Issue**: Token not validated before switching accounts (might be expired)
- **Impact**: User switches to account with expired token, then APIs fail
- **Fix**: Validate token before switching and handle expiry

---

## MEDIUM PRIORITY BUGS (8)

### 14. **chat/index.tsx: Missing Unread Message Sync**
- **File**: `app/chat/index.tsx`
- **Issue**: Unread count updated from API but socket updates might conflict
- **Impact**: Inconsistent unread badges
- **Fix**: Add proper state reconciliation for unread counts

### 15. **ChatBubble/Message Display: No Loading State**
- **File**: `components/ChatBubble.tsx` and `app/chat/detail.tsx`
- **Issue**: Media messages don't show loading skeleton while downloading
- **Impact**: User sees blank space, thinks message didn't send
- **Fix**: Add loading state for media messages

### 16. **HomeScreen Flicks: No Offline Cache**
- **File**: `app/(tabs)/(tabs)/index.tsx`
- **Issue**: Flicks list disappears when offline, no cached data shown
- **Impact**: Poor UX when network unstable
- **Fix**: Add offline cache for flicks

### 17. **StoriesReelsComponent: Mock Data Only**
- **File**: `components/StoriesReelsComponent.tsx`
- **Issue**: Using hardcoded mock stories, should be fetched from API
- **Impact**: Features not functional, just placeholder
- **Fix**: Integrate with real API data

### 18. **ExpandableBio: Text Parsing Race Condition**
- **File**: `components/ExpandableBio.tsx`
- **Issue**: `isTruncated` state might not update correctly on rapid text changes
- **Impact**: "Read more" button appears/disappears inconsistently
- **Fix**: Add useEffect dependency array for text changes

### 19. **CallOverlay: Duplicate User Display Logic**
- **File**: `components/CallOverlay.tsx`
- **Issue**: Comment says "Removed redundant useEffect" but logic flow unclear
- **Impact**: Potential null reference if displayUser logic breaks
- **Fix**: Add proper defensive null checks

### 20. **chat/detail.tsx: Message List Not Sorted Correctly**
- **File**: `app/chat/detail.tsx`
- **Issue**: Date separators added but messages might not be properly sorted by timestamp
- **Impact**: Messages appear out of chronological order
- **Fix**: Add proper sort validation

### 21. **HomeScreen: Pagination Not Respecting API Limits**
- **File**: `app/(tabs)/(tabs)/index.tsx`
- **Issue**: `hasMore` logic relies on array length == pageSize, but API might return less
- **Impact**: Pagination can break on sparse data
- **Fix**: Add explicit hasMore field from API response

---

## LOW PRIORITY BUGS (3)

### 22. **BottomTabBarComponent: No Accessibility Features**
- **File**: `components/BottomTabBarComponent.tsx`
- **Issue**: Tabs not properly labeled for screen readers
- **Impact**: Accessibility issues for disabled users
- **Fix**: Add accessible names and roles

### 23. **HamburgerMenu: Color Scheme Not Persisted**
- **File**: `components/HamburgerMenu.tsx`
- **Issue**: Uses `useColorScheme()` but theme changes don't persist to AsyncStorage
- **Impact**: Theme resets on app restart
- **Fix**: Persist theme preference to AsyncStorage

### 24. **ProfileSkeleton: Not Used Consistently**
- **File**: `components/ProfileSkeleton.tsx` (mentioned but not reviewed)
- **Issue**: Some loading states use generic ActivityIndicator instead of skeleton
- **Impact**: Inconsistent loading UX
- **Fix**: Use ProfileSkeleton for all profile loading states

---

## Fix Priority Order
1. **CRITICAL** (bugs 1-5): Address immediately - app stability
2. **HIGH** (bugs 6-13): Address next - security and functionality
3. **MEDIUM** (bugs 14-21): Address after high - UX improvements
4. **LOW** (bugs 22-24): Address last - polish and accessibility

