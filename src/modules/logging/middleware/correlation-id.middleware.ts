import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { trace } from '@opentelemetry/api';
import { loggingContext, RequestContext } from '../logging.context';

/**
 * CorrelationIdMiddleware
 * Story 14.3: Loki Log Aggregation (AC5)
 * Story 14.4: Jaeger Distributed Tracing (AC4)
 *
 * NestJS middleware that generates or propagates a correlation/trace ID
 * for every incoming HTTP request. The trace ID is stored in AsyncLocalStorage
 * so it can be retrieved anywhere in the request lifecycle.
 *
 * Header precedence:
 * 1. x-trace-id (highest)
 * 2. x-correlation-id
 * 3. OpenTelemetry trace ID (when OTel is active)
 * 4. Auto-generated UUID v4 (fallback)
 *
 * When OpenTelemetry is active and no header override is present,
 * the OTel trace ID is used as the correlation ID to enable seamless
 * click-through from Loki logs to Jaeger traces in Grafana.
 *
 * Always attaches the trace ID as the x-trace-id response header.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Check for explicit header-based trace IDs first
    const headerTraceId =
      (req.headers['x-trace-id'] as string) ||
      (req.headers['x-correlation-id'] as string);

    // Try to get OTel trace ID from active span
    let otelTraceId: string | undefined;
    let otelSpanId: string | undefined;
    try {
      const activeSpan = trace.getActiveSpan();
      if (activeSpan) {
        const spanContext = activeSpan.spanContext();
        // Verify trace ID is valid (not all zeros)
        if (
          spanContext.traceId &&
          spanContext.traceId !== '00000000000000000000000000000000'
        ) {
          otelTraceId = spanContext.traceId;
        }
        if (
          spanContext.spanId &&
          spanContext.spanId !== '0000000000000000'
        ) {
          otelSpanId = spanContext.spanId;
        }
      }
    } catch {
      // OTel not available, fall back to UUID
    }

    // Priority: header > OTel trace ID > UUID v4
    const traceId = headerTraceId || otelTraceId || uuidv4();

    // Attach trace ID to response headers
    res.setHeader('x-trace-id', traceId);

    // Extract workspace from headers (available at middleware time).
    // Note: userId is NOT extracted here because req.user is populated by
    // JWT auth guards which run AFTER middleware in the NestJS lifecycle.
    // The RequestLoggingInterceptor reads userId directly from the request
    // object after guards have executed.
    const workspaceId =
      (req as any).workspaceId ||
      (req.headers['x-workspace-id'] as string);

    const context: RequestContext = {
      traceId,
      spanId: otelSpanId,
      workspaceId,
    };

    // Run the rest of the request inside the async local storage context
    loggingContext.run(context, () => {
      next();
    });
  }
}
