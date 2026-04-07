const rateLimit = require('express-rate-limit');

/**
 * Rate Limiting Middleware for Chat Operations
 * Prevents API abuse and DoS attacks
 */

/**
 * General chat operations limiter
 * 100 requests per minute per user
 */
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    success: false,
    message: 'Too many chat requests, please try again later',
  },
  keyGenerator: (req) => `${req.user?._id || req.ip}:chat`,
  skip: (req) => req.user?.role === 'admin', // Skip rate limit for admins
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many chat requests, please try again later',
      retryAfter: req.rateLimit.resetTime,
    });
  },
});

/**
 * Strict message sending limiter
 * 5 messages per second per user
 * Prevents spam/flood attacks
 */
const messageLimiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 5, // 5 messages per second
  message: {
    success: false,
    message: 'Too many messages sent too quickly. Please slow down.',
  },
  keyGenerator: (req) => req.user?._id || req.ip,
  skip: (req) => req.user?.role === 'admin', // Skip for admins
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many messages sent too quickly. Please slow down.',
      retryAfter: req.rateLimit.resetTime,
    });
  },
});

/**
 * Edit message limiter
 * 20 edits per minute to prevent spam edits
 */
const editMessageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 edits per minute
  message: {
    success: false,
    message: 'Too many message edits, please try again later',
  },
  keyGenerator: (req) => req.user?._id || req.ip,
  skip: (req) => req.user?.role === 'admin',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many message edits, please try again later',
      retryAfter: req.rateLimit.resetTime,
    });
  },
});

/**
 * Delete/unsend message limiter
 * 30 deletes per minute
 */
const deleteMessageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 deletes per minute
  message: {
    success: false,
    message: 'Too many message deletions, please try again later',
  },
  keyGenerator: (req) => req.user?._id || req.ip,
  skip: (req) => req.user?.role === 'admin',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many message deletions, please try again later',
      retryAfter: req.rateLimit.resetTime,
    });
  },
});

/**
 * Chat creation limiter
 * 10 new chats per hour per user
 */
const createChatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 new chats per hour
  message: {
    success: false,
    message: 'Too many new chats created, please try again later',
  },
  keyGenerator: (req) => req.user?._id || req.ip,
  skip: (req) => req.user?.role === 'admin',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many new chats created, please try again later',
      retryAfter: req.rateLimit.resetTime,
    });
  },
});

/**
 * Search limiter
 * 30 searches per minute
 */
const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 searches per minute
  message: {
    success: false,
    message: 'Too many search requests, please try again later',
  },
  keyGenerator: (req) => req.user?._id || req.ip,
  skip: (req) => req.user?.role === 'admin',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many search requests, please try again later',
      retryAfter: req.rateLimit.resetTime,
    });
  },
});

module.exports = {
  chatLimiter,
  messageLimiter,
  editMessageLimiter,
  deleteMessageLimiter,
  createChatLimiter,
  searchLimiter,
};
