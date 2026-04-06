const mongoose = require('mongoose');

const savedPostSchema = new mongoose.Schema({
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
    collectionName: {
        type: String,
        default: 'All'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Ensure a user can only save a post once per collection
savedPostSchema.index({ user: 1, post: 1, collectionName: 1 }, { unique: true });

module.exports = mongoose.model('SavedPost', savedPostSchema);
