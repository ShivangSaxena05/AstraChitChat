/**
 * E2EE Key Management Routes
 * Endpoints for key exchange and management
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
    registerPublicKey,
    getPublicKey,
    getOwnPublicKey,
    rotatePublicKey,
    checkE2EESupport
} = require('../controllers/e2eeController');

// ✅ Authentication required for all E2EE routes

/**
 * POST /api/e2ee/register-key
 * Register user's public encryption key
 * Body: { publicKey: string (base64) }
 */
router.post('/register-key', protect, registerPublicKey);

/**
 * GET /api/e2ee/public-key
 * Get current user's public key
 */
router.get('/own-key', protect, getOwnPublicKey);

/**
 * GET /api/e2ee/public-key/:userId
 * Get another user's public key by ID or username
 * Params: userId (ObjectId or username)
 */
router.get('/public-key/:userId', protect, getPublicKey);

/**
 * POST /api/e2ee/rotate-key
 * Rotate user's encryption keypair
 * Body: { newPublicKey: string (base64) }
 */
router.post('/rotate-key', protect, rotatePublicKey);

/**
 * GET /api/e2ee/supports/:userId
 * Check if a user supports E2EE
 * Params: userId (ObjectId or username)
 */
router.get('/supports/:userId', protect, checkE2EESupport);

module.exports = router;
