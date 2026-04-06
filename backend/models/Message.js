const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    chat: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    bodyText: {
        type: String
    },
    content: {
        type: String
    },
    msgType: {
        type: String,
        enum: ['text', 'image', 'video', 'file', 'audio'],
        default: 'text'
    },
    // Media attachments (replaces mediaUrl for flexibility)
    attachments: [
        {
            public_id: String,
            secure_url: String,
            resource_type: String,
            format: String,
            size: Number,
            original_name: String
        }
    ],
    // For message reactions - Fixed to match controller usage: { emoji, user, reactedAt }
    reactions: [
        {
            emoji: String,
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            reactedAt: {
                type: Date,
                default: Date.now
            }
        }
    ],
    // Message read receipts
    readBy: [
        {
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            readAt: {
                type: Date,
                default: Date.now
            }
        }
    ],
    // Message delivery receipts
    deliveredTo: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    ],
    // Quote/Reply functionality
    quotedMsgId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null
    },
    quotedMessage: {
        type: {
            _id: mongoose.Schema.Types.ObjectId,
            bodyText: String,
            msgType: String,
            sender: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }
        },
        default: null
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null
    },
    replyPreview: {
        type: {
            bodyText: String,
            msgType: String,
            sender: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }
        },
        default: null
    },
    // Message editing
    editedAt: {
        type: Date,
        default: null
    },
    // Message unsending
    unsentAt: {
        type: Date,
        default: null
    },
    unsentBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    // Soft delete
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedFor: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    ],
    // Encrypted message fields for end-to-end encryption
    encryptedBody: {
        type: String,
        default: null
    },
    nonce: {
        type: String,
        default: null
    },
    // Message status (sending, sent, delivered, read, failed)
    status: {
        type: String,
        enum: ['sending', 'sent', 'delivered', 'read', 'failed'],
        default: 'sent'
    }
}, {
    timestamps: true
});

// ✅ PRODUCTION INDEXES - Critical for chat pagination performance
messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ chat: 1, quotedMsgId: 1 });
messageSchema.index({ 'readBy.user': 1 });
messageSchema.index({ isDeleted: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
