const Joi = require('joi');

// ─────────────────────────────────────────────────────────────────────────────
// Story Upload Validator
// 
// Expected request body structure:
// {
//   mediaUrl: 'https://...' (Cloudinary secure_url),
//   mediaPublicId: 'myapp/...' (Cloudinary public_id),
//   mediaType: 'image' | 'video',
//   duration: 45 (required for videos, in seconds),
//   thumbnailUrl: 'https://...' (optional, for videos),
//   textOverlay: [{ id, text, fontSize, color }] (optional),
//   drawings: [...] (optional)
// }
//
// Validation Rules:
// - For IMAGE stories: duration is forbidden
// - For VIDEO stories: duration is required and must be positive
// - Text overlays: optional, but must be arrays with valid objects
// - Drawings: optional, treated as ephemeral
// ─────────────────────────────────────────────────────────────────────────────
exports.uploadStoryValidator = Joi.object({
  mediaUrl: Joi.string()
    .uri()
    .required()
    .messages({
      'string.uri': 'Media URL must be a valid URI',
      'any.required': 'Media URL is required',
    }),
  mediaPublicId: Joi.string()
    .required()
    .messages({
      'string.base': 'Media publicId must be a string',
      'any.required': 'Media publicId is required',
    }),
  mediaType: Joi.string()
    .valid('image', 'video')
    .required()
    .messages({
      'any.only': 'Media type must be either "image" or "video"',
      'any.required': 'Media type is required',
    }),
  duration: Joi.when('mediaType', {
    is: 'video',
    then: Joi.number()
      .positive()
      .required()
      .messages({
        'number.base': 'Duration must be a number (in seconds)',
        'number.positive': 'Duration must be a positive number',
        'any.required': 'Duration is required for video stories',
      }),
    otherwise: Joi.forbidden()
      .messages({
        'any.unknown': 'Duration is not allowed for image stories',
      }),
  }),
  thumbnailUrl: Joi.string()
    .uri()
    .optional()
    .messages({
      'string.uri': 'Thumbnail URL must be a valid URI',
    }),
  textOverlay: Joi.array()
    .items(
      Joi.object({
        id: Joi.string().required(),
        text: Joi.string().trim().max(500).required(),
        fontSize: Joi.number().integer().positive().optional(),
        color: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).optional(),
      })
    )
    .optional()
    .messages({
      'array.base': 'Text overlays must be an array',
    }),
  drawings: Joi.array()
    .optional()
    .messages({
      'array.base': 'Drawings must be an array',
    }),
}).unknown(false);

// ─────────────────────────────────────────────────────────────────────────────
// Delete Story Validator
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteStoryValidator = Joi.object({
  storyId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid story ID format',
      'any.required': 'Story ID is required',
    }),
}).unknown(false);

// ─────────────────────────────────────────────────────────────────────────────
// View Story Validator
// ─────────────────────────────────────────────────────────────────────────────
exports.viewStoryValidator = Joi.object({
  storyId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid story ID format',
      'any.required': 'Story ID is required',
    }),
}).unknown(false);

// ─────────────────────────────────────────────────────────────────────────────
// Get Story Viewers Validator
// ─────────────────────────────────────────────────────────────────────────────
exports.getStoryViewersValidator = Joi.object({
  storyId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid story ID format',
      'any.required': 'Story ID is required',
    }),
}).unknown(false);

// ─────────────────────────────────────────────────────────────────────────────
// Get User Stories Validator
// ─────────────────────────────────────────────────────────────────────────────
exports.getUserStoriesValidator = Joi.object({
  userId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid user ID format',
      'any.required': 'User ID is required',
    }),
}).unknown(false);
