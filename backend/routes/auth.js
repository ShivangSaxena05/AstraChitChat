const express = require('express');
const router = express.Router();

console.log('✅ Auth routes loaded');
const { registerUser, loginUser, setup2FA, verify2FASetup, disable2FA, verifyLogin2FA, logoutUser, refreshAccessToken, logoutAllDevices } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validateRequest');
const {
  registerValidator,
  loginValidator,
  verify2FASetupValidator,
  disable2FAValidator,
  verifyLogin2FAValidator,
  refreshTokenValidator,
} = require('../validators/authValidators');

// @route   POST /api/auth/register
// @desc    Register a new user
router.post('/register', validateRequest({ bodySchema: registerValidator }), registerUser);

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
router.post('/login', validateRequest({ bodySchema: loginValidator }), loginUser);

// @route   POST /api/auth/logout
// @desc    Logout user
router.post('/logout', protect, validateRequest({}), logoutUser);

// @route   POST /api/auth/refresh-token
// @desc    Refresh access token using refresh token
router.post('/refresh-token', validateRequest({ bodySchema: refreshTokenValidator }), refreshAccessToken);

// @route   POST /api/auth/logout-all-devices
// @desc    Logout from all devices
router.post('/logout-all-devices', protect, validateRequest({}), logoutAllDevices);

// 2FA Routes
router.post('/2fa/setup', protect, validateRequest({}), setup2FA);
router.post('/2fa/verify-setup', protect, validateRequest({ bodySchema: verify2FASetupValidator }), verify2FASetup);
router.post('/2fa/disable', protect, validateRequest({ bodySchema: disable2FAValidator }), disable2FA);
router.post('/2fa/login', validateRequest({ bodySchema: verifyLogin2FAValidator }), verifyLogin2FA);

module.exports = router;