const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.colors = {
      reset: '\x1b[0m',
      dim: '\x1b[2m',
      bright: '\x1b[1m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      cyan: '\x1b[36m',
      gray: '\x1b[90m',
    };

    this.isDryRun = false;
    this.logFile = path.join(process.cwd(), 'migration.log');
    this.rollbackFile = path.join(process.cwd(), 'migration-rollback.jsonl');
    
    // Clear previous logs
    try {
      fs.unlinkSync(this.logFile);
      fs.unlinkSync(this.rollbackFile);
    } catch (e) {
      // Files don't exist, that's fine
    }
  }

  setDryRun(isDryRun) {
    this.isDryRun = isDryRun;
  }

  _writeLog(message) {
    try {
      fs.appendFileSync(this.logFile, message + '\n', 'utf-8');
    } catch (e) {
      console.error('Failed to write to log file:', e.message);
    }
  }

  _log(level, tag, message, color) {
    const timestamp = new Date().toISOString();
    const colorCode = this.colors[color] || '';
    const reset = this.colors.reset;
    const dryRunPrefix = this.isDryRun ? '[DRY RUN] ' : '';
    
    const formatted = `${colorCode}${dryRunPrefix}[${tag}] ${message}${reset}`;
    console.log(formatted);
    
    this._writeLog(`[${timestamp}] [${tag}] ${dryRunPrefix}${message}`);
  }

  discovery(message) {
    this._log('info', 'Discovery', message, 'cyan');
  }

  plan(message) {
    this._log('info', 'Plan', message, 'blue');
  }

  batch(collection, message) {
    this._log('info', collection, message, 'green');
  }

  summary(message) {
    this._log('info', 'Summary', message, 'bright');
  }

  error(collection, message) {
    this._log('error', collection, message, 'red');
  }

  warn(collection, message) {
    this._log('warn', collection, message, 'yellow');
  }

  info(collection, message) {
    this._log('info', collection, message, 'dim');
  }

  section(title) {
    const line = '─'.repeat(60);
    console.log(`\n${this.colors.bright}${line}`);
    console.log(`  ${title}`);
    console.log(`${line}${this.colors.reset}\n`);
    this._writeLog(`\n${'─'.repeat(60)}\n  ${title}\n${'─'.repeat(60)}\n`);
  }

  table(headers, rows) {
    const colWidths = headers.map((h, i) => 
      Math.max(h.length, ...rows.map(r => String(r[i] || '').length))
    );

    const separator = colWidths.map(w => '─'.repeat(w + 2)).join('');
    const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join('  ');

    console.log(separator);
    console.log(headerRow);
    console.log(separator);

    rows.forEach(row => {
      const dataRow = row.map((cell, i) => String(cell || '').padEnd(colWidths[i])).join('  ');
      console.log(dataRow);
    });

    console.log(separator);
    this._writeLog(`\n${separator}\n${headerRow}\n${separator}`);
    rows.forEach(row => {
      this._writeLog(row.map((cell, i) => String(cell || '').padEnd(colWidths[i])).join('  '));
    });
    this._writeLog(separator);
  }

  rollback(collection, docId, beforeFields, timestamp) {
    const entry = JSON.stringify({
      collection,
      id: docId,
      before: beforeFields,
      ts: timestamp,
    });
    
    try {
      fs.appendFileSync(this.rollbackFile, entry + '\n', 'utf-8');
    } catch (e) {
      this.error(collection, `Failed to write rollback entry: ${e.message}`);
    }
  }

  success(message) {
    console.log(`\n${this.colors.green}${this.colors.bright}✓ ${message}${this.colors.reset}\n`);
    this._writeLog(`✓ ${message}`);
  }

  failed(message) {
    console.log(`\n${this.colors.red}${this.colors.bright}✗ ${message}${this.colors.reset}\n`);
    this._writeLog(`✗ ${message}`);
  }
}

module.exports = new Logger();
