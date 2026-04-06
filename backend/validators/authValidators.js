const Joi = require('joi');

// Password validation schema - requires: min 8 chars, uppercase, lowercase, digit, special char
const passwordSchema = Joi.string()
  .min(8)
  .max(128)
  .required()
  .regex(/[A-Z]/)
  .regex(/[a-z]/)
  .regex(/[0-9]/)
  .regex(/[@$!%*?&^#]/)
  .messages({
    'string.min': 'Password must be at least 8 characters long',
    'string.max': 'Password must not exceed 128 characters',
    'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character (@$!%*?&^#)',
    'any.required': 'Password is required',
  });

// Register validator schema
exports.registerValidator = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .required()
    .messages({
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name must not exceed 50 characters',
      'any.required': 'Name is required',
    }),
  email: Joi.string()
    .lowercase()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
  password: passwordSchema,
  deviceId: Joi.string().optional(),
}).unknown(false); // Reject unknown fields

// Login validator schema
exports.loginValidator = Joi.object({
  email: Joi.string()
    .lowercase()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required',
    }),
  deviceId: Joi.string().optional(),
}).unknown(false);

// Forgot password validator schema
exports.forgotPasswordValidator = Joi.object({
  email: Joi.string()
    .lowercase()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
}).unknown(false);

// Reset password validator schema
exports.resetPasswordValidator = Joi.object({
  token: Joi.string()
    .required()
    .messages({
      'any.required': 'Reset token is required',
    }),
  password: passwordSchema,
}).unknown(false);

// Change password validator schema
exports.changePasswordValidator = Joi.object({
  currentPassword: Joi.string()
    .required()
    .messages({
      'any.required': 'Current password is required',
    }),
  newPassword: passwordSchema,
}).unknown(false);

// 2FA setup validator
exports.setup2FAValidator = Joi.object({}).unknown(false);

// 2FA verify setup validator
exports.verify2FASetupValidator = Joi.object({
  token: Joi.string()
    .length(6)
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.length': 'Token must be 6 digits',
      'string.pattern.base': 'Token must contain only digits',
      'any.required': 'Token is required',
    }),
}).unknown(false);

// 2FA disable validator
exports.disable2FAValidator = Joi.object({
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required for security verification',
    }),
}).unknown(false);

// 2FA login validator
exports.verifyLogin2FAValidator = Joi.object({
  userId: Joi.string()
    .required()
    .messages({
      'any.required': 'User ID is required',
    }),
  token: Joi.string()
    .length(6)
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.length': 'Token must be 6 digits',
      'string.pattern.base': 'Token must contain only digits',
      'any.required': 'Token is required',
    }),
  deviceId: Joi.string().optional(),
}).unknown(false);

// Refresh token validator
exports.refreshTokenValidator = Joi.object({
  refreshToken: Joi.string()
    .required()
    .messages({
      'any.required': 'Refresh token is required',
    }),
}).unknown(false);

// Logout all devices validator
exports.logoutAllDevicesValidator = Joi.object({}).unknown(false);
