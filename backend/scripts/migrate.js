require('dotenv').config();

const path = require('path');
const mongoose = require('mongoose');
const logger = require('./migration/logger');
const SchemaDiscovery = require('./migration/discover');
const MigrationPlanner = require('./migration/plan');
const ComputeFieldResolver = require('./migration/compute');
const StructuralTransformer = require('./migration/transform');
const MigrationExecutor = require('./migration/executor');

const models = require('../models');

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_CONCURRENCY = 3;

class MigrationOrchestrator {
  constructor(options = {}) {
    this.batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
    this.concurrency = options.concurrency || DEFAULT_CONCURRENCY;
    this.dryRun = options.dryRun || false;
    this.specificCollections = options.collections || null;
    this.isConnected = false;

    logger.setDryRun(this.dryRun);

    this.discovery = new SchemaDiscovery(models);
    this.planner = new MigrationPlanner(this.discovery);
    this.computeResolver = new ComputeFieldResolver(models);
    this.transformer = new StructuralTransformer();
    this.executor = new MigrationExecutor(this.computeResolver, this.transformer);

    this.dependencies = {
      Follow: [],
      Like: [],
      Post: ['Like', 'Comment'],
      Comment: ['Like'],
      User: ['Post', 'Follow'],
      Message: [],
      Chat: [],
      Report: [],
      MessageReaction: [],
      MessageReceipt: [],
      UserStats: [],
    };

    this.migrationOrder = this._calculateMigrationOrder();
  }

  _calculateMigrationOrder() {
    const visited = new Set();
    const order = [];

    const visit = (collection) => {
      if (visited.has(collection)) return;
      visited.add(collection);

      const deps = this.dependencies[collection] || [];
      deps.forEach(dep => visit(dep));

      order.push(collection);
    };

    const collectionsToMigrate = this.specificCollections 
      ? this.specificCollections.split(',').map(c => c.trim())
      : Object.keys(this.dependencies);

    collectionsToMigrate.forEach(collection => visit(collection));

    return order;
  }

  async connect() {
    try {
      const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
      
      if (!mongoUri) {
        throw new Error('MONGODB_URI or MONGO_URI environment variable is not set');
      }

      await mongoose.connect(mongoUri, {
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        serverSelectionTimeoutMS: 5000,
      });

      this.isConnected = true;
      logger.success('Connected to MongoDB');
    } catch (error) {
      logger.failed(`Failed to connect to MongoDB: ${error.message}`);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.isConnected) {
        await mongoose.disconnect();
        logger.success('Disconnected from MongoDB');
        this.isConnected = false;
      }
    } catch (error) {
      logger.error('Migration', `Disconnect error: ${error.message}`);
    }
  }

  async run() {
    const overallStart = Date.now();

    try {
      logger.section('SCHEMA MIGRATION TOOL');
      logger.info('Migration', `Environment: ${this.dryRun ? 'DRY RUN' : 'PRODUCTION'}`);
      logger.info('Migration', `Batch size: ${this.batchSize}`);
      logger.info('Migration', `Concurrency: ${this.concurrency}`);

      await this.connect();

      logger.discovery('Scanning schema definitions and database...');
      const { plans, hasChanges } = await this.planner.buildPlan(
        models,
        this.migrationOrder
      );

      if (!hasChanges) {
        logger.success('No migration needed');
        return;
      }

      const proceed = await this.planner.promptUser();
      if (!proceed) {
        logger.failed('Migration cancelled by user');
        return;
      }

      logger.section('EXECUTING MIGRATION');

      const results = new Map();
      let processedCount = 0;

      for (const collectionName of this.migrationOrder) {
        if (!models[collectionName]) {
          continue;
        }

        const plan = plans.find(p => p.collection === collectionName);
        if (!plan) {
          continue;
        }

        logger.batch(collectionName, `Starting migration...`);

        const result = await this.executor.migrateCollection(
          collectionName,
          models[collectionName],
          plan.fieldsNeedingMigration,
          this.discovery.introspectSchema(collectionName),
          this.batchSize,
          this.dryRun
        );

        results.set(collectionName, result);
        processedCount++;
      }

      this._printSummary(results, overallStart);

      if (this.dryRun) {
        logger.info('Migration', 'DRY RUN: No actual changes were made');
      }
    } catch (error) {
      logger.error('Migration', `Fatal error: ${error.message}`);
      logger.failed('Migration failed');
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }

  _printSummary(results, startTime) {
    logger.section('MIGRATION SUMMARY');

    const rows = [];
    let totalScanned = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const [collection, result] of results) {
      rows.push([
        collection,
        result.scanned,
        result.updated,
        result.skipped,
        result.errors > 0 ? `${result.errors} ✗` : '0',
        `${result.time}s`,
      ]);

      totalScanned += result.scanned;
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
    }

    logger.table(
      ['Collection', 'Scanned', 'Updated', 'Skipped', 'Errors', 'Time'],
      rows
    );

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

    logger.summary(`Total scanned: ${totalScanned}`);
    logger.summary(`Total updated: ${totalUpdated}`);
    logger.summary(`Total skipped: ${totalSkipped}`);
    logger.summary(`Total errors: ${totalErrors}`);
    logger.summary(`Total time: ${totalTime}s`);

    if (totalUpdated > 0) {
      logger.success(
        `Migration complete! ${totalUpdated} documents updated. Rollback log: migration-rollback.jsonl`
      );
    } else {
      logger.success('Migration complete! No updates needed.');
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run'),
    batchSize: parseInt(
      args.find(a => a.startsWith('--batch'))?.split('=')[1] || 
      args[args.indexOf('--batch') + 1],
      10
    ) || DEFAULT_BATCH_SIZE,
    concurrency: parseInt(
      args.find(a => a.startsWith('--concurrency'))?.split('=')[1] || 
      args[args.indexOf('--concurrency') + 1],
      10
    ) || DEFAULT_CONCURRENCY,
    collections: args.find(a => a.startsWith('--collections'))?.split('=')[1],
  };

  const orchestrator = new MigrationOrchestrator(options);
  await orchestrator.run();
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = MigrationOrchestrator;
