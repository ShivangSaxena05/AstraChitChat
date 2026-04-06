/**
 * Application-Level Lazy Migration Utilities
 * 
 * These functions implement lazy default patterns for fields that should NOT
 * be backfilled in the bulk migration script. Instead, they are set on first
 * read or write, preventing unnecessary database updates.
 * 
 * Pattern:
 * 1. Check if field is missing
 * 2. Apply safe default in memory
 * 3. Fire-and-forget update to persist (async, non-blocking)
 * 4. Return enriched object to client
 */

const User = require('../models/User');
const Post = require('../models/Post');

// ────────────────────────────────────────────────────────────────────────────
// USER LAZY DEFAULTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Apply lazy defaults to a User document after fetching.
 * Safe defaults for fields not backfilled during migration.
 * 
 * @param {Object} user - Mongoose user document
 * @returns {Object} User object with safe defaults applied
 */
function applyUserDefaults(user) {
  if (!user) return null;

  const userObj = user.toObject ? user.toObject() : user;
  const updates = {};

  // lastSeen: Set to current time on first fetch after migration
  if (userObj.lastSeen === undefined || userObj.lastSeen === null) {
    updates.lastSeen = new Date();
  }

  // isOnline: Should be managed by socket events, default false
  if (userObj.isOnline === undefined || userObj.isOnline === null) {
    updates.isOnline = false;
  }

  // Persist lazy defaults asynchronously (fire-and-forget)
  if (Object.keys(updates).length > 0 && user._id) {
    User.updateOne({ _id: user._id }, { $set: updates }).exec().catch(err => {
      console.error(`Failed to persist user defaults for ${user._id}:`, err.message);
    });
  }

  return { ...userObj, ...updates };
}

/**
 * Serialize user for API response with guaranteed defaults.
 * Use this in every endpoint that returns User data.
 * 
 * @param {Object} user - User document (already has applyUserDefaults applied)
 * @returns {Object} Safe user DTO for client
 */
function serializeUser(user) {
  if (!user) return null;

  return {
    _id: user._id,
    name: user.name,
    username: user.username,
    email: user.email,
    profilePicture: user.profilePicture ?? null,
    coverPhoto: user.coverPhoto ?? '',
    bio: user.bio ?? '',
    location: user.location ?? '',
    website: user.website ?? '',
    pronouns: user.pronouns ?? '',
    isOnline: user.isOnline ?? false,
    lastSeen: user.lastSeen ?? null,
    isPrivate: user.isPrivate ?? false,
    isVerified: user.isVerified ?? false,
    accountStatus: user.accountStatus ?? 'active',
    postsCount: user.postsCount ?? 0,
    followersCount: user.followersCount ?? 0,
    followingCount: user.followingCount ?? 0,
    totalLikes: user.totalLikes ?? 0,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// POST LAZY DEFAULTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Apply lazy defaults to a Post document after fetching.
 * 
 * @param {Object} post - Mongoose post document
 * @returns {Object} Post object with safe defaults applied
 */
function applyPostDefaults(post) {
  if (!post) return null;

  const postObj = post.toObject ? post.toObject() : post;
  const updates = {};

  // location: Optional field, user sets on next edit
  if (postObj.location === undefined) {
    postObj.location = null;
  }

  // visibility: Default to public, user can override
  if (postObj.visibility === undefined || postObj.visibility === null) {
    postObj.visibility = 'public';
  }

  // sharesCount: Display-only field, default 0 (no persistence)
  if (postObj.sharesCount === undefined) {
    postObj.sharesCount = 0;
  }

  // savedCount: Display-only field, default 0 (no persistence)
  if (postObj.savedCount === undefined) {
    postObj.savedCount = 0;
  }

  // viewsCount: Display-only field, default 0 (no persistence)
  if (postObj.viewsCount === undefined) {
    postObj.viewsCount = 0;
  }

  // Persist only if there are important fields to save
  // (location and visibility are worth persisting, but others are derived/display-only)
  const persistedUpdates = {};
  if (updates.location !== undefined) persistedUpdates.location = updates.location;
  if (updates.visibility !== undefined) persistedUpdates.visibility = updates.visibility;

  if (Object.keys(persistedUpdates).length > 0 && post._id) {
    Post.updateOne({ _id: post._id }, { $set: persistedUpdates }).exec().catch(err => {
      console.error(`Failed to persist post defaults for ${post._id}:`, err.message);
    });
  }

  return postObj;
}

/**
 * Serialize post for API response with guaranteed defaults.
 * 
 * @param {Object} post - Post document (already has applyPostDefaults applied)
 * @returns {Object} Safe post DTO for client
 */
function serializePost(post) {
  if (!post) return null;

  const primaryMedia = post.media && post.media.length > 0 ? post.media[0] : {};

  return {
    _id: post._id,
    author: post.author,
    caption: post.caption ?? '',
    media: post.media ?? [],
    likesCount: post.likesCount ?? 0,
    commentsCount: post.commentsCount ?? 0,
    sharesCount: post.sharesCount ?? 0,
    savedCount: post.savedCount ?? 0,
    viewsCount: post.viewsCount ?? 0,
    isDeleted: post.isDeleted ?? false,
    location: post.location ?? null,
    visibility: post.visibility ?? 'public',
    hashtags: post.hashtags ?? [],
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// SOCKET EVENT HANDLERS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Call when a user connects via WebSocket.
 * Sets isOnline to true and updates lastSeen.
 * 
 * @param {string} userId - User ID
 */
function handleUserConnect(userId) {
  User.updateOne(
    { _id: userId },
    {
      $set: {
        isOnline: true,
        lastSeen: new Date(),
      },
    }
  ).exec().catch(err => {
    console.error(`Failed to update online status for ${userId}:`, err.message);
  });
}

/**
 * Call when a user disconnects via WebSocket.
 * Sets isOnline to false and updates lastSeen.
 * 
 * @param {string} userId - User ID
 */
function handleUserDisconnect(userId) {
  User.updateOne(
    { _id: userId },
    {
      $set: {
        isOnline: false,
        lastSeen: new Date(),
      },
    }
  ).exec().catch(err => {
    console.error(`Failed to update offline status for ${userId}:`, err.message);
  });
}

/**
 * Call on user login.
 * Updates lastSeen to current time.
 * 
 * @param {string} userId - User ID
 */
function handleUserLogin(userId) {
  User.updateOne(
    { _id: userId },
    {
      $set: {
        lastSeen: new Date(),
        isOnline: true,
      },
    }
  ).exec().catch(err => {
    console.error(`Failed to update last seen for ${userId}:`, err.message);
  });
}

// ────────────────────────────────────────────────────────────────────────────
// USAGE IN CONTROLLERS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Example: Getting a user profile
 * 
 * async function getUserProfile(req, res) {
 *   try {
 *     let user = await User.findById(req.params.userId);
 *     user = applyUserDefaults(user);  // Apply lazy defaults
 *     res.json(serializeUser(user));   // Serialize for response
 *   } catch (error) {
 *     res.status(500).json({ error: error.message });
 *   }
 * }
 */

/**
 * Example: Listing posts
 * 
 * async function listPosts(req, res) {
 *   try {
 *     const posts = await Post.find().limit(20);
 *     const enrichedPosts = posts
 *       .map(post => applyPostDefaults(post))
 *       .map(post => serializePost(post));
 *     res.json(enrichedPosts);
 *   } catch (error) {
 *     res.status(500).json({ error: error.message });
 *   }
 * }
 */

/**
 * Example: Socket.io connection
 * 
 * socket.on('connect', () => {
 *   handleUserConnect(socket.userId);
 * });
 * 
 * socket.on('disconnect', () => {
 *   handleUserDisconnect(socket.userId);
 * });
 */

// ────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE FOR AUTOMATIC LAZY DEFAULTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Middleware to automatically apply user defaults to req.user (if populated by auth).
 * Apply to protected routes:
 * 
 * router.get('/me', authenticate, applyUserDefaultsMiddleware, (req, res) => {
 *   res.json(serializeUser(req.user));
 * });
 */
function applyUserDefaultsMiddleware(req, res, next) {
  if (req.user) {
    req.user = applyUserDefaults(req.user);
  }
  next();
}

module.exports = {
  // User utilities
  applyUserDefaults,
  serializeUser,
  handleUserConnect,
  handleUserDisconnect,
  handleUserLogin,
  applyUserDefaultsMiddleware,

  // Post utilities
  applyPostDefaults,
  serializePost,
};
