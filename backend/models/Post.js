const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    caption: {
        type: String,
        trim: true
    },
    mediaUrl: {
        type: String,
        required: [true, 'Media URL is required']
    },
    mediaType: {
        type: String,
        enum: ['image', 'video', 'flick'],
        required: [true, 'Media type is required']
    },
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    comments: [{ // For simplicity now, store a basic comment object
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
    }],
    views: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Post', postSchema);