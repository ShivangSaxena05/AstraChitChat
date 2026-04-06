const mongoose = require('mongoose');

const pushTokenSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    token: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    platform: {
        type: String,
        enum: ['ios', 'android', 'web'],
        required: true
    },
    deviceId: {
        type: String,
        required: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('PushToken', pushTokenSchema);
