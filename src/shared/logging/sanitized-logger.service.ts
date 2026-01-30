import { Injectable, Logger, LoggerService } from '@nestjs/common';
import { sanitizeLogData } from './log-sanitizer';

/**
 * Custom Logger that automatically sanitizes all log messages
 * to prevent API keys and sensitive data from appearing in logs
 */
@Injectable()
export class SanitizedLoggerService implements LoggerService {
  private logger: Logger;

  constructor(context?: string) {
    this.logger = new Logger(context || 'Application');
  }

  /**
   * Set the logger context
   */
  setContext(context: string): void {
    this.logger = new Logger(context);
  }

  /**
   * Log a message (automatically sanitized)
   */
  log(message: any, context?: string): void {
    this.logger.log(sanitizeLogData(message), context);
  }

  /**
   * Log an error (automatically sanitized)
   */
  error(message: any, trace?: string, context?: string): void {
    const sanitized = sanitizeLogData(message);
    this.logger.error(sanitized, trace, context);
  }

  /**
   * Log a warning (automatically sanitized)
   */
  warn(message: any, context?: string): void {
    this.logger.warn(sanitizeLogData(message), context);
  }

  /**
   * Log debug information (automatically sanitized)
   */
  debug(message: any, context?: string): void {
    this.logger.debug(sanitizeLogData(message), context);
  }

  /**
   * Log verbose information (automatically sanitized)
   */
  verbose(message: any, context?: string): void {
    this.logger.verbose(sanitizeLogData(message), context);
  }

  /**
   * Log fatal error (automatically sanitized)
   */
  fatal(message: any, trace?: string, context?: string): void {
    const sanitized = sanitizeLogData(message);
    this.logger.fatal(sanitized, trace, context);
  }
}
