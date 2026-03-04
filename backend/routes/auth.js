const express = require('express');
const router = express.Router();

console.log('✅ Auth routes loaded');
const { registerUser, loginUser, setup2FA, verify2FASetup, disable2FA, verifyLogin2FA } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// @route   POST /api/auth/register
// @desc    Register a new user
router.post('/register', registerUser);

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
router.post('/login', loginUser);

// 2FA Routes
router.post('/2fa/setup', protect, setup2FA);
router.post('/2fa/verify-setup', protect, verify2FASetup);
router.post('/2fa/disable', protect, disable2FA);
router.post('/2fa/login', verifyLogin2FA);

module.exports = router;