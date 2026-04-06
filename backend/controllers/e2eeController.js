/**
 * E2EE Key Management Controller
 * Handles public key registration, retrieval, and rotation
 */

const User = require('../models/User');
const asyncHandler = require('./asyncHandler');
const { createKeyFingerprint, exportPublicKey } = require('../services/encryptionService');

/**
 * Register or update user's public key
 * Client generates keypair and sends public key to server
 * Private key NEVER sent to server
 */
const registerPublicKey = asyncHandler(async (req, res) => {
    try {
        const { publicKey } = req.body;
        const userId = req.user._id;

        if (!publicKey || typeof publicKey !== 'string') {
            return res.status(400).json({ message: 'Invalid public key format' });
        }

        // Validate base64 format
        try {
            Buffer.from(publicKey, 'base64');
        } catch (error) {
            return res.status(400).json({ message: 'Public key must be valid base64' });
        }

        // Update user's public key
        const user = await User.findByIdAndUpdate(
            userId,
            { encryptionPublicKey: publicKey },
            { new: true, runValidators: true }
        ).select('-password -twoFactorSecret');

        // Create fingerprint for verification
        const fingerprint = await createKeyFingerprint(publicKey);

        res.json({
            message: 'Public key registered successfully',
            user: user,
            fingerprint: fingerprint,
            keyRegisteredAt: new Date()
        });

        res.status(201).json({
            message: 'Public key registered successfully',
            keyFingerprint: createKeyFingerprint(publicKey)
        });
    } catch (error) {
        console.error('registerPublicKey error:', error);
        throw error;
    }
});

/**
 * Get user's public key by username or user ID
 * Used for key exchange before encryption
 */
const getPublicKey = asyncHandler(async (req, res) => {
    try {
        const { userId } = req.params;
        
        let user;
        if (userId.match(/^[0-9a-fA-F]{24}$/)) {
            // MongoDB ObjectId format
            user = await User.findById(userId).select('_id name username encryptionPublicKey');
        } else {
            // Assume username
            user = await User.findOne({ username: userId.toLowerCase() })
                .select('_id name username encryptionPublicKey');
        }

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!user.encryptionPublicKey) {
            return res.status(404).json({ 
                message: 'User has not registered an encryption key. They may not support E2EE yet.' 
            });
        }

        const fingerprint = await createKeyFingerprint(user.encryptionPublicKey);

        res.json({
            userId: user._id,
            username: user.username,
            name: user.name,
            publicKey: user.encryptionPublicKey,
            fingerprint: fingerprint,
            algorithm: 'curve25519',
            format: 'base64'
        });
    } catch (error) {
        console.error('getPublicKey error:', error);
        throw error;
    }
});

/**
 * Get current user's own public key
 * Used for client-side verification
 */
const getOwnPublicKey = asyncHandler(async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('encryptionPublicKey');

        if (!user.encryptionPublicKey) {
            return res.status(404).json({ 
                message: 'No encryption key found. Please initialize E2EE on your client.' 
            });
        }

        const fingerprint = await createKeyFingerprint(user.encryptionPublicKey);

        res.json({
            publicKey: user.encryptionPublicKey,
            fingerprint: fingerprint,
            algorithm: 'curve25519'
        });
    } catch (error) {
        console.error('getOwnPublicKey error:', error);
        throw error;
    }
});

/**
 * Rotate user's encryption keypair
 * Should be done periodically or after security concerns
 */
const rotatePublicKey = asyncHandler(async (req, res) => {
    const { newPublicKey } = req.body;
    const userId = req.user._id;

    if (!newPublicKey || typeof newPublicKey !== 'string') {
        return res.status(400).json({ message: 'Invalid new public key format' });
    }

    // Validate base64
    try {
        Buffer.from(newPublicKey, 'base64');
    } catch (error) {
        return res.status(400).json({ message: 'Public key must be valid base64' });
    }

    const user = await User.findByIdAndUpdate(
        userId,
        { 
            encryptionPublicKey: newPublicKey,
            updatedAt: new Date()
        },
        { new: true, runValidators: true }
    ).select('-password -twoFactorSecret');

    const fingerprint = createKeyFingerprint(newPublicKey);

    res.json({
        message: 'Public key rotated successfully',
        user: user,
        fingerprint: fingerprint,
        keyRotatedAt: new Date()
    });
});

/**
 * Check if a user supports E2EE
 * Useful for client to determine if encryption should be used
 */
const checkE2EESupport = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    let user;
    if (userId.match(/^[0-9a-fA-F]{24}$/)) {
        user = await User.findById(userId).select('encryptionPublicKey');
    } else {
        user = await User.findOne({ username: userId.toLowerCase() })
            .select('encryptionPublicKey');
    }

    if (!user) {
        return res.status(404).json({ message: 'User not found' });
    }

    res.json({
        supportsE2EE: !!user.encryptionPublicKey
    });
});

module.exports = {
    registerPublicKey,
    getPublicKey,
    getOwnPublicKey,
    rotatePublicKey,
    checkE2EESupport
};
