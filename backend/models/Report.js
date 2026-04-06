const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    reporter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    targetType: {
        type: String,
        enum: ['post', 'comment', 'user', 'chat'],
        required: true
    },
    reason: {
        type: String,
        enum: ['spam', 'hate', 'nudity', 'violence'],
        required: true
    },
    note: {
        type: String,
        maxlength: 500
    },
    status: {
        type: String,
        enum: ['pending', 'reviewed', 'dismissed'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Report', reportSchema);
