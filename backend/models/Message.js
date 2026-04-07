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
    // ✅ FIX: Removed redundant 'content' field - use bodyText as single source of truth
    // Previously both bodyText and content stored identical message text
    // Now consolidating to bodyText only for cleaner schema
    
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
    // ✅ FIX: Reactions now stored in separate MessageReaction collection
    // (not in embedded array) for better analytics, indexing, and scalability
    // Query: MessageReaction.find({ message: messageId })
    // This keeps Message schema lean and allows efficient reaction analytics
    
    // ✅ FIX: Consolidated read-tracking to use embedded readBy array only
    // Previously had both readBy[] (embedded) and MessageReceipt collection
    // MessageReceipt is unused in main chat flow and creates sync issues
    // Using embedded readBy array for simplicity and consistency
    // Single source of truth: Message.readBy[{ user, readAt }]
    // Query by 'readBy.user' for unread message counts
    
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
