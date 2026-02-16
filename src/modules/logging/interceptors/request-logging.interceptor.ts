import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { LoggingService } from '../logging.service';
import { getTraceId, getUserId, getWorkspaceId } from '../logging.context';

/**
 * RequestLoggingInterceptor
 * Story 14.3: Loki Log Aggregation (AC5)
 *
 * Global NestJS interceptor that logs incoming requests and outgoing responses
 * with structured metadata including method, path, status code, duration,
 * trace ID, user ID, and workspace ID.
 *
 * Skips /metrics and /health endpoints to match HttpMetricsInterceptor behavior.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private static readonly SKIP_PATHS = ['/metrics', '/health'];

  constructor(private readonly loggingService: LoggingService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const path = request.path || request.url;

    // Skip /metrics and /health endpoints
    if (
      RequestLoggingInterceptor.SKIP_PATHS.some(
        (skip) => path === skip || path.startsWith(skip + '/'),
      )
    ) {
      return next.handle();
    }

    const method = request.method;
    const startTime = Date.now();
    const traceId = getTraceId();
    const workspaceId = getWorkspaceId();
    // Read userId from request.user (populated by JWT auth guard which runs before interceptors)
    const user = (request as any).user;
    const userId = user?.id || user?.sub || getUserId();

    // Log incoming request
    this.loggingService.log(
      `Incoming request ${method} ${path}`,
      'RequestLoggingInterceptor',
    );

    return next.handle().pipe(
      tap(() => {
        const response = httpContext.getResponse<Response>();
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode;

        this.loggingService.log(
          {
            message: `Request completed ${method} ${path}`,
            method,
            path,
            statusCode,
            duration,
            traceId,
            userId,
            workspaceId,
          },
          'RequestLoggingInterceptor',
        );
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        const statusCode = error?.status || error?.statusCode || 500;

        this.loggingService.error(
          {
            message: `Request failed ${method} ${path}`,
            method,
            path,
            statusCode,
            duration,
            traceId,
            userId,
            workspaceId,
            error: error?.message,
          },
          error?.stack,
          'RequestLoggingInterceptor',
        );

        return throwError(() => error);
      }),
    );
  }
}
