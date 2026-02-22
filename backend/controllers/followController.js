const Follow = require('../models/Follow');
const User = require('../models/User');

// @desc    Follow a user
// @route   POST /api/follow/:userId
// @access  Private
const followUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    // Check if user exists
    const userToFollow = await User.findById(userId);
    if (!userToFollow) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if already following
    const existingFollow = await Follow.findOne({
      follower: currentUserId,
      following: userId
    });

    if (existingFollow) {
      return res.status(400).json({ message: 'Already following this user' });
    }

    // Create follow relationship
    await Follow.create({
      follower: currentUserId,
      following: userId
    });

    res.status(201).json({ message: 'User followed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error: could not follow user', error: error.message });
  }
};

// @desc    Unfollow a user
// @route   DELETE /api/follow/:userId
// @access  Private
const unfollowUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    const follow = await Follow.findOneAndDelete({
      follower: currentUserId,
      following: userId
    });

    if (!follow) {
      return res.status(400).json({ message: 'Not following this user' });
    }

    res.json({ message: 'User unfollowed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error: could not unfollow user', error: error.message });
  }
};

// @desc    Get followers of a user
// @route   GET /api/follow/:userId/followers
// @access  Private
const getFollowers = async (req, res) => {
  try {
    const { userId } = req.params;

    const followers = await Follow.find({ following: userId })
      .populate('follower', 'name username profilePicture')
      .sort({ createdAt: -1 });

    res.json({
      followers: followers.map(f => f.follower),
      count: followers.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error: could not fetch followers', error: error.message });
  }
};

// @desc    Get users that a user is following
// @route   GET /api/follow/:userId/following
// @access  Private
const getFollowing = async (req, res) => {
  try {
    const { userId } = req.params;

    const following = await Follow.find({ follower: userId })
      .populate('following', 'name username profilePicture')
      .sort({ createdAt: -1 });

    res.json({
      following: following.map(f => f.following),
      count: following.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error: could not fetch following', error: error.message });
  }
};

// @desc    Check if current user is following another user
// @route   GET /api/follow/:userId/check
// @access  Private
const checkFollowStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    const follow = await Follow.findOne({
      follower: currentUserId,
      following: userId
    });

    res.json({ isFollowing: !!follow });
  } catch (error) {
    res.status(500).json({ message: 'Server error: could not check follow status', error: error.message });
  }
};

module.exports = {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  checkFollowStatus
};
