const mongoose = require('mongoose');

const blockSchema = new mongoose.Schema({
    blocker: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    blocked: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Ensure a user can only block another user once
blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });

// Prevent self-blocking
blockSchema.pre('save', function(next) {
    if (this.blocker.toString() === this.blocked.toString()) {
        const error = new Error('Users cannot block themselves');
        return next(error);
    }
    next();
});

module.exports = mongoose.model('Block', blockSchema);
