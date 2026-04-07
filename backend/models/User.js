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
        type: {
            public_id: String,
            secure_url: String,
            resource_type: String,
            version: Number
        },
        default: null
    },

    profilePublicId: {
        type: String,
        default: null
    },

    coverPhoto: {
        type: String,
        default: ''
    },

    coverPublicId: {
        type: String,
        default: null
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

    isPrivate: {
        type: Boolean,
        default: false
    },

    isVerified: {
        type: Boolean,
        default: false
    },

    accountStatus: {
        type: String,
        enum: ['active', 'suspended', 'deleted'],
        default: 'active'
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

    totalLikes: {
        type: Number,
        default: 0
    },

    // 🔐 End-to-End Encryption Public Key
    // Used for E2EE - base64 encoded curve25519 public key (32 bytes)
    encryptionPublicKey: {
        type: String,
        default: null,
        select: true
    },

    // 🔐 Two-Factor Authentication
    isTwoFactorEnabled: {
        type: Boolean,
        default: false
    },

    twoFactorSecret: {
        type: String,
        default: null,
        select: false
    },

    // 🔑 Refresh Tokens for Multi-Device Support
    refreshTokens: [
        {
            token: {
                type: String,
                required: true
            },
            deviceId: {
                type: String,
                default: 'unknown'
            },
            ipAddress: {
                type: String,
                default: null
            },
            userAgent: {
                type: String,
                default: null
            },
            expiresAt: {
                type: Date,
                required: true
            },
            createdAt: {
                type: Date,
                default: Date.now
            }
        }
    ]
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