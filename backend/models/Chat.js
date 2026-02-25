const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
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
    unreadCount: {
        type: Map,
        of: Number,
        default: {}
    }
}, {
    timestamps: true
});

// Ensure only one direct chat between two users
chatSchema.index({ participants: 1 }, { unique: true, partialFilterExpression: { convoType: 'direct', participants: { $size: 2 } } });

module.exports = mongoose.model('Chat', chatSchema);
