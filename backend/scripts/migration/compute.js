const logger = require('./logger');

class ComputeFieldResolver {
  constructor(models) {
    this.models = models;
    this.computeRules = {
      followersCount: this._computeFollowersCount.bind(this),
      followingCount: this._computeFollowingCount.bind(this),
      postsCount: this._computePostsCount.bind(this),
      totalLikes: this._computeTotalLikes.bind(this),
      totalLikesCount: this._computeTotalLikesCount.bind(this),
      likesCount: this._computeLikesCount.bind(this),
      commentsCount: this._computeCommentsCount.bind(this),
      repliesCount: this._computeRepliesCount.bind(this),
    };
  }

  async resolveComputedField(fieldName, document, collectionName) {
    const resolver = this.computeRules[fieldName];
    if (!resolver) {
      return null;
    }

    try {
      return await resolver(document, collectionName);
    } catch (error) {
      logger.error(collectionName, 
        `Error computing ${fieldName} for doc ${document._id}: ${error.message}`);
      return null;
    }
  }

  async _computeFollowersCount(document) {
    if (!this.models.Follow) return null;
    const count = await this.models.Follow.countDocuments({
      following: document._id,
      status: { $in: ['accepted', undefined] },
    });
    return count;
  }

  async _computeFollowingCount(document) {
    if (!this.models.Follow) return null;
    const count = await this.models.Follow.countDocuments({
      follower: document._id,
      status: { $in: ['accepted', undefined] },
    });
    return count;
  }

  async _computePostsCount(document) {
    if (!this.models.Post) return null;
    const count = await this.models.Post.countDocuments({
      user: document._id,
      isDeleted: { $ne: true },
    });
    return count;
  }

  async _computeTotalLikes(document) {
    if (!this.models.Post) return null;
    const result = await this.models.Post.aggregate([
      { $match: { user: document._id } },
      { $group: { _id: null, total: { $sum: '$likesCount' } } },
    ]);
    return result.length > 0 ? result[0].total : 0;
  }

  async _computeTotalLikesCount(document) {
    return this._computeTotalLikes(document);
  }

  async _computeLikesCount(document, collectionName) {
    if (!this.models.Like) return null;

    let targetType = 'post';
    
    if (collectionName === 'comments') {
      targetType = 'comment';
    } else if (collectionName === 'messages') {
      targetType = 'message';
    }

    const count = await this.models.Like.countDocuments({
      target: document._id,
      targetType,
    });
    return count;
  }

  async _computeCommentsCount(document) {
    if (!this.models.Comment) return null;
    const count = await this.models.Comment.countDocuments({
      post: document._id,
      isDeleted: { $ne: true },
    });
    return count;
  }

  async _computeRepliesCount(document) {
    if (!this.models.Comment) return null;
    const count = await this.models.Comment.countDocuments({
      parentComment: document._id,
    });
    return count;
  }

  isComputedField(fieldName) {
    return fieldName in this.computeRules;
  }

  getComputedFields() {
    return Object.keys(this.computeRules);
  }
}

module.exports = ComputeFieldResolver;
