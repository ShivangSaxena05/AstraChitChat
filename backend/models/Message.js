const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    chat: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
        required: true
    },
    msgType: {
        type: String,
        enum: ['text', 'image', 'audio', 'video', 'file', 'system'],
        default: 'text'
    },
    bodyText: {
        type: String
    },
    mediaUrl: {
        type: String
    },
    mediaMime: {
        type: String
    },
    mediaSizeBytes: {
        type: Number
    },
    quotedMsgId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    editedAt: {
        type: Date
    },
    unsentAt: {
        type: Date
    },
    unsentBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    // Legacy fields for backward compatibility
    content: {
        type: String
    },
    chatType: {
        type: String,
        enum: ['text', 'image', 'voice note'],
        default: 'text'
    },
    read: {
        type: Boolean,
        default: false
    },
    readBy: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        readAt: {
            type: Date,
            default: Date.now
        }
    }],
    deliveredTo: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        deliveredAt: {
            type: Date,
            default: Date.now
        }
    }],
    reactions: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        emoji: {
            type: String,
            required: true
        },
        reactedAt: {
            type: Date,
            default: Date.now
        }
    }],
    attachments: [{
        type: {
            type: String,
            enum: ['image', 'video', 'audio', 'file'],
            required: true
        },
        url: {
            type: String,
            required: true
        },
        filename: {
            type: String
        },
        size: {
            type: Number
        },
        mimeType: {
            type: String
        }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('Message', messageSchema);
