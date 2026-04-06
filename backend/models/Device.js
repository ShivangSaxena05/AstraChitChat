const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        deviceId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        deviceName: {
            type: String,
            default: 'Unknown Device'
        },

        deviceType: {
            type: String,
            enum: ['web', 'mobile', 'desktop', 'other'],
            default: 'web'
        },

        // 🔐 Public key for this device
        publicKey: {
            type: String,
            required: true
        },

        publicKeyFingerprint: {
            type: String,
            index: true,
            required: true
        },

        // Session info
        sessionToken: String,
        sessionTokenExpires: Date,

        // 📍 Device location & info
        ipAddress: String,
        userAgent: String,
        osName: String,
        osVersion: String,
        browserName: String,
        browserVersion: String,

        // Device status
        isActive: {
            type: Boolean,
            default: true,
            index: true
        },

        isTrusted: {
            type: Boolean,
            default: false
        },

        // Last activity tracking
        lastSeen: {
            type: Date,
            default: Date.now,
            index: true
        },

        lastActivity: {
            type: String,
            default: 'login'
        },

        createdAt: {
            type: Date,
            default: Date.now,
            index: true
        },

        // 🔐 Encryption key for this specific session
        sessionEncryptionKey: String, // Encrypted with device's public key

        // Device capabilities
        supportsE2EE: {
            type: Boolean,
            default: true
        },

        supportsPushNotifications: {
            type: Boolean,
            default: false
        },

        pushToken: String,

        // 🔐 Key rotation info
        keyRotationScheduled: Date,
        lastKeyRotation: Date
    },
    {
        timestamps: true
    }
);

// Index for finding active devices for a user
deviceSchema.index({ userId: 1, isActive: 1 });
deviceSchema.index({ userId: 1, isTrusted: 1 });

// Method to mark device as last seen
deviceSchema.methods.updateLastSeen = function (ipAddress, userAgent) {
    this.lastSeen = new Date();
    if (ipAddress) this.ipAddress = ipAddress;
    if (userAgent) this.userAgent = userAgent;
    return this.save();
};

// Method to trust a device
deviceSchema.methods.trustDevice = function () {
    this.isTrusted = true;
    return this.save();
};

// Method to revoke device access
deviceSchema.methods.revokeAccess = function () {
    this.isActive = false;
    this.sessionTokenExpires = new Date(); // Expire session immediately
    return this.save();
};

module.exports = mongoose.model('Device', deviceSchema);
