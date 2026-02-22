const mongoose = require('mongoose');

const messageReactionSchema = new mongoose.Schema({
    message: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        required: true
    },
    reactor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    emoji: {
        type: String,
        required: true
    },
    reactedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Compound index for efficient queries and uniqueness
messageReactionSchema.index({ message: 1, reactor: 1, emoji: 1 }, { unique: true });

module.exports = mongoose.model('MessageReaction', messageReactionSchema);
