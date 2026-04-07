const mongoose = require('mongoose');

const storySchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true
    },
    media: {
      type: {
        public_id: String,
        secure_url: String,
        resource_type: String,
        format: String,
        version: Number,
        width: Number,
        height: Number,
        duration: Number,
        thumbnail_url: String
      },
      required: [true, 'Media is required']
    },
    textOverlay: [
      {
        id: String,
        text: {
          type: String,
          trim: true
        },
        fontSize: Number,
        color: String,
        // Position and rotation are NOT persisted - only text content matters
        // Position is ephemeral and should be client-side only
      }
    ],
    drawings: [
      {
        // Drawings are typically not persisted in most apps (ephemeral)
        // If you need them, add fields here
        // For now, keeping structure but they're optional
      }
    ],
    viewedBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        viewedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    viewsCount: {
      type: Number,
      default: 0
    },
    visibility: {
      type: String,
      enum: ['public', 'followers', 'closeFriends'],
      default: 'public'
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000)
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false
  }
);

// Automatically delete stories after 24 hours
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ✅ FIX: Add indexes for common story queries
storySchema.index({ author: 1, expiresAt: -1 });      // For getUserStories
storySchema.index({ expiresAt: -1, createdAt: -1 }); // For active stories feed
storySchema.index({ createdAt: -1 });                 // For newest stories

module.exports = mongoose.model('Story', storySchema);
