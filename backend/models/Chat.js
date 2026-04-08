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
    
    // ✅ FIX (Bug #6): Track unread count per participant for persistence
    unreadCounts: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        count: {
            type: Number,
            default: 0,
            min: 0
        }
    }],
    
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

// ✅ FIX (Bug #5): Pre-save validation to enforce new participant format
// Rejects any chats trying to save with old format (raw ObjectId)
chatSchema.pre('save', function(next) {
    if (Array.isArray(this.participants)) {
        for (let i = 0; i < this.participants.length; i++) {
            const p = this.participants[i];
            
            // Check if participant is in old format (raw ObjectId)
            if (mongoose.Types.ObjectId.isValid(p) || (typeof p === 'string' && p.match(/^[0-9a-f]{24}$/i))) {
                const error = new Error(
                    `[BUG #5] Chat cannot save with old format participants. ` +
                    `Run migration script: node backend/scripts/migrateParticipantsFormat.js`
                );
                return next(error);
            }
            
            // Validate new format
            if (p && typeof p === 'object') {
                if (!p.user) {
                    const error = new Error(`Participant at index ${i} missing 'user' field`);
                    return next(error);
                }
                if (!mongoose.Types.ObjectId.isValid(p.user)) {
                    const error = new Error(`Participant at index ${i} has invalid 'user' ObjectId`);
                    return next(error);
                }
            }
        }
    }
    next();
});

module.exports = mongoose.model('Chat', chatSchema);

