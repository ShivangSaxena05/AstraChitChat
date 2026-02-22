const mongoose = require('mongoose');

const messageReceiptSchema = new mongoose.Schema({
    message: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        required: true
    },
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    deliveredAt: {
        type: Date
    },
    readAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Compound index for efficient queries
messageReceiptSchema.index({ message: 1, recipient: 1 }, { unique: true });

module.exports = mongoose.model('MessageReceipt', messageReceiptSchema);
