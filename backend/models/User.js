const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
{
    name: {
        type: String,
        required: [true, 'Please add a name'],
        trim: true,
        maxlength: 50
    },

    username: {
        type: String,
        unique: true,
        lowercase: true,
        trim: true,
        minlength: 3,
        maxlength: 30,
        index: true
    },

    email: {
        type: String,
        required: [true, 'Please add an email'],
        unique: true,
        lowercase: true,
        trim: true,
        // FIX: More permissive regex that accepts modern email formats
        // Supports: plus addressing, multiple digits, TLDs of any length
        match: [
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            'Please add a valid email'
        ]
    },

    password: {
        type: String,
        required: [true, 'Please add a password'],
        minlength: 6,
        select: false
    },

    profilePicture: {
        type: String,
        default: 'https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg'
    },

    coverPhoto: {
        type: String,
        default: ''
    },

    bio: {
        type: String,
        maxlength: 500,
        default: ''
    },

    location: {
        type: String,
        maxlength: 100,
        default: ''
    },

    website: {
        type: String,
        default: ''
    },

    pronouns: {
        type: String,
        maxlength: 20,
        default: ''
    },

    isOnline: {
        type: Boolean,
        default: false,
        index: true
    },

    lastSeen: {
        type: Date,
        default: null
    },

    blockedUsers: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    ],

    mutedUsers: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    ],

    isPrivate: {
        type: Boolean,
        default: false
    },

    followRequests: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    ],

    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },

    twoFactorSecret: {
        type: String,
        select: false
    },

    isTwoFactorEnabled: {
        type: Boolean,
        default: false
    },

    postsCount: {
        type: Number,
        default: 0
    },

    followersCount: {
        type: Number,
        default: 0
    },

    followingCount: {
        type: Number,
        default: 0
    },

    totalLikesCount: {
        type: Number,
        default: 0
    },

    encryptionPublicKey: {
        type: String,
        sparse: true
    }
},
{
    timestamps: true
}
);


// 🔐 Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});


// 🔑 Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};


// 🚀 Optional: Clean JSON response (remove sensitive fields)
userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.password;
    delete obj.twoFactorSecret;
    return obj;
};


module.exports = mongoose.model('User', userSchema);