import { trace, Tracer, SpanStatusCode } from '@opentelemetry/api';

// Cached tracer instance to avoid repeated getTracer() calls on hot paths
let cachedTracer: Tracer | undefined;
function getTracer(): Tracer {
  if (!cachedTracer) {
    cachedTracer = trace.getTracer('devos-api');
  }
  return cachedTracer;
}

/**
 * @TraceSpan Decorator
 * Story 14.4: Jaeger Distributed Tracing (AC6)
 *
 * Method decorator that wraps the decorated method in an OpenTelemetry child span.
 * Automatically captures the method name as the span name if not provided.
 * Records exceptions if the method throws and sets span status on completion.
 *
 * Works with both synchronous and asynchronous methods.
 *
 * @param name - Optional custom span name. Defaults to "ClassName.methodName".
 *
 * @example
 * ```typescript
 * @TraceSpan('byok.decrypt')
 * async decryptKey(keyId: string): Promise<string> {
 *   // Method body - automatically wrapped in a span
 * }
 * ```
 */
export function TraceSpan(name?: string): MethodDecorator {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const spanName =
      name || `${target.constructor.name}.${String(propertyKey)}`;

    descriptor.value = function (...args: unknown[]) {
      const tracer = getTracer();
      const activeSpan = trace.getActiveSpan();

      // No-op when tracing is disabled (no active tracer / no active context)
      if (!activeSpan) {
        return originalMethod.apply(this, args);
      }

      return tracer.startActiveSpan(spanName, (span) => {
        try {
          const result = originalMethod.apply(this, args);

          // Handle async methods (Promise-returning)
          if (result && typeof result === 'object' && typeof result.then === 'function') {
            return (result as Promise<unknown>)
              .then((value: unknown) => {
                span.setStatus({ code: SpanStatusCode.OK });
                span.end();
                return value;
              })
              .catch((error: Error) => {
                span.recordException(error);
                span.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: error.message,
                });
                span.end();
                throw error;
              });
          }

          // Synchronous methods
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return result;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (error as Error).message,
          });
          span.end();
          throw error;
        }
      });
    };

    return descriptor;
  };
}
