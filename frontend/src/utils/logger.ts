/**
 * Frontend Logging Utility
 * Provides structured logging with different levels and proper formatting
 */

export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

class Logger {
  private level: LogLevel;
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.level = this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;
  }

  private formatMessage(level: string, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}]`;
    
    if (args.length > 0) {
      return `${prefix} ${message} ${JSON.stringify(args)}`;
    }
    return `${prefix} ${message}`;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage('DEBUG', message, ...args));
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage('INFO', message, ...args));
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message, ...args));
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', message, ...args));
    }
  }

  // Specialized logging methods for common use cases
  apiCall(method: string, url: string, data?: unknown): void {
    this.debug(`API ${method} ${url}`, data);
  }

  apiResponse(method: string, url: string, status: number, data?: unknown): void {
    if (status >= 400) {
      this.error(`API ${method} ${url} failed with status ${status}`, data);
    } else {
      this.debug(`API ${method} ${url} succeeded with status ${status}`, data);
    }
  }

  userAction(action: string, details?: unknown): void {
    this.info(`User action: ${action}`, details);
  }

  componentLifecycle(component: string, lifecycle: string, props?: unknown): void {
    this.debug(`Component ${component} ${lifecycle}`, props);
  }

  performance(operation: string, duration: number): void {
    this.info(`Performance: ${operation} took ${duration}ms`);
  }
}

// Create singleton instance
export const logger = new Logger();

// Export for easy importing
export default logger;
