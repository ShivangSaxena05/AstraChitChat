const mongoose = require('mongoose');
const crypto = require('crypto');

const refreshTokenSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    tokenHash: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    deviceId: {
        type: String,
        required: true
    },
    deviceName: {
        type: String
    },
    ipAddress: {
        type: String
    },
    expiresAt: {
        type: Date,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// TTL index - automatically delete documents after expiration
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Hash token before saving
refreshTokenSchema.methods.hashToken = function(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
};

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
