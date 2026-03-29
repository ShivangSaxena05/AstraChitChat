const logger = require('./logger');

class MigrationExecutor {
  constructor(computeResolver, transformer) {
    this.computeResolver = computeResolver;
    this.transformer = transformer;
  }

  async migrateCollection(
    collection,
    model,
    fieldsToMigrate,
    schemaFields,
    batchSize = 500,
    dryRun = false
  ) {
    const startTime = Date.now();
    let totalScanned = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let batchNumber = 0;

    try {
      const totalDocs = await model.countDocuments();
      
      if (totalDocs === 0) {
        logger.batch(collection, 'No documents to migrate');
        return { scanned: 0, updated: 0, skipped: 0, errors: 0, time: 0 };
      }

      const cursor = model.find({}).batchSize(batchSize);
      let batch = [];
      let errors = 0;

      for await (const doc of cursor) {
        batch.push(doc);

        if (batch.length >= batchSize) {
          batchNumber++;
          const result = await this._processBatch(
            collection,
            model,
            batch,
            fieldsToMigrate,
            schemaFields,
            batchNumber,
            Math.ceil(totalDocs / batchSize),
            dryRun
          );
          
          totalScanned += result.scanned;
          totalUpdated += result.updated;
          totalSkipped += result.skipped;
          errors += result.errors;
          batch = [];
        }
      }

      if (batch.length > 0) {
        batchNumber++;
        const result = await this._processBatch(
          collection,
          model,
          batch,
          fieldsToMigrate,
          schemaFields,
          batchNumber,
          Math.ceil(totalDocs / batchSize),
          dryRun
        );
        
        totalScanned += result.scanned;
        totalUpdated += result.updated;
        totalSkipped += result.skipped;
        errors += result.errors;
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      logger.batch(
        collection,
        `Done — ${totalScanned} scanned, ${totalUpdated} updated, ${totalSkipped} skipped — ${duration}s`
      );

      return {
        scanned: totalScanned,
        updated: totalUpdated,
        skipped: totalSkipped,
        errors,
        time: parseFloat(duration),
      };
    } catch (error) {
      logger.error(collection, `Critical error: ${error.message}`);
      return {
        scanned: totalScanned,
        updated: totalUpdated,
        skipped: totalSkipped,
        errors: 1,
        time: ((Date.now() - startTime) / 1000).toFixed(2),
      };
    }
  }

  async _processBatch(
    collection,
    model,
    batch,
    fieldsToMigrate,
    schemaFields,
    batchNumber,
    totalBatches,
    dryRun
  ) {
    let scanned = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    const operations = [];

    for (const doc of batch) {
      scanned++;

      try {
        const updates = await this._buildDocumentUpdates(
          doc,
          fieldsToMigrate,
          schemaFields,
          collection
        );

        if (Object.keys(updates).length === 0) {
          skipped++;
          continue;
        }

        const rollbackFields = {};
        Object.keys(updates).forEach(field => {
          const currentValue = this._getNestedValue(doc, field);
          if (currentValue !== undefined && currentValue !== null) {
            rollbackFields[field] = currentValue;
          }
        });

        if (!dryRun) {
          logger.rollback(
            collection,
            doc._id,
            rollbackFields,
            new Date().toISOString()
          );
        }

        operations.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: updates },
          },
        });

        updated++;
      } catch (error) {
        logger.error(collection, 
          `Error preparing update for doc ${doc._id}: ${error.message}`);
        errors++;
      }
    }

    if (operations.length > 0 && !dryRun) {
      try {
        await model.bulkWrite(operations, { ordered: false });
      } catch (error) {
        logger.error(collection, 
          `Bulk write error in batch ${batchNumber}: ${error.message}`);
        errors += operations.length;
      }
    }

    if (operations.length > 0 || skipped > 0) {
      logger.batch(
        collection,
        `Batch ${batchNumber}/${totalBatches} — scanned ${scanned}, updated ${operations.length}, skipped ${skipped}`
      );
    }

    return { scanned, updated: operations.length, skipped, errors };
  }

  async _buildDocumentUpdates(doc, fieldsToMigrate, schemaFields, collection) {
    const updates = {};

    for (const fieldPath of fieldsToMigrate) {
      const currentValue = this._getNestedValue(doc, fieldPath);
      const fieldDef = schemaFields[fieldPath];

      if (!fieldDef) continue;

      if (currentValue !== undefined && currentValue !== null) {
        const transformed = await this.transformer.transformFieldValue(
          fieldPath,
          currentValue,
          fieldDef.type,
          collection
        );

        if (transformed !== currentValue) {
          updates[fieldPath] = transformed;
        }
        continue;
      }

      if (this.computeResolver.isComputedField(this._getFieldName(fieldPath))) {
        const computed = await this.computeResolver.resolveComputedField(
          this._getFieldName(fieldPath),
          doc,
          collection
        );

        if (computed !== null && computed !== undefined) {
          updates[fieldPath] = computed;
        }
      } else if (fieldDef.schemaDefault !== undefined) {
        updates[fieldPath] = fieldDef.schemaDefault;
      } else if (fieldDef.type === 'String[]') {
        updates[fieldPath] = [];
      } else if (fieldDef.type === 'ObjectId[]') {
        updates[fieldPath] = [];
      } else if (fieldDef.type === 'Boolean') {
        updates[fieldPath] = false;
      } else if (fieldDef.type === 'Number') {
        updates[fieldPath] = 0;
      } else if (fieldDef.type === 'String') {
        updates[fieldPath] = '';
      } else if (fieldDef.type === 'ObjectId') {
        updates[fieldPath] = null;
      } else if (fieldDef.type === 'Date') {
        updates[fieldPath] = null;
      }
    }

    return updates;
  }

  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  _getFieldName(fieldPath) {
    const parts = fieldPath.split('.');
    return parts[parts.length - 1];
  }
}

module.exports = MigrationExecutor;
