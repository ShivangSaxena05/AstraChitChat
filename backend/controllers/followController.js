const Follow = require('../models/Follow');
const User = require('../models/User');
const { incrementStat, decrementStat } = require('../services/userStatsService');

// @desc    Follow a user
// @route   POST /api/follow/:userId
// @access  Private
const followUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    const userToFollow = await User.findById(userId);
    if (!userToFollow) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if already following
    const existingFollow = await Follow.findOne({
      follower: currentUserId,
      following: userId,
    });

    if (existingFollow) {
      return res.status(400).json({ message: 'Already following this user' });
    }

    // Private account: send or acknowledge pending follow request
    if (userToFollow.isPrivate) {
      const alreadyRequested = userToFollow.followRequests.some(
        id => id.toString() === currentUserId.toString()
      );
      if (!alreadyRequested) {
        userToFollow.followRequests.push(currentUserId);
        await userToFollow.save();
      }
      // Return consistent response whether request is new or already pending
      return res.status(200).json({ message: 'Follow request sent', isRequested: true });
    }

    await Follow.create({ follower: currentUserId, following: userId });

    // Update stats using UserStats service
    await Promise.all([
      incrementStat(currentUserId, 'followingCount', 1),
      incrementStat(userId, 'followersCount', 1),
    ]);

    // FIX: emit only to the affected users, not to everyone
    const io = req.app.get('io');
    if (io) {
      io.to(userId.toString()).emit('profileStatsUpdated', {
        userId,
        action: 'followersCountIncremented',
      });
      io.to(currentUserId.toString()).emit('profileStatsUpdated', {
        userId: currentUserId,
        action: 'followingCountIncremented',
      });
    }

    res.status(201).json({ message: 'User followed successfully', isFollowing: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error: could not follow user', error: error.message });
  }
};

// @desc    Unfollow a user (or cancel a pending follow request)
// @route   DELETE /api/follow/:userId
// @access  Private
const unfollowUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    const follow = await Follow.findOneAndDelete({
      follower: currentUserId,
      following: userId,
    });

    if (!follow) {
      // Cancel pending follow request if one exists
      const userToUnfollow = await User.findById(userId);
      if (
        userToUnfollow &&
        userToUnfollow.followRequests &&
        userToUnfollow.followRequests.some(id => id.toString() === currentUserId.toString())
      ) {
        userToUnfollow.followRequests = userToUnfollow.followRequests.filter(
          id => id.toString() !== currentUserId.toString()
        );
        await userToUnfollow.save();
        return res.json({ message: 'Follow request cancelled', isRequested: false });
      }

      return res.status(400).json({ message: 'Not following this user' });
    }

    // Update stats using UserStats service
    await Promise.all([
      decrementStat(currentUserId, 'followingCount', 1),
      decrementStat(userId, 'followersCount', 1),
    ]);

    // FIX: emit only to the affected users, not to everyone
    const io = req.app.get('io');
    if (io) {
      io.to(userId.toString()).emit('profileStatsUpdated', {
        userId,
        action: 'followersCountDecremented',
      });
      io.to(currentUserId.toString()).emit('profileStatsUpdated', {
        userId: currentUserId,
        action: 'followingCountDecremented',
      });
    }

    res.json({ message: 'User unfollowed successfully', isFollowing: false });
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
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const totalMatch = await Follow.countDocuments({ following: userId });

    const followers = await Follow.find({ following: userId })
      .populate('follower', 'name username profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      followers: followers.map(f => f.follower),
      count: totalMatch,
      hasMore: totalMatch > skip + followers.length,
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
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const totalMatch = await Follow.countDocuments({ follower: userId });

    const following = await Follow.find({ follower: userId })
      .populate('following', 'name username profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      following: following.map(f => f.following),
      count: totalMatch,
      hasMore: totalMatch > skip + following.length,
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

    const follow = await Follow.findOne({ follower: currentUserId, following: userId });

    const userToCheck = await User.findById(userId).select('followRequests');
    const isRequested = userToCheck?.followRequests?.some(
      id => id.toString() === currentUserId.toString()
    );

    res.json({ isFollowing: !!follow, isRequested: !!isRequested });
  } catch (error) {
    res.status(500).json({ message: 'Server error: could not check follow status', error: error.message });
  }
};

// @desc    Accept follow request
// @route   POST /api/follow/requests/:userId/accept
// @access  Private
const acceptFollowRequest = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    const currentUser = await User.findById(currentUserId);
    const hasRequest = currentUser.followRequests.some(
      id => id.toString() === userId.toString()
    );

    if (!hasRequest) {
      return res.status(400).json({ message: 'No follow request found from this user' });
    }

    currentUser.followRequests = currentUser.followRequests.filter(
      id => id.toString() !== userId.toString()
    );
    await currentUser.save();

    await Follow.create({ follower: userId, following: currentUserId });
    await User.findByIdAndUpdate(userId, { $inc: { followingCount: 1 } });
    await User.findByIdAndUpdate(currentUserId, { $inc: { followersCount: 1 } });

    res.json({ message: 'Follow request accepted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error: could not accept follow request', error: error.message });
  }
};

// @desc    Reject follow request
// @route   POST /api/follow/requests/:userId/reject
// @access  Private
const rejectFollowRequest = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    const currentUser = await User.findById(currentUserId);
    const hasRequest = currentUser.followRequests.some(
      id => id.toString() === userId.toString()
    );

    if (!hasRequest) {
      return res.status(400).json({ message: 'No follow request found from this user' });
    }

    currentUser.followRequests = currentUser.followRequests.filter(
      id => id.toString() !== userId.toString()
    );
    await currentUser.save();

    res.json({ message: 'Follow request rejected' });
  } catch (error) {
    res.status(500).json({ message: 'Server error: could not reject follow request', error: error.message });
  }
};

// @desc    Get pending follow requests
// @route   GET /api/follow/requests
// @access  Private
const getFollowRequests = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const currentUser = await User.findById(currentUserId)
      .populate('followRequests', 'name username profilePicture');

    res.json({ requests: currentUser.followRequests || [] });
  } catch (error) {
    res.status(500).json({ message: 'Server error: could not fetch follow requests', error: error.message });
  }
};

module.exports = {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  checkFollowStatus,
  acceptFollowRequest,
  rejectFollowRequest,
  getFollowRequests,
};