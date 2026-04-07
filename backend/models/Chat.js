const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
    convoType: {
        type: String,
        enum: ['direct', 'group'],
        default: 'direct'
    },
    // Participants array with metadata
    participants: [
        {
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true
            },
            role: {
                type: String,
                enum: ['admin', 'moderator', 'member'],
                default: 'member'
            },
            joinedAt: {
                type: Date,
                default: Date.now
            },
            lastReadMsgId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Message',
                default: null
            }
        }
    ],
    groupName: {
        type: String
    },
    groupAvatar: {
        type: {
            public_id: String,
            secure_url: String,
            resource_type: String,
            version: Number
        },
        default: null
    },
    // ✅ FIX: Removed redundant admins[] array - use participants[].role instead
    // Admin status is stored in participants[].role = 'admin'
    // Single source of truth prevents sync issues between admins[] and participants[].role
    
    // Last message for preview
    lastMessage: {
        text: String,
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        msgType: String,
        createdAt: Date
    },
    // Last activity timestamp for sorting
    lastActivityTimestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// ✅ PRODUCTION INDEXES
// Efficient participant lookup for both direct and group chats
chatSchema.index({ 'participants.user': 1, createdAt: -1 });
// Direct chat lookup (unique pair of participants)
chatSchema.index({ participants: 1 }, { 
    unique: false, // Allow duplicates for group chats
    partialFilterExpression: { 
        convoType: 'direct',
        'participants': { $size: 2 }
    }
});
// Last activity sorting
chatSchema.index({ lastActivityTimestamp: -1 });

module.exports = mongoose.model('Chat', chatSchema);

