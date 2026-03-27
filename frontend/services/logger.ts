/**
 * Production-safe Logger Utility
 * Enables conditional logging based on development environment
 *
 * Usage:
 *   logger.log('Message', data)  - In dev mode only
 *   logger.error('Error', err)   - Always logged
 *   logger.warn('Warning', data) - Only in dev or with flag
 */

const isDev = __DEV__ || process.env.NODE_ENV === "development";

interface LoggerConfig {
  enableDevLogs: boolean;
  enableErrorLogs: boolean;
  enableWarnLogs: boolean;
  prefix?: string;
}

let config: LoggerConfig = {
  enableDevLogs: isDev,
  enableErrorLogs: true,
  enableWarnLogs: true,
  prefix: "[APP]",
};

export const configureLogger = (newConfig: Partial<LoggerConfig>) => {
  config = { ...config, ...newConfig };
};

export const logger = {
  /**
   * Development-only logs (disabled in production)
   */
  log: (message: string, ...args: any[]) => {
    if (config.enableDevLogs) {
      console.log(`${config.prefix} ${message}`, ...args);
    }
  },

  /**
   * Error logs (always enabled)
   */
  error: (message: string, error?: any) => {
    if (config.enableErrorLogs) {
      console.error(`${config.prefix} ERROR: ${message}`, error);
    }
  },

  /**
   * Warning logs (dev-only by default)
   */
  warn: (message: string, ...args: any[]) => {
    if (config.enableWarnLogs) {
      console.warn(`${config.prefix} WARN: ${message}`, ...args);
    }
  },

  /**
   * Info logs (important info, dev-only)
   */
  info: (message: string, ...args: any[]) => {
    if (config.enableDevLogs) {
      console.log(`${config.prefix} INFO: ${message}`, ...args);
    }
  },

  /**
   * Debug logs (verbose, dev-only)
   */
  debug: (message: string, ...args: any[]) => {
    if (config.enableDevLogs && __DEV__) {
      console.log(`${config.prefix} DEBUG: ${message}`, ...args);
    }
  },

  /**
   * Performance monitoring
   */
  time: (label: string) => {
    if (config.enableDevLogs) {
      console.time(`${config.prefix} ${label}`);
    }
  },

  timeEnd: (label: string) => {
    if (config.enableDevLogs) {
      console.timeEnd(`${config.prefix} ${label}`);
    }
  },
};

export default logger;
