const crypto = require('crypto');
const User = require('../models/User');
const Device = require('../models/Device');
const Message = require('../models/Message');
const asyncHandler = require('./asyncHandler');
const encryptionService = require('../services/encryptionService');

/**
 * 🔐 MULTI-DEVICE E2EE CONTROLLER
 * Handles device registration, key management, and multi-device encryption
 */

/**
 * Register a new device for E2EE
 * POST /api/e2ee/register-device
 */
exports.registerDevice = asyncHandler(async (req, res) => {
    const { deviceId, deviceName, deviceType, publicKey, userAgent, osName, osVersion } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!deviceId || !publicKey) {
        return res.status(400).json({ success: false, message: 'deviceId and publicKey are required' });
    }

    // Prevent duplicate device registration
    const existingDevice = await Device.findOne({ deviceId });
    if (existingDevice && existingDevice.userId.toString() !== userId) {
        return res.status(400).json({
            success: false,
            message: 'Device ID already registered to another account'
        });
    }

    try {
        // Generate public key fingerprint for verification
        const publicKeyFingerprint = crypto
            .createHash('sha256')
            .update(publicKey)
            .digest('hex')
            .substring(0, 16);

        let device = existingDevice;

        if (!device) {
            // Create new device
            device = await Device.create({
                userId,
                deviceId,
                deviceName: deviceName || 'My Device',
                deviceType: deviceType || 'web',
                publicKey,
                publicKeyFingerprint,
                userAgent,
                osName,
                osVersion,
                isActive: true,
                isTrusted: false
            });
        } else {
            // Update existing device
            device.publicKey = publicKey;
            device.publicKeyFingerprint = publicKeyFingerprint;
            device.isActive = true;
            device.lastSeen = new Date();
            if (userAgent) device.userAgent = userAgent;
            if (osName) device.osName = osName;
            if (osVersion) device.osVersion = osVersion;
            await device.save();
        }

        // Add device to user's encryptionDevices array if not already there
        const user = await User.findById(userId);
        const deviceIndex = user.encryptionDevices.findIndex(d => d.deviceId === deviceId);

        if (deviceIndex === -1) {
            user.encryptionDevices.push({
                deviceId,
                deviceName: deviceName || 'My Device',
                publicKey,
                publicKeyFingerprint,
                deviceType: deviceType || 'web',
                isActive: true,
                lastSeen: new Date(),
                ipAddress: req.ip,
                userAgent
            });
        } else {
            user.encryptionDevices[deviceIndex].publicKey = publicKey;
            user.encryptionDevices[deviceIndex].lastSeen = new Date();
            user.encryptionDevices[deviceIndex].isActive = true;
        }

        await user.save();

        res.status(201).json({
            success: true,
            message: 'Device registered successfully',
            device: {
                deviceId: device.deviceId,
                deviceName: device.deviceName,
                publicKeyFingerprint: device.publicKeyFingerprint,
                isTrusted: device.isTrusted,
                createdAt: device.createdAt
            }
        });
    } catch (error) {
        console.error('Device registration error:', error);
        res.status(500).json({ success: false, message: 'Failed to register device', error: error.message });
    }
});

/**
 * Get all devices for current user
 * GET /api/e2ee/devices
 */
exports.getDevices = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const devices = await Device.find({ userId, isActive: true })
        .select('-publicKey -sessionEncryptionKey')
        .sort({ lastSeen: -1 });

    res.status(200).json({
        success: true,
        count: devices.length,
        devices
    });
});

/**
 * Trust a device (mark as safe/verified)
 * POST /api/e2ee/devices/:deviceId/trust
 */
exports.trustDevice = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { deviceId } = req.params;

    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
        return res.status(404).json({ success: false, message: 'Device not found' });
    }

    device.isTrusted = true;
    await device.save();

    // Add to user's trusted devices
    const user = await User.findById(userId);
    const trustedDevice = user.trustedDevices.find(d => d.deviceId === deviceId);
    if (!trustedDevice) {
        user.trustedDevices.push({
            deviceId,
            approvedAt: new Date(),
            approvedBy: req.ip
        });
        await user.save();
    }

    res.status(200).json({
        success: true,
        message: 'Device trusted successfully',
        device: {
            deviceId: device.deviceId,
            deviceName: device.deviceName,
            isTrusted: device.isTrusted
        }
    });
});

/**
 * Revoke device access
 * POST /api/e2ee/devices/:deviceId/revoke
 */
exports.revokeDevice = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { deviceId } = req.params;

    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
        return res.status(404).json({ success: false, message: 'Device not found' });
    }

    await device.revokeAccess();

    // Also remove from user's device list
    const user = await User.findById(userId);
    user.encryptionDevices = user.encryptionDevices.filter(d => d.deviceId !== deviceId);
    await user.save();

    res.status(200).json({
        success: true,
        message: 'Device access revoked successfully'
    });
});

/**
 * Rotate encryption keys for a device
 * POST /api/e2ee/devices/:deviceId/rotate-key
 */
exports.rotateDeviceKey = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { deviceId } = req.params;
    const { newPublicKey, reason } = req.body;

    if (!newPublicKey) {
        return res.status(400).json({ success: false, message: 'newPublicKey is required' });
    }

    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
        return res.status(404).json({ success: false, message: 'Device not found' });
    }

    const oldFingerprint = device.publicKeyFingerprint;
    const newFingerprint = crypto
        .createHash('sha256')
        .update(newPublicKey)
        .digest('hex')
        .substring(0, 16);

    // Store key rotation history
    const user = await User.findById(userId);
    user.keyRotationHistory.push({
        oldPublicKeyFingerprint: oldFingerprint,
        newPublicKeyFingerprint: newFingerprint,
        rotatedAt: new Date(),
        rotationReason: reason || 'routine'
    });

    // Update device key
    device.publicKey = newPublicKey;
    device.publicKeyFingerprint = newFingerprint;
    device.lastKeyRotation = new Date();
    await device.save();

    // Update user's device list
    const deviceIndex = user.encryptionDevices.findIndex(d => d.deviceId === deviceId);
    if (deviceIndex !== -1) {
        user.encryptionDevices[deviceIndex].publicKey = newPublicKey;
        user.encryptionDevices[deviceIndex].publicKeyFingerprint = newFingerprint;
    }
    await user.save();

    res.status(200).json({
        success: true,
        message: 'Key rotated successfully',
        fingerprint: newFingerprint
    });
});

/**
 * Get encrypted keys for sending to other devices
 * GET /api/e2ee/user-public-keys/:userId
 */
exports.getUserPublicKeys = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Get all active devices for this user
    const devices = await Device.find({ userId, isActive: true })
        .select('deviceId deviceName publicKey publicKeyFingerprint deviceType lastSeen');

    res.status(200).json({
        success: true,
        userId,
        devices: devices.map(d => ({
            deviceId: d.deviceId,
            deviceName: d.deviceName,
            publicKey: d.publicKey,
            publicKeyFingerprint: d.publicKeyFingerprint,
            deviceType: d.deviceType,
            lastSeen: d.lastSeen
        }))
    });
});

/**
 * Send encrypted message to all recipient's devices
 * POST /api/e2ee/send-encrypted-message
 */
exports.sendEncryptedMessage = asyncHandler(async (req, res) => {
    const { recipientId, encryptedContent, senderDeviceId } = req.body;
    const senderId = req.user.id;

    if (!recipientId || !encryptedContent || !senderDeviceId) {
        return res.status(400).json({
            success: false,
            message: 'recipientId, encryptedContent, and senderDeviceId are required'
        });
    }

    // Verify sender device is registered
    const senderDevice = await Device.findOne({ deviceId: senderDeviceId, userId: senderId });
    if (!senderDevice) {
        return res.status(404).json({ success: false, message: 'Sender device not found' });
    }

    // Get all recipient's active devices
    const recipientDevices = await Device.find({ userId: recipientId, isActive: true });
    if (recipientDevices.length === 0) {
        return res.status(404).json({ success: false, message: 'Recipient has no active devices' });
    }

    // Store message with device information
    const message = await Message.create({
        sender: senderId,
        recipient: recipientId,
        encryptedContent,
        senderDeviceId,
        recipientDeviceIds: recipientDevices.map(d => d.deviceId),
        isEncrypted: true,
        encryptionVersion: 1
    });

    res.status(201).json({
        success: true,
        message: 'Message sent to all recipient devices',
        messageId: message._id,
        deliveredToDevices: recipientDevices.length,
        devices: recipientDevices.map(d => ({
            deviceId: d.deviceId,
            deviceName: d.deviceName
        }))
    });
});

/**
 * Get encrypted messages for current device
 * GET /api/e2ee/messages
 */
exports.getEncryptedMessages = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { deviceId } = req.query;

    if (!deviceId) {
        return res.status(400).json({ success: false, message: 'deviceId query parameter is required' });
    }

    // Verify device belongs to user
    const device = await Device.findOne({ deviceId, userId });
    if (!device) {
        return res.status(404).json({ success: false, message: 'Device not found' });
    }

    // Get messages for this device
    const messages = await Message.find({
        $or: [
            { recipient: userId, recipientDeviceIds: deviceId },
            { sender: userId, senderDeviceId: deviceId }
        ],
        isEncrypted: true
    })
        .populate('sender', 'name username profilePicture')
        .populate('recipient', 'name username profilePicture')
        .sort({ createdAt: -1 })
        .limit(50);

    res.status(200).json({
        success: true,
        count: messages.length,
        messages
    });
});

/**
 * Acknowledge message delivery on a device
 * POST /api/e2ee/messages/:messageId/acknowledge
 */
exports.acknowledgeMessageDelivery = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { deviceId } = req.body;
    const userId = req.user.id;

    if (!deviceId) {
        return res.status(400).json({ success: false, message: 'deviceId is required' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
        return res.status(404).json({ success: false, message: 'Message not found' });
    }

    // Record delivery receipt
    await MessageReceipt.create({
        message: messageId,
        receiver: userId,
        deviceId,
        status: 'delivered'
    });

    res.status(200).json({
        success: true,
        message: 'Delivery acknowledged'
    });
});

/**
 * Get device security info
 * GET /api/e2ee/security-info
 */
exports.getSecurityInfo = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const user = await User.findById(userId);

    res.status(200).json({
        success: true,
        security: {
            devicesCount: user.encryptionDevices.length,
            trustedDevicesCount: user.trustedDevices.length,
            keyRotations: user.keyRotationHistory.length,
            lastKeyRotation: user.keyRotationHistory[user.keyRotationHistory.length - 1]?.rotatedAt || null
        }
    });
});

module.exports = {
    registerDevice: exports.registerDevice,
    getDevices: exports.getDevices,
    trustDevice: exports.trustDevice,
    revokeDevice: exports.revokeDevice,
    rotateDeviceKey: exports.rotateDeviceKey,
    getUserPublicKeys: exports.getUserPublicKeys,
    sendEncryptedMessage: exports.sendEncryptedMessage,
    getEncryptedMessages: exports.getEncryptedMessages,
    acknowledgeMessageDelivery: exports.acknowledgeMessageDelivery,
    getSecurityInfo: exports.getSecurityInfo
};
