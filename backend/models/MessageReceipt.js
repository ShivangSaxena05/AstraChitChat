const mongoose = require('mongoose');

const messageReceiptSchema = new mongoose.Schema({
    message: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    deliveredAt: {
        type: Date,
        default: null
    },
    readAt: {
        type: Date,
        default: null
    }
});

// Ensure one receipt per user per message
messageReceiptSchema.index({ message: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('MessageReceipt', messageReceiptSchema);
