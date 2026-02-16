import { Global, Module } from '@nestjs/common';
import { LoggingService } from './logging.service';
import { CorrelationIdMiddleware } from './middleware/correlation-id.middleware';
import { RequestLoggingInterceptor } from './interceptors/request-logging.interceptor';

/**
 * LoggingModule
 * Story 14.3: Loki Log Aggregation (AC5)
 *
 * Global NestJS module providing structured JSON logging via Winston.
 * Exports LoggingService which implements NestJS LoggerService interface.
 *
 * Provides:
 * - LoggingService: Winston-based structured logger
 * - CorrelationIdMiddleware: Trace ID generation/propagation
 * - RequestLoggingInterceptor: HTTP request/response logging
 */
@Global()
@Module({
  providers: [LoggingService, CorrelationIdMiddleware, RequestLoggingInterceptor],
  exports: [LoggingService, CorrelationIdMiddleware, RequestLoggingInterceptor],
})
export class LoggingModule {}
