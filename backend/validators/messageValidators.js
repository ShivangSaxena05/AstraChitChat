const Joi = require('joi');

// Create chat validator
exports.createChatValidator = Joi.object({
  participantId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid participant ID format',
      'any.required': 'Participant ID is required',
    }),
}).unknown(false);

// Create group chat validator
exports.createGroupChatValidator = Joi.object({
  name: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.min': 'Group name cannot be empty',
      'string.max': 'Group name must not exceed 100 characters',
      'any.required': 'Group name is required',
    }),
  participantIds: Joi.array()
    .items(
      Joi.string()
        .regex(/^[0-9a-fA-F]{24}$/)
        .messages({
          'string.pattern.base': 'Each participant ID must be a valid MongoDB ObjectId',
        })
    )
    .min(1)
    .required()
    .messages({
      'array.min': 'At least one participant is required',
      'any.required': 'Participant IDs are required',
    }),
}).unknown(false);

// Send message validator
exports.sendMessageValidator = Joi.object({
  chatId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid chat ID format',
      'any.required': 'Chat ID is required',
    }),
  bodyText: Joi.string()
    .max(5000)
    .optional()
    .messages({
      'string.max': 'Message must not exceed 5000 characters',
    }),
  mediaUrl: Joi.string()
    .uri()
    .optional()
    .messages({
      'string.uri': 'Media URL must be a valid URI',
    }),
  mediaType: Joi.string()
    .valid('image', 'video', 'audio', 'file')
    .optional()
    .messages({
      'any.only': 'Media type must be one of: image, video, audio, file',
    }),
  quotedMsgId: Joi.string()
    .optional()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid quoted message ID format',
    }),
}).unknown(false)
  .custom((value, helpers) => {
    // Ensure at least bodyText or mediaUrl is provided
    if (!value.bodyText && !value.mediaUrl) {
      return helpers.error('any.required', {
        message: 'Either message text or media is required',
      });
    }
    return value;
  });

// Send encrypted message validator
exports.sendEncryptedMessageValidator = Joi.object({
  chatId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid chat ID format',
      'any.required': 'Chat ID is required',
    }),
  encryptedContent: Joi.string()
    .required()
    .messages({
      'any.required': 'Encrypted content is required',
    }),
  encryptionVersion: Joi.string()
    .required()
    .messages({
      'any.required': 'Encryption version is required',
    }),
}).unknown(false);

// Edit message validator
exports.editMessageValidator = Joi.object({
  chatId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid chat ID format',
      'any.required': 'Chat ID is required',
    }),
  messageId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid message ID format',
      'any.required': 'Message ID is required',
    }),
  bodyText: Joi.string()
    .max(5000)
    .required()
    .messages({
      'string.max': 'Message must not exceed 5000 characters',
      'any.required': 'New message text is required',
    }),
}).unknown(false);

// Delete message validator
exports.deleteMessageValidator = Joi.object({
  chatId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid chat ID format',
      'any.required': 'Chat ID is required',
    }),
  messageId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid message ID format',
      'any.required': 'Message ID is required',
    }),
}).unknown(false);

// Unsend message validator
exports.unsendMessageValidator = Joi.object({
  chatId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid chat ID format',
      'any.required': 'Chat ID is required',
    }),
  messageId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid message ID format',
      'any.required': 'Message ID is required',
    }),
}).unknown(false);

// Mark message as read validator
exports.markMessageAsReadValidator = Joi.object({
  chatId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid chat ID format',
      'any.required': 'Chat ID is required',
    }),
  messageId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid message ID format',
      'any.required': 'Message ID is required',
    }),
}).unknown(false);

// Mark all messages as read validator
exports.markAllMessagesAsReadValidator = Joi.object({
  chatId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid chat ID format',
      'any.required': 'Chat ID is required',
    }),
}).unknown(false);

// Add reaction validator
exports.addReactionValidator = Joi.object({
  chatId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid chat ID format',
      'any.required': 'Chat ID is required',
    }),
  messageId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid message ID format',
      'any.required': 'Message ID is required',
    }),
  emoji: Joi.string()
    .required()
    .messages({
      'any.required': 'Emoji is required',
    }),
}).unknown(false);

// Remove reaction validator
exports.removeReactionValidator = Joi.object({
  chatId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid chat ID format',
      'any.required': 'Chat ID is required',
    }),
  messageId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid message ID format',
      'any.required': 'Message ID is required',
    }),
  emoji: Joi.string()
    .required()
    .messages({
      'any.required': 'Emoji is required',
    }),
}).unknown(false);

// Mute/Unmute chat validator
exports.muteChatValidator = Joi.object({
  chatId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid chat ID format',
      'any.required': 'Chat ID is required',
    }),
  isMuted: Joi.boolean()
    .required()
    .messages({
      'any.required': 'isMuted flag is required',
    }),
}).unknown(false);

// Pin chat validator
exports.pinChatValidator = Joi.object({
  chatId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid chat ID format',
      'any.required': 'Chat ID is required',
    }),
  isPinned: Joi.boolean()
    .required()
    .messages({
      'any.required': 'isPinned flag is required',
    }),
}).unknown(false);

// Clear chat validator
exports.clearChatValidator = Joi.object({
  chatId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid chat ID format',
      'any.required': 'Chat ID is required',
    }),
}).unknown(false);

// Get chat messages validator
exports.getChatMessagesValidator = Joi.object({
  chatId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid chat ID format',
      'any.required': 'Chat ID is required',
    }),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(50)
    .messages({
      'number.base': 'Limit must be a number',
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit must not exceed 100',
    }),
  beforeMessageId: Joi.string()
    .optional()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid message ID format',
    }),
}).unknown(false);

// Search chats validator
exports.searchChatsValidator = Joi.object({
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
}).unknown(false);

// Add group member validator
exports.addGroupMemberValidator = Joi.object({
  chatId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid chat ID format',
      'any.required': 'Chat ID is required',
    }),
  userId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid user ID format',
      'any.required': 'User ID is required',
    }),
}).unknown(false);

// Remove group member validator
exports.removeGroupMemberValidator = Joi.object({
  chatId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid chat ID format',
      'any.required': 'Chat ID is required',
    }),
  userId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid user ID format',
      'any.required': 'User ID is required',
    }),
}).unknown(false);

// Leave group validator
exports.leaveGroupValidator = Joi.object({
  chatId: Joi.string()
    .required()
    .regex(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Invalid chat ID format',
      'any.required': 'Chat ID is required',
    }),
}).unknown(false);
