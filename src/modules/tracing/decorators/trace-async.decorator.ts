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
 * @TraceAsync Decorator
 * Story 14.4: Jaeger Distributed Tracing (AC6)
 *
 * Method decorator optimized for async/Promise-returning methods.
 * Creates a child span wrapping the decorated async method.
 * Automatically captures the method name as the span name if not provided.
 * Records exceptions if the method throws and sets span status on completion.
 *
 * @param name - Optional custom span name. Defaults to "ClassName.methodName".
 *
 * @example
 * ```typescript
 * @TraceAsync('ai.generateResponse')
 * async generateResponse(prompt: string): Promise<string> {
 *   // Async method body - automatically wrapped in a span
 * }
 * ```
 */
export function TraceAsync(name?: string): MethodDecorator {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const spanName =
      name || `${target.constructor.name}.${String(propertyKey)}`;

    descriptor.value = async function (...args: unknown[]) {
      const tracer = getTracer();
      const activeSpan = trace.getActiveSpan();

      // No-op when tracing is disabled (no active tracer / no active context)
      if (!activeSpan) {
        return originalMethod.apply(this, args);
      }

      return tracer.startActiveSpan(spanName, async (span) => {
        try {
          const result = await originalMethod.apply(this, args);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (error as Error).message,
          });
          throw error;
        } finally {
          span.end();
        }
      });
    };

    return descriptor;
  };
}
