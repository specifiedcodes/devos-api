import { RequestLoggingInterceptor } from '../interceptors/request-logging.interceptor';
import { LoggingService } from '../logging.service';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { loggingContext } from '../logging.context';

describe('RequestLoggingInterceptor', () => {
  let interceptor: RequestLoggingInterceptor;
  let loggingService: LoggingService;

  beforeEach(() => {
    loggingService = new LoggingService();
    // Suppress actual log output during tests
    jest.spyOn(loggingService.getWinstonLogger(), 'info').mockImplementation();
    jest.spyOn(loggingService.getWinstonLogger(), 'error').mockImplementation();
    jest.spyOn(loggingService.getWinstonLogger(), 'log').mockImplementation();
    interceptor = new RequestLoggingInterceptor(loggingService);
  });

  function createMockContext(
    path: string,
    method = 'GET',
    user?: any,
  ): ExecutionContext {
    const request = {
      path,
      url: path,
      method,
      user,
    };
    const response = {
      statusCode: 200,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as any;
  }

  function createMockCallHandler(result?: any, error?: any): CallHandler {
    if (error) {
      return {
        handle: () => throwError(() => error),
      };
    }
    return {
      handle: () => of(result || {}),
    };
  }

  it('should log incoming request with method, path, and user context', (done) => {
    const logSpy = jest.spyOn(loggingService, 'log');
    const context = createMockContext('/api/users', 'GET');
    const handler = createMockCallHandler();

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(logSpy).toHaveBeenCalledWith(
          'Incoming request GET /api/users',
          'RequestLoggingInterceptor',
        );
        done();
      },
    });
  });

  it('should log completed request with status code and duration', (done) => {
    const logSpy = jest.spyOn(loggingService, 'log');
    const context = createMockContext('/api/users', 'POST');
    const handler = createMockCallHandler();

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        // Second call is the completion log with structured data as an object
        const completionCall = logSpy.mock.calls.find(
          (call) =>
            typeof call[0] === 'object' &&
            call[0] !== null &&
            call[0].message?.includes('Request completed'),
        );
        expect(completionCall).toBeDefined();
        const logData = completionCall![0] as any;
        expect(logData.method).toBe('POST');
        expect(logData.path).toBe('/api/users');
        expect(logData.statusCode).toBe(200);
        expect(typeof logData.duration).toBe('number');
        done();
      },
    });
  });

  it('should log failed request with error details at error level', (done) => {
    const errorSpy = jest.spyOn(loggingService, 'error');
    const context = createMockContext('/api/users', 'DELETE');
    const error = { status: 403, message: 'Forbidden', stack: 'Error: Forbidden\n  at ...' };
    const handler = createMockCallHandler(undefined, error);

    interceptor.intercept(context, handler).subscribe({
      error: () => {
        expect(errorSpy).toHaveBeenCalled();
        const errorCall = errorSpy.mock.calls[0];
        const logData = errorCall[0] as any;
        expect(logData.statusCode).toBe(403);
        expect(logData.error).toBe('Forbidden');
        done();
      },
    });
  });

  it('should skip /metrics endpoint', (done) => {
    const logSpy = jest.spyOn(loggingService, 'log');
    const context = createMockContext('/metrics', 'GET');
    const handler = createMockCallHandler();

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(logSpy).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should skip /health endpoint', (done) => {
    const logSpy = jest.spyOn(loggingService, 'log');
    const context = createMockContext('/health', 'GET');
    const handler = createMockCallHandler();

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        expect(logSpy).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should include traceId from AsyncLocalStorage', (done) => {
    const logSpy = jest.spyOn(loggingService, 'log');
    const context = createMockContext('/api/test', 'GET');
    const handler = createMockCallHandler();

    loggingContext.run({ traceId: 'interceptor-trace-123' }, () => {
      interceptor.intercept(context, handler).subscribe({
        complete: () => {
          const completionCall = logSpy.mock.calls.find(
            (call) =>
              typeof call[0] === 'object' &&
              call[0] !== null &&
              call[0].message?.includes('Request completed'),
          );
          expect(completionCall).toBeDefined();
          const logData = completionCall![0] as any;
          expect(logData.traceId).toBe('interceptor-trace-123');
          done();
        },
      });
    });
  });

  it('should include userId when JWT user is available', (done) => {
    const logSpy = jest.spyOn(loggingService, 'log');
    // Pass user object in mock context to simulate post-auth-guard state
    const context = createMockContext('/api/test', 'GET', { id: 'user-uuid-123' });
    const handler = createMockCallHandler();

    loggingContext.run({ traceId: 'trace' }, () => {
      interceptor.intercept(context, handler).subscribe({
        complete: () => {
          const completionCall = logSpy.mock.calls.find(
            (call) =>
              typeof call[0] === 'object' &&
              call[0] !== null &&
              call[0].message?.includes('Request completed'),
          );
          const logData = completionCall![0] as any;
          expect(logData.userId).toBe('user-uuid-123');
          done();
        },
      });
    });
  });

  it('should include workspaceId from request context', (done) => {
    const logSpy = jest.spyOn(loggingService, 'log');
    const context = createMockContext('/api/test', 'GET');
    const handler = createMockCallHandler();

    loggingContext.run(
      { traceId: 'trace', workspaceId: 'ws-uuid-456' },
      () => {
        interceptor.intercept(context, handler).subscribe({
          complete: () => {
            const completionCall = logSpy.mock.calls.find(
              (call) =>
                typeof call[0] === 'object' &&
                call[0] !== null &&
                call[0].message?.includes('Request completed'),
            );
            const logData = completionCall![0] as any;
            expect(logData.workspaceId).toBe('ws-uuid-456');
            done();
          },
        });
      },
    );
  });

  it('should calculate request duration correctly', (done) => {
    const logSpy = jest.spyOn(loggingService, 'log');
    const context = createMockContext('/api/test', 'GET');
    const handler = createMockCallHandler();

    interceptor.intercept(context, handler).subscribe({
      complete: () => {
        const completionCall = logSpy.mock.calls.find(
          (call) =>
            typeof call[0] === 'object' &&
            call[0] !== null &&
            call[0].message?.includes('Request completed'),
        );
        const logData = completionCall![0] as any;
        expect(logData.duration).toBeGreaterThanOrEqual(0);
        expect(typeof logData.duration).toBe('number');
        done();
      },
    });
  });
});
