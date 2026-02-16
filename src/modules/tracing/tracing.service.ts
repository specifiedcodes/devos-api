import { Injectable } from '@nestjs/common';
import {
  trace,
  context,
  Span,
  SpanOptions,
  SpanStatusCode,
  Tracer,
} from '@opentelemetry/api';

/**
 * TracingService
 * Story 14.4: Jaeger Distributed Tracing (AC3)
 *
 * Wraps OpenTelemetry trace API for convenient span creation and management.
 * Provides helper methods for starting spans, recording exceptions, and
 * setting standardized attributes for DB, HTTP, and AI operations.
 */
@Injectable()
export class TracingService {
  private readonly tracer: Tracer;

  constructor() {
    this.tracer = trace.getTracer('devos-api');
  }

  /**
   * Start a new span with the given name and options.
   */
  startSpan(name: string, options?: SpanOptions): Span {
    return this.tracer.startSpan(name, options);
  }

  /**
   * Start a span and run the callback within its context.
   * The span is automatically ended when the callback completes.
   */
  async startActiveSpan<T>(
    name: string,
    fn: (span: Span) => T | Promise<T>,
  ): Promise<T> {
    return this.tracer.startActiveSpan(name, async (span: Span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        this.recordException(span, error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Record an exception on a span, setting its status to ERROR.
   */
  recordException(span: Span, error: Error): void {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  }

  /**
   * Set multiple attributes on a span.
   */
  setSpanAttributes(
    span: Span,
    attributes: Record<string, string | number | boolean>,
  ): void {
    span.setAttributes(attributes);
  }

  /**
   * Get the current OpenTelemetry trace ID from the active span context.
   * Returns undefined when no active span exists (tracing disabled).
   */
  getCurrentTraceId(): string | undefined {
    const span = trace.getActiveSpan();
    if (!span) {
      return undefined;
    }
    const spanContext = span.spanContext();
    // Check if the trace ID is valid (not all zeros)
    if (spanContext.traceId === '00000000000000000000000000000000') {
      return undefined;
    }
    return spanContext.traceId;
  }

  /**
   * Get the current OpenTelemetry span ID from the active span context.
   * Returns undefined when no active span exists.
   */
  getCurrentSpanId(): string | undefined {
    const span = trace.getActiveSpan();
    if (!span) {
      return undefined;
    }
    const spanContext = span.spanContext();
    // Check if the span ID is valid (not all zeros)
    if (spanContext.spanId === '0000000000000000') {
      return undefined;
    }
    return spanContext.spanId;
  }

  /**
   * Set database-related attributes on a span.
   * @param system - Database system identifier (default: 'postgresql').
   *                 Use 'neo4j' for graph queries, 'redis' for cache operations, etc.
   */
  setDbAttributes(
    span: Span,
    operation: string,
    table: string,
    system: string = 'postgresql',
  ): void {
    span.setAttributes({
      'db.system': system,
      'db.operation': operation,
      'db.sql.table': table,
    });
  }

  /**
   * Set HTTP-related attributes on a span.
   * Uses stable OTel semantic convention attribute names (v1.21+).
   * Legacy names (http.method, http.url, http.status_code) are also set
   * for backward compatibility with older Jaeger/Grafana dashboards.
   */
  setHttpAttributes(
    span: Span,
    method: string,
    url: string,
    statusCode: number,
  ): void {
    span.setAttributes({
      'http.request.method': method,
      'url.full': url,
      'http.response.status_code': statusCode,
      // Legacy attributes for backward compatibility
      'http.method': method,
      'http.url': url,
      'http.status_code': statusCode,
    });
  }

  /**
   * Set AI operation-related attributes on a span.
   */
  setAiAttributes(
    span: Span,
    provider: string,
    model: string,
    tokens: number,
  ): void {
    span.setAttributes({
      'ai.provider': provider,
      'ai.model': model,
      'ai.tokens': tokens,
    });
  }

  /**
   * Get the active OpenTelemetry context (for advanced use cases).
   */
  getActiveContext() {
    return context.active();
  }

  /**
   * Get the underlying tracer instance (for testing).
   */
  getTracer(): Tracer {
    return this.tracer;
  }
}
