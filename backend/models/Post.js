const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    caption: {
        type: String,
        trim: true
    },
    media: [
        {
            public_id: String,
            secure_url: String,
            resource_type: String,
            format: String,
            version: Number,
            width: Number,
            height: Number,
            duration: Number,
            thumbnail_url: String
        }
    ],
    likesCount: {
        type: Number,
        default: 0
    },
    commentsCount: {
        type: Number,
        default: 0
    },
    viewsCount: {
        type: Number,
        default: 0
    },
    sharesCount: {
        type: Number,
        default: 0
    },
    savedCount: {
        type: Number,
        default: 0
    },
    visibility: {
        type: String,
        enum: ['public', 'followers', 'private'],
        default: 'public'
    },
    location: {
        type: String,
        default: null
    },
    hashtags: [String],
    isDeleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// ✅ FIX: Add indexes for common queries to improve performance
postSchema.index({ author: 1, createdAt: -1 });        // For getFeedPosts filtering by author
postSchema.index({ createdAt: -1 });                   // For trending/newest posts
postSchema.index({ 'media.resource_type': 1 });       // For filtering videos/images
postSchema.index({ visibility: 1, createdAt: -1 });   // For public/follower filtering
postSchema.index({ likesCount: -1, createdAt: -1 });  // For trending by engagement

module.exports = mongoose.model('Post', postSchema);