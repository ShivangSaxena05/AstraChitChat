const Joi = require('joi');

// Create post validator
exports.createPostValidator = Joi.object({
  mediaUrl: Joi.string()
    .uri()
    .required()
    .messages({
      'string.uri': 'Media URL must be a valid URI',
      'any.required': 'Media URL is required',
    }),
  mediaKey: Joi.string()
    .optional()
    .messages({
      'string.base': 'Media key must be a string',
    }),
  mediaType: Joi.string()
    .valid('image', 'video')
    .required()
    .messages({
      'any.only': 'Media type must be either "image" or "video"',
      'any.required': 'Media type is required',
    }),
  caption: Joi.string()
    .max(2000)
    .optional()
    .messages({
      'string.max': 'Caption must not exceed 2000 characters',
    }),
}).unknown(false);

// Delete post validator
exports.deletePostValidator = Joi.object({
  postId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid post ID format',
      'any.required': 'Post ID is required',
    }),
}).unknown(false);

// Get post validator (for pagination and filtering)
exports.getPostValidator = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .messages({
      'number.base': 'Page must be a number',
      'number.min': 'Page must be at least 1',
    }),
  category: Joi.string()
    .valid('for-you', 'trending', 'videos', 'images')
    .default('for-you')
    .messages({
      'any.only': 'Category must be one of: for-you, trending, videos, images',
    }),
  userId: Joi.string()
    .optional()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid user ID format',
    }),
}).unknown(false);

// Like post validator
exports.likePostValidator = Joi.object({
  postId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid post ID format',
      'any.required': 'Post ID is required',
    }),
}).unknown(false);

// Add comment validator
exports.addCommentValidator = Joi.object({
  postId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid post ID format',
      'any.required': 'Post ID is required',
    }),
  text: Joi.string()
    .trim()
    .min(1)
    .max(500)
    .required()
    .messages({
      'string.min': 'Comment cannot be empty',
      'string.max': 'Comment must not exceed 500 characters',
      'any.required': 'Comment text is required',
    }),
}).unknown(false);

// Delete comment validator
exports.deleteCommentValidator = Joi.object({
  postId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid post ID format',
      'any.required': 'Post ID is required',
    }),
  commentId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid comment ID format',
      'any.required': 'Comment ID is required',
    }),
}).unknown(false);

// Search posts validator
exports.searchPostsValidator = Joi.object({
  query: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.min': 'Search query cannot be empty',
      'string.max': 'Search query must not exceed 100 characters',
      'any.required': 'Search query is required',
    }),
  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .messages({
      'number.base': 'Page must be a number',
      'number.min': 'Page must be at least 1',
    }),
}).unknown(false);
