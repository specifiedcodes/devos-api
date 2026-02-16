import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { trace, SpanStatusCode } from '@opentelemetry/api';

/**
 * TracingInterceptor
 * Story 14.4: Jaeger Distributed Tracing (AC5)
 *
 * Global NestJS interceptor that enriches the auto-instrumented HTTP span
 * with additional NestJS-specific attributes: route pattern, user ID,
 * workspace ID, and request body size.
 *
 * Sets span status to ERROR on 5xx responses and adds lifecycle events.
 * Skips /metrics and /health endpoints (same pattern as HttpMetricsInterceptor).
 * Handles gracefully when no active span exists (tracing disabled).
 */
@Injectable()
export class TracingInterceptor implements NestInterceptor {
  private static readonly SKIP_PATHS = ['/metrics', '/health'];

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const path = request.path || request.url;

    // Skip /metrics and /health endpoints
    if (
      TracingInterceptor.SKIP_PATHS.some(
        (skip) => path === skip || path.startsWith(skip + '/'),
      )
    ) {
      return next.handle();
    }

    const activeSpan = trace.getActiveSpan();
    if (!activeSpan) {
      return next.handle();
    }

    const method = request.method;
    const startTime = Date.now();

    try {
      // Enrich span with NestJS route information
      const handler = context.getHandler();
      const controller = context.getClass();

      if (handler && controller) {
        // Build route pattern from controller and handler metadata
        const controllerPath =
          Reflect.getMetadata('path', controller) || '';
        const handlerPath =
          Reflect.getMetadata('path', handler) || '';
        const route = `/${controllerPath}${handlerPath ? '/' + handlerPath : ''}`.replace(
          /\/+/g,
          '/',
        );
        activeSpan.setAttribute('http.route', route);
      }

      // Add user.id from JWT auth context
      const user = (request as any).user;
      if (user?.id || user?.sub) {
        activeSpan.setAttribute('user.id', user.id || user.sub);
      }

      // Add workspace.id from workspace context
      const workspaceId =
        (request as any).workspaceId ||
        (request.headers['x-workspace-id'] as string);
      if (workspaceId) {
        activeSpan.setAttribute('workspace.id', workspaceId);
      }

      // Add request body size (with NaN guard for malformed headers)
      const contentLength = request.headers['content-length'];
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (!isNaN(size)) {
          activeSpan.setAttribute('http.request.body.size', size);
        }
      }

      // Add request.received event
      activeSpan.addEvent('request.received', {
        'http.method': method,
        'http.path': path,
      });
    } catch {
      // Silently handle span enrichment errors to avoid crashing request pipeline
    }

    return next.handle().pipe(
      tap(() => {
        try {
          const response = httpContext.getResponse<Response>();
          const statusCode = response.statusCode;
          const duration = Date.now() - startTime;

          // Set span status to ERROR on 5xx responses
          if (statusCode >= 500) {
            activeSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: `HTTP ${statusCode}`,
            });
          }

          // Add request.completed event
          activeSpan.addEvent('request.completed', {
            'http.status_code': statusCode,
            'http.duration_ms': duration,
          });
        } catch {
          // Silently handle errors
        }
      }),
      catchError((error) => {
        try {
          const statusCode = error?.status || error?.statusCode || 500;
          const duration = Date.now() - startTime;

          if (statusCode >= 500) {
            activeSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: error?.message || `HTTP ${statusCode}`,
            });
            activeSpan.recordException(error);
          }

          activeSpan.addEvent('request.completed', {
            'http.status_code': statusCode,
            'http.duration_ms': duration,
          });
        } catch {
          // Silently handle errors
        }
        return throwError(() => error);
      }),
    );
  }
}
