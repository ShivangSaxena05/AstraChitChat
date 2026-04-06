const User = require('../models/User');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const asyncHandler = require('./asyncHandler');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const { initializeUserStats } = require('../services/userStatsService');

// Helper function to generate a short-lived access token (15 minutes)
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '15m',
  });
};

// Helper function to generate a refresh token (7 days)
const generateRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
// @validation Uses Joi validation middleware for input sanitization
exports.registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, deviceId } = req.body;

  // Check if user exists (data already validated by Joi middleware)
  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error('User with this email already exists');
  }

  // Generate a base username then make it unique with a random suffix
  // to avoid collisions on same-millisecond registrations
  const baseUsername = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const randomSuffix = Math.random().toString(36).slice(2, 7);
  const username = baseUsername + randomSuffix;

  // Guard against duplicate username (extremely rare but possible)
  const usernameExists = await User.findOne({ username });
  if (usernameExists) {
    res.status(500);
    throw new Error('Could not generate unique username, please try again');
  }

  // Create user with pre-validated and sanitized data
  const user = await User.create({
    name,
    email,
    password,
    username,
  });

  if (user) {
    // Initialize UserStats for the new user
    try {
      await initializeUserStats(user._id);
    } catch (statsError) {
      console.error('Failed to initialize UserStats:', statsError.message);
      // Don't fail registration if stats initialization fails
    }

    // Generate tokens
    const accessToken = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    
    // Hash and store refresh token in DB
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    user.refreshTokens.push({
      token: hashedRefreshToken,
      expiresAt,
      deviceId: req.body.deviceId || 'unknown',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    await user.save();

    // Return user data with tokens
    res.status(201).json({
      _id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      profilePicture: user.profilePicture,
      accessToken,
      refreshToken,
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
// @validation Uses Joi validation middleware for input sanitization
exports.loginUser = asyncHandler(async (req, res) => {
  const { email, password, deviceId } = req.body;
  // Email and password already validated by Joi middleware

  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  // Check password match
  const passwordMatches = await user.matchPassword(password);
  if (!passwordMatches) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  if (user.isTwoFactorEnabled && user.twoFactorSecret) {
    return res.json({
      requires2FA: true,
      userId: user._id,
    });
  }

  // Generate tokens
  const accessToken = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);
  
  // Hash and store refresh token in DB
  const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  
  user.refreshTokens.push({
    token: hashedRefreshToken,
    expiresAt,
    deviceId: deviceId || 'unknown',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  await user.save();

  return res.json({
    _id: user._id,
    name: user.name,
    username: user.username,
    email: user.email,
    profilePicture: user.profilePicture,
    accessToken,
    refreshToken,
  });
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
// @validation Uses Joi validation middleware for token format validation
exports.verify2FASetup = asyncHandler(async (req, res) => {
  const { token } = req.body;
  // Token format already validated by Joi middleware (6 digits)
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
// @validation Uses Joi validation middleware for password validation
exports.disable2FA = asyncHandler(async (req, res) => {
  const { password } = req.body;
  // Password already validated by Joi middleware
  const user = await User.findById(req.user._id).select('+password');

  // Verify password for security
  const passwordMatches = await user.matchPassword(password);
  if (!passwordMatches) {
    res.status(401);
    throw new Error('Invalid password');
  }

  user.isTwoFactorEnabled = false;
  user.twoFactorSecret = undefined;
  await user.save();
  res.json({ message: '2FA disabled successfully' });
});

// @desc    Verify 2FA during login
// @route   POST /api/auth/2fa/login
// @access  Public
// @validation Uses Joi validation middleware for input sanitization
exports.verifyLogin2FA = asyncHandler(async (req, res) => {
  const { userId, token, deviceId } = req.body;
  // All inputs already validated by Joi middleware

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
    // Generate tokens
    const accessToken = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    
    // Hash and store refresh token in DB
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    user.refreshTokens.push({
      token: hashedRefreshToken,
      expiresAt,
      deviceId: deviceId || 'unknown',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    await user.save();

    res.json({
      _id: user._id,
      name: user.name,
      username: user.username,
      email: user.email,
      profilePicture: user.profilePicture,
      accessToken,
      refreshToken,
    });
  } else {
    res.status(400);
    throw new Error('Invalid 2FA token');
  }
});

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logoutUser = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const userId = req.user._id;

  if (refreshToken) {
    // Find the refresh token in the user's array and delete it
    const user = await User.findById(userId);
    
    // Find the matching refresh token
    const tokenIndex = user.refreshTokens.findIndex(async (rt) => {
      return await bcrypt.compare(refreshToken, rt.token);
    });

    if (tokenIndex > -1) {
      user.refreshTokens.splice(tokenIndex, 1);
      await user.save();
      console.log(`✅ User ${userId} logged out from device`);
    }
  }
  
  res.json({ 
    message: 'Logged out successfully',
    userId: userId
  });
});

// @desc    Refresh access token using refresh token
// @route   POST /api/auth/refresh-token
// @access  Public
// @validation Uses Joi validation middleware for input sanitization
exports.refreshAccessToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  // Refresh token already validated as required by Joi middleware

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    // Find matching refresh token in DB
    let foundToken = null;
    let foundTokenIndex = -1;

    for (let i = 0; i < user.refreshTokens.length; i++) {
      const isMatch = await bcrypt.compare(refreshToken, user.refreshTokens[i].token);
      if (isMatch) {
        foundToken = user.refreshTokens[i];
        foundTokenIndex = i;
        break;
      }
    }

    if (!foundToken) {
      res.status(401);
      throw new Error('Refresh token not found or invalid');
    }

    // Check if refresh token has expired
    if (new Date() > foundToken.expiresAt) {
      // Remove expired token
      user.refreshTokens.splice(foundTokenIndex, 1);
      await user.save();
      res.status(401);
      throw new Error('Refresh token has expired');
    }

    // Update lastUsedAt
    foundToken.lastUsedAt = new Date();
    
    // Generate new tokens
    const newAccessToken = generateToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    // Hash and replace the old refresh token with the new one (token rotation)
    const hashedNewRefreshToken = await bcrypt.hash(newRefreshToken, 10);
    user.refreshTokens[foundTokenIndex] = {
      token: hashedNewRefreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      createdAt: new Date(),
      lastUsedAt: new Date(),
      deviceId: foundToken.deviceId,
      ipAddress: foundToken.ipAddress,
      userAgent: foundToken.userAgent,
    };
    
    await user.save();

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      res.status(401);
      throw new Error('Refresh token has expired');
    }
    throw error;
  }
});

// @desc    Logout from all devices
// @route   POST /api/auth/logout-all-devices
// @access  Private
exports.logoutAllDevices = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  
  const user = await User.findById(userId);
  
  // Clear all refresh tokens
  user.refreshTokens = [];
  await user.save();

  console.log(`✅ User ${userId} logged out from all devices`);
  
  res.json({ 
    message: 'Logged out from all devices successfully',
    userId: userId
  });
});