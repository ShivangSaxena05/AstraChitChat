const readline = require('readline');
const logger = require('./logger');

class MigrationPlanner {
  constructor(discovery) {
    this.discovery = discovery;
    this.plan = [];
    this.totalAffected = 0;
  }

  async buildPlan(models, collections) {
    logger.section('BUILDING MIGRATION PLAN');
    
    const plans = [];

    for (const collectionName of collections) {
      const model = models[collectionName];
      if (!model) {
        logger.warn('Plan', `Collection ${collectionName} not found in models`);
        continue;
      }

      const schemaFields = this.discovery.introspectSchema(collectionName);
      
      let sampleSize = 500;
      const totalCount = await model.countDocuments();
      
      if (totalCount === 0) {
        logger.warn('Plan', `Collection ${collectionName} is empty, skipping`);
        continue;
      }

      const sampleDocuments = await model.find({}).limit(sampleSize).lean();
      
      const { issues, fieldsNeedingMigration } = 
        await this.discovery.diffDocuments(collectionName, sampleDocuments, schemaFields);

      if (issues.length === 0) {
        logger.info('Plan', `${collectionName}: No migration needed`);
        continue;
      }

      plans.push({
        collection: collectionName,
        totalCount,
        sampleCount: sampleDocuments.length,
        issues,
        fieldsNeedingMigration,
      });

      issues.forEach(issue => {
        this.totalAffected += issue.affectedDocs;
      });
    }

    if (plans.length === 0) {
      logger.summary('No migration needed for any collection');
      return { plans: [], hasChanges: false };
    }

    this._displayPlan(plans);
    return { plans, hasChanges: true };
  }

  _displayPlan(plans) {
    console.log('\n');
    
    const rows = [];
    plans.forEach(plan => {
      plan.issues.forEach(issue => {
        rows.push([
          plan.collection,
          issue.path,
          issue.category,
          issue.affectedDocs,
          issue.schemaDefault ?? 'N/A',
        ]);
      });
    });

    logger.table(
      ['Collection', 'Field', 'Issue', 'Affected', 'Action'],
      rows
    );

    logger.plan(`Total documents estimated to be affected: ${this.totalAffected}`);
    logger.plan(`Total collections to process: ${plans.length}`);
    console.log('');
  }

  async promptUser() {
    if (logger.isDryRun) {
      logger.info('Migration', 'Running in DRY RUN mode - no changes will be made');
      return true;
    }

    return new Promise(resolve => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(
        '\n➜ Proceed with migration? (yes/no): ',
        answer => {
          rl.close();
          resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
        }
      );
    });
  }
}

module.exports = MigrationPlanner;
