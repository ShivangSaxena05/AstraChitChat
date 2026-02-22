const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    reportedUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reason: {
        type: String,
        required: true,
        enum: ['harassment', 'spam', 'inappropriate_content', 'fake_account', 'other']
    },
    description: {
        type: String,
        maxlength: 500
    },
    status: {
        type: String,
        enum: ['pending', 'reviewed', 'resolved'],
        default: 'pending'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Report', reportSchema);
