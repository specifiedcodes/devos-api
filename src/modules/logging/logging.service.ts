import { LoggerService, Injectable } from '@nestjs/common';
import * as winston from 'winston';
import { getTraceId, getUserId, getWorkspaceId, getSpanId } from './logging.context';

/**
 * LoggingService
 * Story 14.3: Loki Log Aggregation (AC4)
 *
 * NestJS LoggerService implementation backed by Winston.
 * Produces structured JSON logs with correlation IDs, service name,
 * and request context. Supports sensitive field sanitization.
 *
 * Environment variables:
 * - LOG_LEVEL: error | warn | info | debug | verbose (default: "info")
 * - LOG_FORMAT: "json" (default) | "pretty"
 * - LOG_SERVICE_NAME: service identifier (default: "devos-api")
 */

/** Fields that must be redacted from log output */
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'apiKey',
  'secret',
  'authorization',
  'api_key',
  'accessToken',
  'refreshToken',
];

@Injectable()
export class LoggingService implements LoggerService {
  private readonly logger: winston.Logger;
  private readonly serviceName: string;

  constructor() {
    this.serviceName = process.env.LOG_SERVICE_NAME || 'devos-api';
    const level = this.mapLogLevel(process.env.LOG_LEVEL || 'info');
    const formatType = process.env.LOG_FORMAT || 'json';

    const formatters =
      formatType === 'pretty'
        ? winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level: lvl, message, ...meta }) => {
              const ctx = meta.context ? `[${meta.context}]` : '';
              const traceId = meta.traceId ? `(${meta.traceId})` : '';
              return `${timestamp} ${lvl} ${ctx} ${traceId} ${message}`;
            }),
          )
        : winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          );

    this.logger = winston.createLogger({
      level,
      defaultMeta: { service: this.serviceName },
      format: formatters,
      transports: [new winston.transports.Console()],
    });
  }

  /**
   * Map NestJS-style log levels to Winston log levels.
   *
   * NestJS level hierarchy (least to most verbose): error > warn > log > debug > verbose
   * Winston NPM level hierarchy (by priority number): error(0) > warn(1) > info(2) > http(3) > verbose(4) > debug(5) > silly(6)
   *
   * NestJS "verbose" is the MOST permissive level (shows everything).
   * Winston "verbose" (priority 4) is MORE restrictive than "debug" (priority 5).
   * So NestJS "verbose" must map to Winston "debug" (the most permissive named level
   * that covers verbose+debug+info+warn+error).
   */
  private mapLogLevel(level: string): string {
    const mapping: Record<string, string> = {
      error: 'error',
      warn: 'warn',
      info: 'info',
      debug: 'verbose',
      verbose: 'debug',
    };
    return mapping[level] || 'info';
  }

  log(message: any, context?: string): void {
    const meta = this.buildMeta(context);
    this.logMessage('info', message, meta);
  }

  error(message: any, trace?: string, context?: string): void {
    const meta = this.buildMeta(context);
    if (trace) {
      meta.error = trace;
    }
    this.logMessage('error', message, meta);
  }

  warn(message: any, context?: string): void {
    const meta = this.buildMeta(context);
    this.logMessage('warn', message, meta);
  }

  debug(message: any, context?: string): void {
    const meta = this.buildMeta(context);
    this.logMessage('debug', message, meta);
  }

  verbose(message: any, context?: string): void {
    const meta = this.buildMeta(context);
    this.logMessage('verbose', message, meta);
  }

  /**
   * Internal method to handle logging with proper structured data support.
   * If message is an object, its properties are merged into meta as top-level
   * fields (using the object's 'message' property as the log message string).
   * This ensures structured fields like method, path, statusCode, duration
   * appear as top-level JSON fields in log output rather than being
   * double-encoded inside the message string.
   */
  private logMessage(level: string, message: any, meta: Record<string, any>): void {
    const sanitized = this.sanitize(message);
    if (sanitized !== null && typeof sanitized === 'object' && !Array.isArray(sanitized)) {
      const { message: msg, ...rest } = sanitized;
      Object.assign(meta, rest);
      this.logger.log(level, msg || '', meta);
    } else {
      this.logger.log(level, sanitized, meta);
    }
  }

  /**
   * Build metadata object with request context from AsyncLocalStorage.
   * Story 14.4: Added spanId for Jaeger trace-to-log correlation.
   */
  private buildMeta(context?: string): Record<string, any> {
    const meta: Record<string, any> = {};
    if (context) {
      meta.context = context;
    }
    const traceId = getTraceId();
    if (traceId) {
      meta.traceId = traceId;
    }
    const spanId = getSpanId();
    if (spanId) {
      meta.spanId = spanId;
    }
    const userId = getUserId();
    if (userId) {
      meta.userId = userId;
    }
    const workspaceId = getWorkspaceId();
    if (workspaceId) {
      meta.workspaceId = workspaceId;
    }
    return meta;
  }

  /**
   * Sanitize log message/object to strip sensitive fields.
   */
  sanitize(data: any): any {
    if (data === null || data === undefined) {
      return String(data);
    }
    if (typeof data === 'string') {
      return data;
    }
    if (typeof data === 'object') {
      return this.sanitizeObject({ ...data });
    }
    return data;
  }

  /**
   * Recursively sanitize an object, replacing sensitive field values with '[REDACTED]'.
   * Also traverses arrays to sanitize objects within them.
   */
  private sanitizeObject(obj: Record<string, any>): Record<string, any> {
    for (const key of Object.keys(obj)) {
      if (SENSITIVE_FIELDS.some((f) => key.toLowerCase().includes(f.toLowerCase()))) {
        obj[key] = '[REDACTED]';
      } else if (Array.isArray(obj[key])) {
        obj[key] = obj[key].map((item: any) => {
          if (item && typeof item === 'object') {
            return this.sanitizeObject({ ...item });
          }
          return item;
        });
      } else if (obj[key] && typeof obj[key] === 'object') {
        obj[key] = this.sanitizeObject({ ...obj[key] });
      }
    }
    return obj;
  }

  /**
   * Get the underlying Winston logger instance (for testing).
   */
  getWinstonLogger(): winston.Logger {
    return this.logger;
  }

  /**
   * Get the configured service name (for testing).
   */
  getServiceName(): string {
    return this.serviceName;
  }
}
