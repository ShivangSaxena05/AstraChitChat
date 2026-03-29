const logger = require('./logger');

class SchemaDiscovery {
  constructor(models) {
    this.models = models;
    this.schemaMap = new Map();
    this.computedFieldPatterns = {
      followersCount: { source: 'Follow', filter: 'following', countField: '_id' },
      followingCount: { source: 'Follow', filter: 'follower', countField: '_id' },
      postsCount: { source: 'Post', filter: 'author', countField: '_id' },
      totalLikes: { source: 'Post', aggregateField: 'likesCount', operation: 'sum' },
      totalLikesCount: { source: 'Post', aggregateField: 'likesCount', operation: 'sum' },
      likesCount: { source: 'Like', sourceField: 'target', countField: '_id' },
      commentsCount: { source: 'Comment', filter: 'post', countField: '_id' },
      repliesCount: { source: 'Comment', filter: 'parentComment', countField: '_id' },
    };
  }

  introspectSchema(modelName) {
    if (this.schemaMap.has(modelName)) {
      return this.schemaMap.get(modelName);
    }

    const model = this.models[modelName];
    if (!model) {
      return null;
    }

    const schema = model.schema;
    const fields = {};

    this._walkSchema(schema.paths, '', fields, modelName);

    this.schemaMap.set(modelName, fields);
    return fields;
  }

  _walkSchema(paths, prefix, fields, modelName) {
    Object.entries(paths).forEach(([path, schemaType]) => {
      if (path === '_id' || path === '__v' || path.startsWith('$')) {
        return;
      }

      const fullPath = prefix ? `${prefix}.${path}` : path;
      const instance = schemaType.instance;

      if (instance === 'Array') {
        const arrayInstance = schemaType.ofType?.instance || 'mixed';
        
        if (arrayInstance === 'ObjectID') {
          fields[fullPath] = {
            path: fullPath,
            type: 'ObjectId[]',
            isArray: true,
            isRequired: schemaType.isRequired,
            defaultValue: schemaType.defaultValue,
            schemaDefault: schemaType.getDefault?.(),
          };
        } else if (arrayInstance === 'Embedded' || schemaType.schema) {
          const embeddedSchema = schemaType.schema || schemaType.ofType?.schema;
          if (embeddedSchema) {
            this._walkSchema(embeddedSchema.paths, fullPath, fields, modelName);
          }
        } else if (arrayInstance === 'String') {
          fields[fullPath] = {
            path: fullPath,
            type: 'String[]',
            isArray: true,
            isRequired: schemaType.isRequired,
            defaultValue: schemaType.defaultValue,
            schemaDefault: schemaType.getDefault?.(),
          };
        } else {
          fields[fullPath] = {
            path: fullPath,
            type: `${arrayInstance}[]`,
            isArray: true,
            isRequired: schemaType.isRequired,
            defaultValue: schemaType.defaultValue,
            schemaDefault: schemaType.getDefault?.(),
          };
        }
      } else if (instance === 'ObjectID') {
        fields[fullPath] = {
          path: fullPath,
          type: 'ObjectId',
          isRequired: schemaType.isRequired,
          defaultValue: schemaType.defaultValue,
          schemaDefault: schemaType.getDefault?.(),
          ref: schemaType.options?.ref,
        };
      } else if (instance === 'Embedded' || schemaType.schema) {
        const embeddedSchema = schemaType.schema;
        if (embeddedSchema) {
          this._walkSchema(embeddedSchema.paths, fullPath, fields, modelName);
        }
      } else {
        fields[fullPath] = {
          path: fullPath,
          type: instance,
          isRequired: schemaType.isRequired,
          defaultValue: schemaType.defaultValue,
          schemaDefault: schemaType.getDefault?.(),
          enumValues: schemaType.enumValues,
        };
      }
    });
  }

  async diffDocuments(collectionName, sampleDocuments, schemaFields) {
    const issues = {};
    const fieldsNeedingMigration = new Set();

    sampleDocuments.forEach(doc => {
      Object.entries(schemaFields).forEach(([fieldPath, fieldDef]) => {
        const currentValue = this._getNestedValue(doc, fieldPath);
        const category = this._classifyField(
          fieldPath,
          currentValue,
          fieldDef,
          collectionName
        );

        if (category === 'MISSING' || category === 'WRONG_TYPE' || category === 'COMPUTED') {
          if (!issues[fieldPath]) {
            issues[fieldPath] = {
              path: fieldPath,
              type: fieldDef.type,
              schemaDefault: fieldDef.schemaDefault,
              category,
              affectedDocs: 0,
              examples: [],
            };
          }
          issues[fieldPath].affectedDocs++;
          if (issues[fieldPath].examples.length < 3) {
            issues[fieldPath].examples.push({
              docId: doc._id,
              currentValue,
            });
          }
          fieldsNeedingMigration.add(fieldPath);
        }
      });
    });

    return {
      issues: Object.values(issues),
      fieldsNeedingMigration: Array.from(fieldsNeedingMigration),
      totalScanned: sampleDocuments.length,
    };
  }

  _classifyField(fieldPath, currentValue, fieldDef, collectionName) {
    if (currentValue === undefined || currentValue === null) {
      if (this.computedFieldPatterns[this._getFieldName(fieldPath)]) {
        return 'COMPUTED';
      }
      if (fieldDef.schemaDefault !== undefined || fieldDef.defaultValue !== undefined) {
        return 'MISSING';
      }
      if (fieldDef.type.includes('[]')) {
        return 'MISSING';
      }
      if (fieldDef.type === 'String' || fieldDef.type === 'Boolean' || fieldDef.type === 'Number') {
        return 'MISSING';
      }
      return 'MISSING';
    }

    if (fieldDef.type === 'String' && typeof currentValue === 'object') {
      return 'WRONG_TYPE';
    }

    if (fieldDef.type.includes('ObjectId') && typeof currentValue === 'string') {
      return 'WRONG_TYPE';
    }

    if (this.computedFieldPatterns[this._getFieldName(fieldPath)] && currentValue === 0) {
      return 'COMPUTED';
    }

    return 'OK';
  }

  _getFieldName(fieldPath) {
    const parts = fieldPath.split('.');
    return parts[parts.length - 1];
  }

  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  getComputedFieldConfig(fieldName, sourceModel) {
    return this.computedFieldPatterns[fieldName];
  }
}

module.exports = SchemaDiscovery;
