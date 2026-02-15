import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { Registry } from 'prom-client';
import { HttpMetricsInterceptor } from '../interceptors/http-metrics.interceptor';
import { MetricsService } from '../metrics.service';

describe('HttpMetricsInterceptor', () => {
  let interceptor: HttpMetricsInterceptor;
  let metricsService: MetricsService;
  let registry: Registry;

  beforeEach(() => {
    registry = new Registry();
    metricsService = {
      getRegistry: () => registry,
      getMetrics: jest.fn(),
      getContentType: jest.fn(),
    } as any;

    interceptor = new HttpMetricsInterceptor(metricsService);
  });

  afterEach(async () => {
    await registry.clear();
  });

  const createMockContext = (
    method: string,
    path: string,
    statusCode = 200,
  ): {
    context: ExecutionContext;
    response: { statusCode: number };
  } => {
    const response = { statusCode };
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          path,
          url: path,
        }),
        getResponse: () => response,
      }),
    } as ExecutionContext;
    return { context, response };
  };

  const createMockCallHandler = (
    returnValue: unknown = { data: 'test' },
  ): CallHandler => ({
    handle: () => of(returnValue),
  });

  const createErrorCallHandler = (error: Error): CallHandler => ({
    handle: () => throwError(() => error),
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    it('should increment http_requests_total counter on request completion', (done) => {
      const { context } = createMockContext('GET', '/api/projects', 200);
      const callHandler = createMockCallHandler();

      interceptor.intercept(context, callHandler).subscribe({
        complete: async () => {
          const metrics = await registry.getMetricsAsJSON();
          const counter = metrics.find(
            (m) => m.name === 'devos_http_requests_total',
          );
          expect(counter).toBeDefined();
          done();
        },
      });
    });

    it('should record request duration in http_request_duration_seconds histogram', (done) => {
      const { context } = createMockContext('GET', '/api/projects', 200);
      const callHandler = createMockCallHandler();

      interceptor.intercept(context, callHandler).subscribe({
        complete: async () => {
          const metrics = await registry.getMetricsAsJSON();
          const histogram = metrics.find(
            (m) => m.name === 'devos_http_request_duration_seconds',
          );
          expect(histogram).toBeDefined();
          done();
        },
      });
    });

    it('should increment active_connections gauge on request start and decrement on end', (done) => {
      const { context } = createMockContext('GET', '/api/projects', 200);
      const callHandler = createMockCallHandler();

      interceptor.intercept(context, callHandler).subscribe({
        complete: async () => {
          const metrics = await registry.getMetricsAsJSON();
          const gauge = metrics.find(
            (m) => m.name === 'devos_http_active_connections',
          );
          expect(gauge).toBeDefined();
          // After completion, active should be back to 0
          const value = (gauge as any)?.values?.[0]?.value;
          expect(value).toBe(0);
          done();
        },
      });
    });

    it('should skip /metrics endpoint from instrumentation', (done) => {
      const { context } = createMockContext('GET', '/metrics', 200);
      const callHandler = createMockCallHandler();

      interceptor.intercept(context, callHandler).subscribe({
        complete: async () => {
          const metrics = await registry.getMetricsAsJSON();
          const counter = metrics.find(
            (m) => m.name === 'devos_http_requests_total',
          );
          // Counter should not have any values because /metrics was skipped
          expect(
            counter === undefined ||
              (counter as any)?.values?.length === 0,
          ).toBe(true);
          done();
        },
      });
    });

    it('should skip /health endpoint from instrumentation', (done) => {
      const { context } = createMockContext('GET', '/health', 200);
      const callHandler = createMockCallHandler();

      interceptor.intercept(context, callHandler).subscribe({
        complete: async () => {
          const metrics = await registry.getMetricsAsJSON();
          const counter = metrics.find(
            (m) => m.name === 'devos_http_requests_total',
          );
          expect(
            counter === undefined ||
              (counter as any)?.values?.length === 0,
          ).toBe(true);
          done();
        },
      });
    });

    it('should include correct method, route, and status_code labels', (done) => {
      const { context } = createMockContext('POST', '/api/workspaces', 201);
      const callHandler = createMockCallHandler();

      // Override the response status code
      const httpContext = context.switchToHttp();
      (httpContext.getResponse() as any).statusCode = 201;

      interceptor.intercept(context, callHandler).subscribe({
        complete: async () => {
          const metricsText = await registry.metrics();
          expect(metricsText).toContain('method="POST"');
          expect(metricsText).toContain('route="/api/workspaces"');
          expect(metricsText).toContain('status_code="201"');
          done();
        },
      });
    });

    it('should handle errors gracefully without crashing request pipeline', (done) => {
      const { context } = createMockContext('GET', '/api/projects', 500);
      const error = Object.assign(new Error('Internal error'), {
        status: 500,
      });
      const callHandler = createErrorCallHandler(error);

      interceptor.intercept(context, callHandler).subscribe({
        error: (err) => {
          // The original error should be rethrown
          expect(err.message).toBe('Internal error');
          done();
        },
      });
    });

    it('should normalize UUID patterns in routes to :id', (done) => {
      const { context } = createMockContext(
        'GET',
        '/api/projects/550e8400-e29b-41d4-a716-446655440000',
        200,
      );
      const callHandler = createMockCallHandler();

      interceptor.intercept(context, callHandler).subscribe({
        complete: async () => {
          const metricsText = await registry.metrics();
          expect(metricsText).toContain('route="/api/projects/:id"');
          expect(metricsText).not.toContain('550e8400');
          done();
        },
      });
    });

    it('should normalize numeric IDs in routes to :id', (done) => {
      const { context } = createMockContext('GET', '/api/items/12345', 200);
      const callHandler = createMockCallHandler();

      interceptor.intercept(context, callHandler).subscribe({
        complete: async () => {
          const metricsText = await registry.metrics();
          expect(metricsText).toContain('route="/api/items/:id"');
          expect(metricsText).not.toContain('12345');
          done();
        },
      });
    });
  });
});
