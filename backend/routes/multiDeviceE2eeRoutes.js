const express = require('express');
const router = express.Router();
const multiDeviceE2EEController = require('../controllers/multiDeviceE2EEController');
const { protect } = require('../middleware/auth');

/**
 * 🔐 MULTI-DEVICE E2EE ROUTES
 */

// Device Registration & Management
router.post('/register-device', protect, multiDeviceE2EEController.registerDevice);
router.get('/devices', protect, multiDeviceE2EEController.getDevices);
router.post('/devices/:deviceId/trust', protect, multiDeviceE2EEController.trustDevice);
router.post('/devices/:deviceId/revoke', protect, multiDeviceE2EEController.revokeDevice);
router.post('/devices/:deviceId/rotate-key', protect, multiDeviceE2EEController.rotateDeviceKey);

// Public Key Management
router.get('/user-public-keys/:userId', protect, multiDeviceE2EEController.getUserPublicKeys);

// Encrypted Messaging
router.post('/send-encrypted-message', protect, multiDeviceE2EEController.sendEncryptedMessage);
router.get('/messages', protect, multiDeviceE2EEController.getEncryptedMessages);
router.post('/messages/:messageId/acknowledge', protect, multiDeviceE2EEController.acknowledgeMessageDelivery);

// Security Info
router.get('/security-info', protect, multiDeviceE2EEController.getSecurityInfo);

module.exports = router;
