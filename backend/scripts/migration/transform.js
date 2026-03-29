const logger = require('./logger');

class StructuralTransformer {
  constructor() {
    this.urlPatterns = [
      /cloudinary\.com/,
      /s3\.amazonaws\.com/,
      /s3\./,
      /\.s3\.amazonaws\.com/,
    ];
  }

  async transformFieldValue(fieldName, currentValue, fieldType, collectionName) {
    if (currentValue === null || currentValue === undefined) {
      return null;
    }

    if (fieldType.includes('[]')) {
      if (Array.isArray(currentValue)) {
        return currentValue.map(item => 
          this._transformItemIfNeeded(fieldName, item, collectionName)
        );
      }
      return currentValue;
    }

    return this._transformItemIfNeeded(fieldName, currentValue, collectionName);
  }

  _transformItemIfNeeded(fieldName, value, collectionName) {
    if (typeof value === 'string' && this._isMediaField(fieldName)) {
      return this._wrapInMediaObject(value);
    }
    return value;
  }

  _isMediaField(fieldName) {
    const mediaFields = [
      'profilePicture',
      'coverPhoto',
      'groupAvatar',
      'media',
      'thumbnail_url',
      'attachments',
    ];
    
    const baseName = fieldName.split('.').pop();
    return mediaFields.some(field => baseName.toLowerCase().includes(field.toLowerCase()));
  }

  _wrapInMediaObject(urlString) {
    if (typeof urlString !== 'string' || !urlString.trim()) {
      return urlString;
    }

    const isExternal = this.urlPatterns.some(pattern => pattern.test(urlString));
    
    let resourceType = 'image';
    let format = null;

    if (urlString.includes('/video/') || /\.(mp4|webm|mov|avi|mkv)$/i.test(urlString)) {
      resourceType = 'video';
      const match = urlString.match(/\.([a-z0-9]+)$/i);
      format = match ? match[1].toLowerCase() : null;
    } else if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(urlString)) {
      resourceType = 'image';
      const match = urlString.match(/\.([a-z0-9]+)$/i);
      format = match ? match[1].toLowerCase() : null;
    } else if (/\.(mp3|wav|ogg|m4a|aac)$/i.test(urlString)) {
      resourceType = 'audio';
      const match = urlString.match(/\.([a-z0-9]+)$/i);
      format = match ? match[1].toLowerCase() : null;
    }

    return {
      secure_url: urlString,
      public_id: null,
      resource_type: resourceType,
      format: format,
      version: null,
      width: null,
      height: null,
      duration: null,
      thumbnail_url: null,
    };
  }

  needsTransform(currentValue, fieldType) {
    if (currentValue === null || currentValue === undefined) {
      return false;
    }

    if (fieldType.includes('[]') && Array.isArray(currentValue)) {
      return currentValue.some(item => typeof item === 'string');
    }

    if (typeof currentValue === 'string' && fieldType === 'Object') {
      return true;
    }

    return false;
  }
}

module.exports = StructuralTransformer;
