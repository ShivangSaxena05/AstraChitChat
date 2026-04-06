const mongoose = require('mongoose');

const feedSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    post: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        required: true
    },
    postAuthor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    score: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// TTL index - automatically delete documents after 7 days
feedSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });

// Index for efficient feed queries
feedSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Feed', feedSchema);
