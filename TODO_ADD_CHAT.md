# TODO: Add Plus Icon to Chat List

## Steps:
1. [x] Update frontend/app/chat/index.tsx - Add plus icon button in header to navigate to add chat screen
2. [x] Update frontend/app/chat/add.tsx - Fix the API call to properly create chat (use /chats/create endpoint)
3. [x] Add debug logging in add.tsx to trace issues
4. [x] Add parameter validation in detail.tsx to handle edge cases

## Current Implementation:
- Plus icon (+) added to Chat List header
- Tapping + navigates to /chat/add screen
- Search users by username/name
- Tap user to create chat via POST /chats/create
- Navigate to chat detail with chatId, otherUserId, otherUsername

## Debug Features Added:
- Console logs in add.tsx to trace API calls and responses
- Validation in detail.tsx to show error if params are missing

5. [x] Add search bar above chat list to filter/search chats by username

## Features:
- **Plus Icon**: Creates new chats
- **Search Bar**: Filters existing chats by username in real-time
- **Debug Logging**: Console logs to trace API calls and responses
- **Parameter Validation**: Handles missing params gracefully

