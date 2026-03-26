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
    // S3 object key — needed to delete the file from S3 when the message is removed
    mediaKey: {
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
    status: {
        type: String,
        enum: ['sending', 'sent', 'failed'],
        default: 'sent'
    },
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
        // S3 object key for this attachment — enables targeted deletion
        key: {
            type: String
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
    }],
    // E2EE Fields
    encryptedBody: {
        type: String  // base64 encrypted message
    },
    nonce: {
        type: String  // base64 nonce (24 bytes)
    }
}, {

    timestamps: true
});

// ✅ PRODUCTION INDEXES - Critical for chat pagination performance
messageSchema.index({ chat: 1, createdAt: -1 });           // Primary chat timeline (chatId)
messageSchema.index({ chatId: 1, createdAt: -1 });           // Additional chat timeline index
messageSchema.index({ sender: 1, createdAt: -1 });         // User message history  
messageSchema.index({ chat: 1, 'readBy.user': 1 });        // Read receipts queries
messageSchema.index({ chat: 1, quotedMsgId: 1 });          // Quote lookups
messageSchema.index({ unsentAt: 1 });                      // Cleanup unsent msgs

module.exports = mongoose.model('Message', messageSchema);
