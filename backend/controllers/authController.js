const User = require('../models/User');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const asyncHandler = require('./asyncHandler');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

// Helper function to generate a JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
exports.registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error('Name, email and password are required');
  }

  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  // Generate a base username then make it unique with a random suffix
  // to avoid collisions on same-millisecond registrations
  const baseUsername = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const username = baseUsername + Math.random().toString(36).slice(2, 7);

  // Guard against duplicate username (extremely rare but possible)
  const usernameExists = await User.findOne({ username });
  if (usernameExists) {
    res.status(500);
    throw new Error('Could not generate unique username, please try again');
  }

  const user = await User.create({ name, email, password, username });

  if (user) {
    res.status(201).json({
      _id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      profilePicture: user.profilePicture,
      token: generateToken(user._id),
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
exports.loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');

  if (user && (await user.matchPassword(password))) {
    if (user.isTwoFactorEnabled && user.twoFactorSecret) {
      return res.json({
        requires2FA: true,
        userId: user._id,
      });
    }

    // FIX: include username in login response to match registration response
    return res.json({
      _id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      profilePicture: user.profilePicture,
      token: generateToken(user._id),
    });
  } else {
    res.status(401);
    throw new Error('Invalid email or password');
  }
});

// @desc    Setup 2FA
// @route   POST /api/auth/2fa/setup
// @access  Private
exports.setup2FA = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const secret = speakeasy.generateSecret({
    name: `AstraChitChat (${user.email})`,
  });

  user.twoFactorSecret = secret.base32;
  await user.save();

  // FIX: use promise-based QRCode.toDataURL instead of callback
  // so errors are caught by asyncHandler properly
  const data_url = await QRCode.toDataURL(secret.otpauth_url);
  res.json({ secret: secret.base32, qrCode: data_url });
});

// @desc    Verify 2FA setup
// @route   POST /api/auth/2fa/verify-setup
// @access  Private
exports.verify2FASetup = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const user = await User.findById(req.user._id);

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token,
  });

  if (verified) {
    user.isTwoFactorEnabled = true;
    await user.save();
    res.json({ message: '2FA enabled successfully' });
  } else {
    res.status(400);
    throw new Error('Invalid 2FA token');
  }
});

// @desc    Disable 2FA
// @route   POST /api/auth/2fa/disable
// @access  Private
exports.disable2FA = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const user = await User.findById(req.user._id);

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token,
  });

  if (verified) {
    user.isTwoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    await user.save();
    res.json({ message: '2FA disabled successfully' });
  } else {
    res.status(400);
    throw new Error('Invalid 2FA token');
  }
});

// @desc    Verify 2FA during login
// @route   POST /api/auth/2fa/login
// @access  Public
exports.verifyLogin2FA = asyncHandler(async (req, res) => {
  const { userId, token } = req.body;

  // FIX: validate userId before hitting the DB to prevent Mongoose cast errors
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    res.status(400);
    throw new Error('Invalid user ID');
  }

  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token,
  });

  if (verified) {
    res.json({
      _id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      profilePicture: user.profilePicture,
      token: generateToken(user._id),
    });
  } else {
    res.status(400);
    throw new Error('Invalid 2FA token');
  }
});