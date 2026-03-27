# AstraChitChat — Backend API Documentation

This document lists all HTTP API endpoints exposed by the backend and a short description for each, including required authentication and main parameters.

Base URL: /api

---

## /api/auth

- POST /register
  - Description: Register a new user
  - Auth: Public
  - Body: { name, username, email, password, ... }

- POST /login
  - Description: Authenticate user and return JWT
  - Auth: Public
  - Body: { emailOrUsername, password }

- POST /2fa/setup
  - Description: Start 2FA setup (generates secret / QR)
  - Auth: Protected

- POST /2fa/verify-setup
  - Description: Verify 2FA code to complete setup
  - Auth: Protected
  - Body: { token }

- POST /2fa/disable
  - Description: Disable 2FA for authenticated user
  - Auth: Protected

- POST /2fa/login
  - Description: Verify 2FA code during login flow
  - Auth: Public (part of login flow)
  - Body: { userIdOrTempToken, code }

---

## /api/chats

- GET /
  - Description: Get list of chats for authenticated user
  - Auth: Protected

- POST /
  - Description: Send message or create one-to-one chat (message body)
  - Auth: Protected
  - Body: { chat, sender, receiver, bodyText, attachments?, msgType? }

- GET /search
  - Description: Search chats
  - Auth: Protected
  - Query: q=...

- GET /find/:userId
  - Description: Find (or get) existing chat with a user
  - Auth: Protected

- POST /create
  - Description: Create a new chat (one-to-one)
  - Auth: Protected

- POST /group
  - Description: Create a group chat
  - Auth: Protected

- POST /read-all
  - Description: Mark all messages as read in all chats / for user
  - Auth: Protected

Message-specific routes

- POST /messages/:messageId/read
  - Description: Mark a message as read
  - Auth: Protected

- PUT /messages/:messageId
  - Description: Edit a message
  - Auth: Protected

- DELETE /messages/:messageId/unsend
  - Description: Unsend a message (remove it for everyone if allowed)
  - Auth: Protected

- DELETE /messages/:messageId
  - Description: Delete a message (local delete)
  - Auth: Protected

- GET /messages/:messageId/receipts
  - Description: Get receipts (read/delivered) for a message
  - Auth: Protected

- POST /messages/:messageId/reactions
  - Description: Add a reaction to a message
  - Auth: Protected
  - Body: { emoji }

- DELETE /messages/:messageId/reactions/:emoji
  - Description: Remove a reaction
  - Auth: Protected

- GET /messages/:messageId/reactions
  - Description: Get reactions on a message
  - Auth: Protected

Wildcard chat routes

- GET /:chatId/messages
  - Description: Get messages for a chat
  - Auth: Protected

- POST /:chatId/messages
  - Description: Send message to specific chat
  - Auth: Protected

- GET /:chatId/info
  - Description: Get chat information (participants, title, etc.)
  - Auth: Protected

- GET /:chatId/media
  - Description: Get media for a chat
  - Auth: Protected

- POST /:chatId/mute
  - Description: Mute a chat
  - Auth: Protected

- POST /:chatId/pin
  - Description: Pin a chat
  - Auth: Protected

- POST /:chatId/clear
  - Description: Clear chat messages (local/remote behavior depends on implementation)
  - Auth: Protected

- POST /:chatId/leave
  - Description: Leave a group chat
  - Auth: Protected

- POST /:chatId/add-member
  - Description: Add a member to a group
  - Auth: Protected
  - Body: { userId }

- POST /:chatId/remove-member
  - Description: Remove a member from a group
  - Auth: Protected
  - Body: { userId }

---

## /api/follow

- GET /requests
  - Description: Get incoming follow requests for the authenticated user
  - Auth: Protected

- POST /requests/:userId/accept
  - Description: Accept a follow request from :userId
  - Auth: Protected

- POST /requests/:userId/reject
  - Description: Reject a follow request
  - Auth: Protected

- POST /:userId
  - Description: Send follow request or follow a user (toggle behaviour)
  - Auth: Protected

- DELETE /:userId
  - Description: Unfollow a user
  - Auth: Protected

- GET /:userId/followers
  - Description: Get followers of :userId
  - Auth: Protected

- GET /:userId/following
  - Description: Get users that :userId is following
  - Auth: Protected

- GET /:userId/check
  - Description: Check follow status between authenticated user and :userId
  - Auth: Protected

---

## /api/media

- POST /upload
  - Description: Direct server-side multer upload (S3 or Cloudinary depending on STORAGE_TYPE)
  - Auth: Protected
  - Form-Data: media (file)

- POST /upload/cloudinary
  - Description: Direct multer upload specifically to Cloudinary
  - Auth: Protected
  - Form-Data: media (file)

- POST /upload/cloudinary/direct
  - Description: Generate signed Cloudinary upload params for client direct upload
  - Auth: Protected
  - Body: { folder, fileName?, resourceType? }

- GET /presigned-url
  - Description: Get a presigned S3 upload URL or Cloudinary signed params
  - Auth: Protected
  - Query: fileName, fileType, fileSize, folder?, ownerId?

- POST /confirm-upload
  - Description: Confirm client-side upload and persist metadata (updates profile/cover when relevant)
  - Auth: Protected
  - Body (S3): { folder, key, cloudfrontUrl, fileType?, fileSize? }
  - Body (Cloudinary): { folder, publicId, secureUrl }

- DELETE /delete
  - Description: Delete a media file from S3 or Cloudinary
  - Auth: Protected
  - Body: { key } or { publicId }

- GET /storage-type
  - Description: Return current storage backend (cloudinary | s3)
  - Auth: Public

---

## /api/posts

- POST /upload
  - Description: Create a post (with media references)
  - Auth: Protected
  - Body: { caption, media: [{ url | publicId | key }], visibility? }

- GET /feed
  - Description: Get feed posts for authenticated user
  - Auth: Protected

- GET /flicks
  - Description: Get short video posts
  - Auth: Protected

- GET /me
  - Description: Get authenticated user's posts
  - Auth: Protected

- DELETE /:postId
  - Description: Delete a post
  - Auth: Protected

Like & Comment sub-routes

- POST /:postId/like
  - Description: Like or unlike a post (toggle)
  - Auth: Protected

- GET /:postId/likes
  - Description: Get list of users who liked the post
  - Auth: Protected

- POST /:postId/comments
  - Description: Add a comment to a post
  - Auth: Protected
  - Body: { text, replyToCommentId? }

- GET /:postId/comments
  - Description: Get comments for a post
  - Auth: Protected

- DELETE /:postId/comments/:commentId
  - Description: Delete a comment
  - Auth: Protected

---

## /api/profile

- GET /me
  - Description: Get authenticated user's profile
  - Auth: Protected

- PUT /me
  - Description: Update authenticated user's profile
  - Auth: Protected
  - Body: { name?, bio?, username?, ... }

- GET /avatar-upload-url
  - Description: Get presigned URL for uploading avatar (profile)
  - Auth: Protected

- GET /cover-upload-url
  - Description: Get presigned URL for uploading cover photo
  - Auth: Protected

- GET /:userId
  - Description: Get public profile for :userId
  - Auth: Protected

---

## /api/report

- POST /user
  - Description: Submit a report against a user
  - Auth: Protected
  - Body: { reportedUserId, reason, details? }

- GET /
  - Description: Get all reports (admin only)
  - Auth: Protected + admin

- PUT /:id
  - Description: Update report status (admin only)
  - Auth: Protected + admin
  - Body: { status, notes? }

---

## /api/search

- GET /
  - Description: Search across users and posts
  - Auth: Protected
  - Query: q=..., type=(users|posts)

---

## /api/users

- GET /search
  - Description: Search users by username or name
  - Auth: Protected
  - Query: q=...

- GET /blocked
  - Description: Get list of users the authenticated user has blocked
  - Auth: Protected

- GET /muted
  - Description: Get list of users the authenticated user has muted
  - Auth: Protected

- GET /export
  - Description: Export authenticated user's data
  - Auth: Protected

- DELETE /me
  - Description: Delete authenticated user's account
  - Auth: Protected

- POST /:userId/block
  - Description: Toggle block/unblock a user
  - Auth: Protected

- POST /:userId/mute
  - Description: Toggle mute/unmute a user
  - Auth: Protected

- GET /:userId
  - Description: Get user profile by ID
  - Auth: Protected

---

## Socket.io (brief)

The backend also exposes realtime socket events using Socket.io. Client connects with auth token in handshake (handshake.auth.token). Important events (server emits / client listens or vice-versa):
- setup, connected
- join chat
- new message → message received, conversationUpdated
- typing / stop typing
- read messages / messages read
- message delivered / message delivered
- webrtc-offer / webrtc-answer / webrtc-candidate
- end-call, request-video-upgrade, accept-video-upgrade, decline-video-upgrade, busy

Authentication: socket uses the same JWT secret; token must be included when connecting.

---

Notes
- All routes marked "Protected" require Authorization header: "Bearer <token>".
- Admin-only routes check `admin` middleware.
- For media uploads the storage backend depends on environment variable STORAGE_TYPE (cloudinary or s3). See `/api/media/storage-type` to verify at runtime.

If you want this exported as OpenAPI (Swagger) or as Postman collection, tell me which format and I'll generate it.
