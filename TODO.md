# TODO: Implement Overlay for Followers/Following

## Task
In profile section, when clicking on followers or following, show an overlay card instead of navigating to another page.

## Steps Completed:

- [x] 1. Add state management for overlay visibility (followersModalVisible, followingModalVisible)
- [x] 2. Add state for selected user profile modal (selectedUserId, profileModalVisible)
- [x] 3. Add state for user list data (followersList, followingList)
- [x] 4. Create fetch functions for followers and following data
- [x] 5. Replace router.push navigation with setVisible(true) for modals
- [x] 6. Add Followers/Following List Modal component
- [x] 7. Add User Profile Overlay Modal component
- [x] 8. Style the overlay modals properly

## File Edited:
- frontend/app/(tabs)/(tabs)/profile.tsx

## Implementation Details:
- Added Modal components for followers and following lists
- Added Modal component for user profile overlay
- Added fetch functions to get followers/following data
- Added functionality to view user profiles from the list
- Added follow/unfollow and message functionality in the overlay
- Supports pull-to-refresh on the list modals

