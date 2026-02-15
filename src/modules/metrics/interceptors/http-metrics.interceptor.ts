import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Counter, Histogram, Gauge } from 'prom-client';
import { Request, Response } from 'express';
import { MetricsService } from '../metrics.service';
import { normalizeRoute } from '../utils/route-normalizer';

/**
 * HttpMetricsInterceptor
 * Story 14.1: Prometheus Metrics Exporter (AC2)
 *
 * Global NestJS interceptor that instruments all HTTP requests with:
 * - Request duration histogram
 * - Request count counter
 * - Active connections gauge
 *
 * Skips /metrics and /health endpoints to avoid recursion.
 * Normalizes routes to prevent high-cardinality labels.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  private readonly httpRequestDuration: Histogram;
  private readonly httpRequestsTotal: Counter;
  private readonly httpActiveConnections: Gauge;

  private static readonly SKIP_PATHS = ['/metrics', '/health'];

  constructor(private readonly metricsService: MetricsService) {
    const registry = this.metricsService.getRegistry();

    this.httpRequestDuration = new Histogram({
      name: 'devos_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    });

    this.httpRequestsTotal = new Counter({
      name: 'devos_http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [registry],
    });

    this.httpActiveConnections = new Gauge({
      name: 'devos_http_active_connections',
      help: 'Number of active HTTP connections',
      registers: [registry],
    });
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const path = request.path || request.url;

    // Skip /metrics and /health endpoints (use startsWith for robustness)
    if (HttpMetricsInterceptor.SKIP_PATHS.some((skip) => path === skip || path.startsWith(skip + '/'))) {
      return next.handle();
    }

    const startTime = process.hrtime.bigint();
    const method = request.method;

    this.httpActiveConnections.inc();

    return next.handle().pipe(
      tap(() => {
        const response = httpContext.getResponse<Response>();
        this.recordMetrics(method, path, response.statusCode, startTime);
      }),
      catchError((error) => {
        const statusCode = error?.status || error?.statusCode || 500;
        this.recordMetrics(method, path, statusCode, startTime);
        return throwError(() => error);
      }),
    );
  }

  private recordMetrics(
    method: string,
    path: string,
    statusCode: number,
    startTime: bigint,
  ): void {
    try {
      const route = normalizeRoute(path);
      const duration =
        Number(process.hrtime.bigint() - startTime) / 1_000_000_000;

      const labels = {
        method,
        route,
        status_code: String(statusCode),
      };

      this.httpRequestDuration.observe(labels, duration);
      this.httpRequestsTotal.inc(labels);
      this.httpActiveConnections.dec();
    } catch {
      // Silently handle metric recording errors to avoid crashing request pipeline
      this.httpActiveConnections.dec();
    }
  }
}
