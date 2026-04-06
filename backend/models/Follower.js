const mongoose = require('mongoose');

const followerSchema = new mongoose.Schema({
  follower: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  following: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['accepted', 'pending'],
    default: 'accepted'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure a user can't follow the same person twice
followerSchema.index({ follower: 1, following: 1 }, { unique: true });

// Prevent self-following
followerSchema.pre('save', function(next) {
  if (this.follower.toString() === this.following.toString()) {
    const error = new Error('Users cannot follow themselves');
    return next(error);
  }
  next();
});

module.exports = mongoose.model('Follower', followerSchema);
