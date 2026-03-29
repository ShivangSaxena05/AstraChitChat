/**
 * Example Controller Integration with Lazy Defaults
 * 
 * Shows how to integrate applyUserDefaults and serializeUser
 * into existing controller methods to ensure proper defaults
 * for fields not backfilled during migration.
 */

const User = require('../models/User');
const Post = require('../models/Post');
const { 
  applyUserDefaults, 
  serializeUser,
  applyPostDefaults,
  serializePost
} = require('../utils/lazyDefaults');

// ────────────────────────────────────────────────────────────────────────────
// USER CONTROLLERS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Get user profile
 * Applies lazy defaults and returns serialized user object
 */
exports.getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    let user = await User.findById(userId)
      .select('-password -twoFactorSecret')
      .lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Apply lazy defaults in memory
    user = applyUserDefaults(user);

    // Return serialized user (guaranteed defaults)
    res.json(serializeUser(user));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get current user (from auth middleware)
 */
exports.getCurrentUser = async (req, res) => {
  try {
    let user = req.user; // Populated by auth middleware

    // Apply lazy defaults
    user = applyUserDefaults(user);

    // Return serialized user
    res.json(serializeUser(user));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * List users (search, recommendations, etc.)
 * Applies lazy defaults to all users
 */
exports.listUsers = async (req, res) => {
  try {
    const { limit = 20, skip = 0 } = req.query;

    const users = await User.find()
      .select('-password -twoFactorSecret')
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    // Apply lazy defaults to all users and serialize
    const serializedUsers = users
      .map(user => applyUserDefaults(user))
      .map(user => serializeUser(user));

    res.json(serializedUsers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update user profile
 * Ensures defaults are applied to returned user object
 */
exports.updateUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    // Don't allow direct updates to computed fields
    delete updates.followersCount;
    delete updates.followingCount;
    delete updates.postsCount;
    delete updates.totalLikesCount;

    let user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true }
    ).select('-password -twoFactorSecret');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Apply lazy defaults to updated user
    user = applyUserDefaults(user);

    res.json(serializeUser(user));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get user's followers list
 */
exports.getUserFollowers = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, skip = 0 } = req.query;

    // Get follower user IDs first
    const followIds = await Follow.find({ following: userId }).select('follower');
    const followerIds = followIds.map(f => f.follower);

    const followers = await User.find({ _id: { $in: followerIds } })
      .select('-password -twoFactorSecret')
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const serializedFollowers = followers
      .map(user => applyUserDefaults(user))
      .map(user => serializeUser(user));

    res.json(serializedFollowers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// POST CONTROLLERS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Get single post
 */
exports.getPost = async (req, res) => {
  try {
    const { postId } = req.params;

    let post = await Post.findById(postId).lean();

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Apply lazy defaults (sets location, visibility, count fields)
    post = applyPostDefaults(post);

    res.json(serializePost(post));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * List posts (feed, search, user timeline, etc.)
 */
exports.listPosts = async (req, res) => {
  try {
    const { limit = 20, skip = 0 } = req.query;

    const posts = await Post.find({ isDeleted: { $ne: true } })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    // Apply lazy defaults to all posts and serialize
    const serializedPosts = posts
      .map(post => applyPostDefaults(post))
      .map(post => serializePost(post));

    res.json(serializedPosts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Create post
 * Ensures new post has all required fields with proper defaults
 */
exports.createPost = async (req, res) => {
  try {
    const { caption, media } = req.body;
    const userId = req.user._id;

    const newPost = new Post({
      user: userId,
      caption,
      media,
      // These will be set by schema defaults or lazy defaults
      isDeleted: false,
      hashtags: [],
      visibility: 'public',
      location: null,
      likesCount: 0,
      commentsCount: 0,
    });

    let savedPost = await newPost.save();
    savedPost = savedPost.toObject();

    // Apply lazy defaults
    savedPost = applyPostDefaults(savedPost);

    res.status(201).json(serializePost(savedPost));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update post
 */
exports.updatePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const updates = req.body;

    // Don't allow direct updates to computed fields
    delete updates.likesCount;
    delete updates.commentsCount;

    let post = await Post.findByIdAndUpdate(
      postId,
      { $set: updates },
      { new: true }
    );

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Apply lazy defaults to updated post
    post = applyPostDefaults(post.toObject());

    res.json(serializePost(post));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get user's posts (with lazy defaults)
 */
exports.getUserPosts = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, skip = 0 } = req.query;

    const posts = await Post.find({
      user: userId,
      isDeleted: { $ne: true }
    })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const serializedPosts = posts
      .map(post => applyPostDefaults(post))
      .map(post => serializePost(post));

    res.json(serializedPosts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Search posts (feed algorithm, hashtags, etc.)
 */
exports.searchPosts = async (req, res) => {
  try {
    const { q, limit = 20, skip = 0 } = req.query;

    const posts = await Post.find({
      $or: [
        { caption: { $regex: q, $options: 'i' } },
        { hashtags: { $regex: q, $options: 'i' } }
      ],
      isDeleted: { $ne: true }
    })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const serializedPosts = posts
      .map(post => applyPostDefaults(post))
      .map(post => serializePost(post));

    res.json(serializedPosts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// AGGREGATION PIPELINES WITH LAZY DEFAULTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Get user with stats (complex aggregation)
 * Shows how to handle lazy defaults in aggregation contexts
 */
exports.getUserWithStats = async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await User.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(userId) } },
      {
        $lookup: {
          from: 'posts',
          localField: '_id',
          foreignField: 'user',
          as: 'posts'
        }
      },
      {
        $lookup: {
          from: 'follows',
          let: { userId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$following', '$$userId'] }, status: 'accepted' } }
          ],
          as: 'followers'
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          username: 1,
          profilePicture: 1,
          bio: 1,
          followersCount: { $size: '$followers' },
          postsCount: { $size: '$posts' },
          // Other fields...
          password: 0,
          twoFactorSecret: 0
        }
      }
    ]);

    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    let user = result[0];

    // Apply lazy defaults
    user = applyUserDefaults(user);

    res.json(serializeUser(user));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get user feed with enriched posts
 * Complex aggregation with lazy defaults
 */
exports.getUserFeed = async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit = 20, skip = 0 } = req.query;

    const feed = await Post.aggregate([
      {
        $match: {
          isDeleted: { $ne: true }
          // Add visibility and follow checks as needed
        }
      },
      { $sort: { createdAt: -1 } },
      { $skip: parseInt(skip) },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'author'
        }
      },
      { $unwind: '$author' },
      {
        $lookup: {
          from: 'likes',
          let: { postId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$target', '$$postId'] }, targetType: 'post' } }
          ],
          as: 'likes'
        }
      },
      {
        $project: {
          _id: 1,
          caption: 1,
          media: 1,
          visibility: { $ifNull: ['$visibility', 'public'] },
          location: { $ifNull: ['$location', null] },
          likesCount: { $size: '$likes' },
          commentsCount: 1,
          sharesCount: { $ifNull: ['$sharesCount', 0] },
          viewsCount: { $ifNull: ['$viewsCount', 0] },
          author: {
            _id: '$author._id',
            name: '$author.name',
            username: '$author.username',
            profilePicture: '$author.profilePicture',
          },
          createdAt: 1
        }
      }
    ]);

    // Apply lazy defaults to all feed posts
    const enrichedFeed = feed
      .map(post => applyPostDefaults(post))
      .map(post => serializePost(post));

    res.json(enrichedFeed);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// BATCH OPERATIONS WITH LAZY DEFAULTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Bulk get users by IDs
 * Efficient for loading multiple users
 */
exports.getBulkUsers = async (req, res) => {
  try {
    const { ids } = req.body; // Array of user IDs

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid IDs array' });
    }

    const users = await User.find({ _id: { $in: ids } })
      .select('-password -twoFactorSecret')
      .lean();

    const serializedUsers = users
      .map(user => applyUserDefaults(user))
      .map(user => serializeUser(user));

    res.json(serializedUsers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Search and filter users
 * Shows how to apply defaults in filtered results
 */
exports.filterUsers = async (req, res) => {
  try {
    const { search, isVerified, isPrivate, limit = 20 } = req.query;

    const filter = { isDeleted: { $ne: true } };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } }
      ];
    }

    if (isVerified !== undefined) {
      filter.isVerified = isVerified === 'true';
    }

    if (isPrivate !== undefined) {
      filter.isPrivate = isPrivate === 'true';
    }

    const users = await User.find(filter)
      .select('-password -twoFactorSecret')
      .limit(parseInt(limit))
      .lean();

    const serializedUsers = users
      .map(user => applyUserDefaults(user))
      .map(user => serializeUser(user));

    res.json(serializedUsers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = exports;
