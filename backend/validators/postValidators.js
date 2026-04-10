const Joi = require('joi');

// ─────────────────────────────────────────────────────────────────────────────
// Create post validator
// 
// Expected request body structure:
// {
//   media: [
//     {
//       url: 'https://...',
//       publicId: 'myapp/...',
//       resourceType: 'image' | 'video',
//       width: 1920 (optional),
//       height: 1080 (optional),
//       duration: 120 (optional, for videos)
//     }
//   ],
//   caption: 'Post text...' (optional),
//   hashtags: ['tag1', 'tag2'] (optional),
//   visibility: 'public' | 'followers' | 'private' (optional),
//   location: 'City, Country' (optional)
// }
// ─────────────────────────────────────────────────────────────────────────────
exports.createPostValidator = Joi.object({
  media: Joi.array()
    .items(
      Joi.object({
        url: Joi.string()
          .uri()
          .required()
          .messages({
            'string.uri': 'Media URL must be a valid URI',
            'any.required': 'Media URL is required for each media item',
          }),
        publicId: Joi.string()
          .required()
          .messages({
            'string.base': 'Media publicId must be a string',
            'any.required': 'Media publicId is required for each media item',
          }),
        resourceType: Joi.string()
          .valid('image', 'video')
          .required()
          .messages({
            'any.only': 'Resource type must be either "image" or "video"',
            'any.required': 'Resource type is required for each media item',
          }),
        width: Joi.number()
          .integer()
          .positive()
          .optional()
          .messages({
            'number.base': 'Width must be a number',
            'number.positive': 'Width must be a positive number',
          }),
        height: Joi.number()
          .integer()
          .positive()
          .optional()
          .messages({
            'number.base': 'Height must be a number',
            'number.positive': 'Height must be a positive number',
          }),
        duration: Joi.number()
          .positive()
          .optional()
          .messages({
            'number.base': 'Duration must be a number',
            'number.positive': 'Duration must be a positive number',
          }),
      })
    )
    .min(1)
    .max(10)
    .required()
    .messages({
      'array.base': 'Media must be an array',
      'array.min': 'At least one media item is required',
      'array.max': 'Maximum 10 media items allowed per post',
      'any.required': 'Media array is required',
    }),
  caption: Joi.string()
    .max(2000)
    .optional()
    .trim()
    .messages({
      'string.max': 'Caption must not exceed 2000 characters',
    }),
  hashtags: Joi.array()
    .items(
      Joi.string()
        .trim()
        .min(1)
        .max(50)
        .messages({
          'string.min': 'Each hashtag must have at least 1 character',
          'string.max': 'Each hashtag must not exceed 50 characters',
        })
    )
    .max(30)
    .optional()
    .messages({
      'array.base': 'Hashtags must be an array',
      'array.max': 'Maximum 30 hashtags allowed per post',
    }),
  visibility: Joi.string()
    .valid('public', 'followers', 'private')
    .optional()
    .default('public')
    .messages({
      'any.only': 'Visibility must be one of: public, followers, private',
    }),
  location: Joi.string()
    .max(200)
    .optional()
    .trim()
    .messages({
      'string.max': 'Location must not exceed 200 characters',
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
