import { Global, Module } from '@nestjs/common';
import { TracingService } from './tracing.service';
import { TracingInterceptor } from './interceptors/tracing.interceptor';

/**
 * TracingModule
 * Story 14.4: Jaeger Distributed Tracing (AC3)
 *
 * Global NestJS module providing OpenTelemetry distributed tracing.
 * Exports TracingService for manual span creation and provides
 * TracingInterceptor for automatic HTTP span enrichment.
 */
@Global()
@Module({
  providers: [TracingService, TracingInterceptor],
  exports: [TracingService, TracingInterceptor],
})
export class TracingModule {}
