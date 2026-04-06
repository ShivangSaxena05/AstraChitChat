const User = require('../models/User');
const Post = require('../models/Post');

// @desc    Search users and posts
// @route   GET /api/search?q=query
// @access  Private
// FIX: now filters blocked users (both directions) consistent with userController.searchUsers
const searchAll = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const currentUserId = req.user._id;

    // Build blocked-user exclusion list (same logic as searchUsers)
    const currentUser = await User.findById(currentUserId).select('blockedUsers');
    const blockedUsers = currentUser?.blockedUsers || [];

    const usersWhoBlockedMe = await User.find({ blockedUsers: currentUserId }).select('_id');
    const blockedByIds = usersWhoBlockedMe.map(u => u._id);

    const excludedUsers = [...blockedUsers, ...blockedByIds, currentUserId];

    // Search users
    const users = await User.find({
      _id: { $nin: excludedUsers },
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
      ],
    })
      .select('username name profilePicture')
      .limit(10);

    // Sort so exact matches come first
    const lowerQ = q.toLowerCase();
    const exactMatch = [];
    const others = [];
    users.forEach(user => {
      if (
        user.username.toLowerCase() === lowerQ ||
        (user.name && user.name.toLowerCase() === lowerQ)
      ) {
        exactMatch.push(user);
      } else {
        others.push(user);
      }
    });
    const sortedUsers = [...exactMatch, ...others];

    // Search posts by caption
    const posts = await Post.find({
      caption: { $regex: q, $options: 'i' },
    })
      .populate('user', 'username name profilePicture')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    // Sanitize posts response to match feed endpoint format
    const sanitizedPosts = posts.map(post => ({
      _id: post._id || '',
      mediaUrl: post.mediaUrl || '',
      mediaType: post.mediaType || 'text',
      caption: post.caption || '',
      duration: post.duration || null,
      type: post.mediaType === 'video' ? 'video' : (post.mediaUrl ? 'photo' : 'text'),
      user: {
        _id: post.user?._id || '',
        username: post.user?.username || 'unknown',
        profilePicture: post.user?.profilePicture || ''
      },
      createdAt: post.createdAt?.toISOString() || new Date().toISOString(),
      likes: Array.isArray(post.likes) ? post.likes.length : 0,
      comments: Array.isArray(post.comments) ? post.comments.length : 0,
      hashtags: Array.isArray(post.hashtags) ? post.hashtags : []
    }));

    res.json({ 
      users: sortedUsers, 
      posts: sanitizedPosts,
      page: 1,
      hasMore: false,
      category: 'search'
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

module.exports = { searchAll };