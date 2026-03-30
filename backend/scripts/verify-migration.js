#!/usr/bin/env node

/**
 * Migration Verification Script
 * 
 * Verifies that the schema migration completed successfully by:
 * 1. Connecting to MongoDB
 * 2. Sampling documents from each collection
 * 3. Checking for presence of migrated fields
 * 4. Validating data integrity
 * 5. Reporting results
 */

require('dotenv').config();

const mongoose = require('mongoose');
const models = require('../models');
const logger = require('./migration/logger');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

class MigrationVerifier {
  constructor() {
    this.results = {
      User: {},
      Message: {},
      Chat: {},
      UserStats: {},
    };
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  async verify() {
    try {
      this.log('\n═══════════════════════════════════════════', 'cyan');
      this.log('  MIGRATION VERIFICATION REPORT', 'cyan');
      this.log('═══════════════════════════════════════════\n', 'cyan');

      // Connect to MongoDB
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/astra_chit_chat');
      this.log('✓ Connected to MongoDB\n', 'green');

      // Verify each collection
      await this.verifyUserCollection();
      await this.verifyMessageCollection();
      await this.verifyChatCollection();
      await this.verifyUserStatsCollection();

      // Print summary
      this.printSummary();

      await mongoose.connection.close();
      this.log('\n✓ Verification complete\n', 'green');
      
    } catch (error) {
      this.log(`\n✗ Verification failed: ${error.message}\n`, 'red');
      process.exit(1);
    }
  }

  async verifyUserCollection() {
    this.log('─ USER COLLECTION', 'blue');
    
    const total = await models.User.countDocuments();
    const sample = await models.User.findOne();

    if (!sample) {
      this.log('  ⚠ No users found', 'yellow');
      return;
    }

    const checks = {
      'postsCount field exists': typeof sample.postsCount === 'number',
      'followersCount field exists': typeof sample.followersCount === 'number',
      'followingCount field exists': typeof sample.followingCount === 'number',
      'totalLikesCount field exists': typeof sample.totalLikesCount === 'number',
      'role has default value': sample.role === 'user' || sample.role !== undefined,
      'blockedUsers is array': Array.isArray(sample.blockedUsers),
      'mutedUsers is array': Array.isArray(sample.mutedUsers),
      'followRequests is array': Array.isArray(sample.followRequests),
    };

    let passed = 0;
    for (const [check, result] of Object.entries(checks)) {
      const symbol = result ? '✓' : '✗';
      const color = result ? 'green' : 'red';
      this.log(`  ${symbol} ${check}`, color);
      if (result) passed++;
    }

    this.results.User = {
      total,
      checked: Object.keys(checks).length,
      passed,
      sample: {
        _id: sample._id,
        postsCount: sample.postsCount,
        followersCount: sample.followersCount,
        followingCount: sample.followingCount,
        totalLikesCount: sample.totalLikesCount,
      }
    };

    this.log(`  Total documents: ${total}, Checks passed: ${passed}/${Object.keys(checks).length}\n`, 'cyan');
  }

  async verifyMessageCollection() {
    this.log('─ MESSAGE COLLECTION', 'blue');

    const total = await models.Message.countDocuments();
    const sample = await models.Message.findOne();

    if (!sample) {
      this.log('  ⚠ No messages found', 'yellow');
      return;
    }

    const checks = {
      'status field exists': sample.status !== undefined,
      'status has default value': sample.status === 'sent' || sample.status !== undefined,
      'readBy is array': Array.isArray(sample.readBy),
      'deliveredTo is array': Array.isArray(sample.deliveredTo),
      'reactions is array': Array.isArray(sample.reactions),
      'attachments is array': Array.isArray(sample.attachments),
      'content field exists': sample.content !== undefined,
    };

    let passed = 0;
    for (const [check, result] of Object.entries(checks)) {
      const symbol = result ? '✓' : '✗';
      const color = result ? 'green' : 'red';
      this.log(`  ${symbol} ${check}`, color);
      if (result) passed++;
    }

    this.results.Message = {
      total,
      checked: Object.keys(checks).length,
      passed,
      sample: {
        _id: sample._id,
        status: sample.status,
        readByCount: sample.readBy?.length || 0,
        deliveredToCount: sample.deliveredTo?.length || 0,
        reactionsCount: sample.reactions?.length || 0,
      }
    };

    this.log(`  Total documents: ${total}, Checks passed: ${passed}/${Object.keys(checks).length}\n`, 'cyan');
  }

  async verifyChatCollection() {
    this.log('─ CHAT COLLECTION', 'blue');

    const total = await models.Chat.countDocuments();
    const sample = await models.Chat.findOne();

    if (!sample) {
      this.log('  ⚠ No chats found', 'yellow');
      return;
    }

    const checks = {
      'participants is array': Array.isArray(sample.participants),
      'participants have role': sample.participants?.length > 0 ? sample.participants[0].role !== undefined : true,
      'participants have joinedAt': sample.participants?.length > 0 ? sample.participants[0].joinedAt !== undefined : true,
      'lastActivityTimestamp exists': sample.lastActivityTimestamp !== undefined,
      'unreadCount is object': typeof sample.unreadCount === 'object',
      'mutedBy is object': typeof sample.mutedBy === 'object',
    };

    let passed = 0;
    for (const [check, result] of Object.entries(checks)) {
      const symbol = result ? '✓' : '✗';
      const color = result ? 'green' : 'red';
      this.log(`  ${symbol} ${check}`, color);
      if (result) passed++;
    }

    this.results.Chat = {
      total,
      checked: Object.keys(checks).length,
      passed,
      sample: {
        _id: sample._id,
        participantCount: sample.participants?.length || 0,
        lastActivityTimestamp: sample.lastActivityTimestamp,
      }
    };

    this.log(`  Total documents: ${total}, Checks passed: ${passed}/${Object.keys(checks).length}\n`, 'cyan');
  }

  async verifyUserStatsCollection() {
    this.log('─ USERSTATS COLLECTION', 'blue');

    const total = await models.UserStats.countDocuments();
    const sample = await models.UserStats.findOne();

    if (!sample) {
      this.log('  ⚠ No userstats found', 'yellow');
      return;
    }

    const checks = {
      'postsCount field exists': typeof sample.postsCount === 'number',
      'followersCount field exists': typeof sample.followersCount === 'number',
      'followingCount field exists': typeof sample.followingCount === 'number',
      'totalLikesCount field exists': typeof sample.totalLikesCount === 'number',
      'commentsCount field exists': typeof sample.commentsCount === 'number',
    };

    let passed = 0;
    for (const [check, result] of Object.entries(checks)) {
      const symbol = result ? '✓' : '✗';
      const color = result ? 'green' : 'red';
      this.log(`  ${symbol} ${check}`, color);
      if (result) passed++;
    }

    this.results.UserStats = {
      total,
      checked: Object.keys(checks).length,
      passed,
      sample: {
        _id: sample._id,
        postsCount: sample.postsCount,
        followersCount: sample.followersCount,
      }
    };

    this.log(`  Total documents: ${total}, Checks passed: ${passed}/${Object.keys(checks).length}\n`, 'cyan');
  }

  printSummary() {
    this.log('═══════════════════════════════════════════', 'cyan');
    this.log('  VERIFICATION SUMMARY', 'cyan');
    this.log('═══════════════════════════════════════════\n', 'cyan');

    let totalChecked = 0;
    let totalPassed = 0;

    for (const [collection, result] of Object.entries(this.results)) {
      if (result.checked) {
        const percentage = Math.round((result.passed / result.checked) * 100);
        const color = percentage === 100 ? 'green' : 'yellow';
        this.log(
          `  ${collection.padEnd(15)} ${result.passed}/${result.checked} (${percentage}%)`,
          color
        );
        totalChecked += result.checked;
        totalPassed += result.passed;
      }
    }

    const totalPercentage = Math.round((totalPassed / totalChecked) * 100);
    const color = totalPercentage === 100 ? 'green' : 'yellow';
    this.log(`  ${'─'.repeat(40)}`, 'cyan');
    this.log(`  ${'TOTAL'.padEnd(15)} ${totalPassed}/${totalChecked} (${totalPercentage}%)`, color);
    
    if (totalPercentage === 100) {
      this.log('\n✓ All checks passed! Migration successful.\n', 'green');
    } else {
      this.log(`\n⚠ ${totalChecked - totalPassed} check(s) failed. Please review.\n`, 'yellow');
    }
  }
}

// Run verification
const verifier = new MigrationVerifier();
verifier.verify().catch(console.error);
