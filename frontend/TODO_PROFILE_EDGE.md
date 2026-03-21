# Profile Edge Cases Plan
Status: Planning

## Audit from Backend
profileController.js already handles:
- Private: `user.isPrivate`
- Blocked: `isBlocked` from currentUser.blockedUsers

Current UI:
- No posts: ListEmptyComponent ✓
- No private/block logic
- No network retry/error states

## Plan
1. **No Posts**: Enhance empty state (already has icons/text)
2. **Private Account**: Show locked icon + "Request to follow" (if not following)
3. **Blocked**: "You blocked this user" + unfollow/unblock options
4. **Slow Network/Retry**: Error boundary, retry button in catch
5. **Loading Fallback**: Timeout → error state

## Edge Logic in profile/[userId].tsx
```
if (profile?.isBlocked) return <BlockedView />
if (profile?.isPrivate && !isFollowing) return <PrivateView />
```

## API Needs
- [x] Added `isFollowing` query in backend/controllers/profileController.js ✓

## File Changes
| File | Changes |
|------|---------|
| `app/profile/[userId].tsx` | Add private/blocked views, retry button, isFollowing logic
| `backend/controllers/profileController.js` | Add `isFollowing` to response

