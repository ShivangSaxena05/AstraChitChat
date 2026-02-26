const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    role: {
        type: String,
        enum: ['member', 'admin'],
        default: 'member'
    },
    joinedAt: {
        type: Date,
        default: Date.now
    },
    lastReadMsgId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    }
});

const chatSchema = new mongoose.Schema({
    convoType: {
        type: String,
        enum: ['direct', 'group'],
        default: 'direct'
    },
    title: {
        type: String
    },
    participants: [participantSchema],
    lastMessage: {
        text: String,
        createdAt: Date,
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    },
    // New field for efficient sorting (O(log n) instead of O(n))
    lastActivityTimestamp: {
        type: Date,
        index: true
    },
    // New field for pinned chats
    isPinnedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    unreadCount: {
        type: Map,
        of: Number,
        default: {}
    }
}, {
    timestamps: true
});

// Compound index for efficient chat list queries with sorting
chatSchema.index({ participants: 1, lastActivityTimestamp: -1 });

// Index for direct chat uniqueness
chatSchema.index({ participants: 1 }, { unique: true, partialFilterExpression: { convoType: 'direct', participants: { $size: 2 } } });

module.exports = mongoose.model('Chat', chatSchema);

