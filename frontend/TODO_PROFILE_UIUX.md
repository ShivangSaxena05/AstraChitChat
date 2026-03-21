# Profile Screen UI/UX Polish Plan
Status: Planning

## Audit
Current profile/[userId].tsx:
- Basic ActivityIndicator loading (no skeleton)
- No pull-to-refresh
- No transitions/animations
- No follow button
- No memoization
- Full re-renders possible

## Plan
1. [x] **Skeleton Loading**: Create `components/ProfileSkeleton.tsx` for shimmer placeholders (header, posts)
2. [ ] **Pull-to-refresh**: FlatList refreshControl → fetchProfile
3. [ ] **Smooth Transitions**: FadeInView wrapper, LayoutAnimation on data update
4. [ ] **Micro-interactions**: Pressable with haptic + scale for message/menu buttons; Follow button toggle animation
5. [ ] **Performance**: React.memo PostCard, useCallback/memo for profile data, VirtualizedList if many posts
6. [ ] **Add Follow Button**: In header stats row, API toggle

Next: Add micro-interactions (haptic button feedback), follow button, React.memo PostCard

Status: Skeleton ✓, RefreshControl ✓, LayoutAnimation ✓


## File Changes
| File | Changes |
|------|---------|
| `components/ProfileSkeleton.tsx` | New shimmer UI |
| `app/profile/[userId].tsx` | Skeleton state, refreshControl, animations, follow button, memo |
| `components/PostCard.tsx` | React.memo if not |

## Followup Steps
- `npx expo install react-native-reanimated` if needed for animations
- Test on device: Smooth loading, refresh, taps

