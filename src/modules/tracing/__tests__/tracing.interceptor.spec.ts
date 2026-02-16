import { TracingInterceptor } from '../interceptors/tracing.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { SpanStatusCode } from '@opentelemetry/api';

// Mock span
const mockSpan = {
  setAttribute: jest.fn(),
  setAttributes: jest.fn(),
  setStatus: jest.fn(),
  addEvent: jest.fn(),
  recordException: jest.fn(),
  end: jest.fn(),
};

// Mock @opentelemetry/api
jest.mock('@opentelemetry/api', () => ({
  trace: {
    getActiveSpan: jest.fn(),
  },
  SpanStatusCode: {
    OK: 1,
    ERROR: 2,
    UNSET: 0,
  },
}));

describe('TracingInterceptor', () => {
  let interceptor: TracingInterceptor;
  let mockExecutionContext: Partial<ExecutionContext>;
  let mockCallHandler: CallHandler;
  let mockRequest: any;
  let mockResponse: any;

  beforeEach(() => {
    jest.clearAllMocks();
    interceptor = new TracingInterceptor();

    mockRequest = {
      method: 'GET',
      path: '/api/projects',
      url: '/api/projects',
      headers: {},
    };

    mockResponse = {
      statusCode: 200,
    };

    const mockHandler = { name: 'findAll' };
    const mockController = function ProjectsController() {};
    Reflect.defineMetadata('path', 'api/projects', mockController);
    Reflect.defineMetadata('path', '', mockHandler);

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
      getHandler: jest.fn().mockReturnValue(mockHandler),
      getClass: jest.fn().mockReturnValue(mockController),
    };

    mockCallHandler = {
      handle: jest.fn().mockReturnValue(of('response')),
    };
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('span enrichment', () => {
    beforeEach(() => {
      const { trace } = require('@opentelemetry/api');
      trace.getActiveSpan.mockReturnValue(mockSpan);
    });

    it('should enrich active span with http.route attribute from NestJS handler metadata', (done) => {
      interceptor.intercept(mockExecutionContext as ExecutionContext, mockCallHandler)
        .subscribe({
          complete: () => {
            expect(mockSpan.setAttribute).toHaveBeenCalledWith('http.route', '/api/projects');
            done();
          },
        });
    });

    it('should add user.id attribute when JWT user is available', (done) => {
      mockRequest.user = { id: 'user-123', sub: 'user-123' };

      interceptor.intercept(mockExecutionContext as ExecutionContext, mockCallHandler)
        .subscribe({
          complete: () => {
            expect(mockSpan.setAttribute).toHaveBeenCalledWith('user.id', 'user-123');
            done();
          },
        });
    });

    it('should add workspace.id attribute when workspace context is available', (done) => {
      mockRequest.headers['x-workspace-id'] = 'ws-456';

      interceptor.intercept(mockExecutionContext as ExecutionContext, mockCallHandler)
        .subscribe({
          complete: () => {
            expect(mockSpan.setAttribute).toHaveBeenCalledWith('workspace.id', 'ws-456');
            done();
          },
        });
    });

    it('should set span status to ERROR on 5xx responses', (done) => {
      mockResponse.statusCode = 500;

      interceptor.intercept(mockExecutionContext as ExecutionContext, mockCallHandler)
        .subscribe({
          complete: () => {
            expect(mockSpan.setStatus).toHaveBeenCalledWith({
              code: SpanStatusCode.ERROR,
              message: 'HTTP 500',
            });
            done();
          },
        });
    });

    it('should add request.received and request.completed events', (done) => {
      interceptor.intercept(mockExecutionContext as ExecutionContext, mockCallHandler)
        .subscribe({
          complete: () => {
            expect(mockSpan.addEvent).toHaveBeenCalledWith('request.received', {
              'http.method': 'GET',
              'http.path': '/api/projects',
            });
            expect(mockSpan.addEvent).toHaveBeenCalledWith('request.completed', expect.objectContaining({
              'http.status_code': 200,
            }));
            done();
          },
        });
    });
  });

  describe('skip patterns', () => {
    it('should skip /metrics endpoint', (done) => {
      mockRequest.path = '/metrics';

      interceptor.intercept(mockExecutionContext as ExecutionContext, mockCallHandler)
        .subscribe({
          complete: () => {
            const { trace } = require('@opentelemetry/api');
            expect(trace.getActiveSpan).not.toHaveBeenCalled();
            done();
          },
        });
    });

    it('should skip /health endpoint', (done) => {
      mockRequest.path = '/health';

      interceptor.intercept(mockExecutionContext as ExecutionContext, mockCallHandler)
        .subscribe({
          complete: () => {
            const { trace } = require('@opentelemetry/api');
            expect(trace.getActiveSpan).not.toHaveBeenCalled();
            done();
          },
        });
    });
  });

  describe('graceful handling', () => {
    it('should handle missing span context gracefully (no-op when tracing disabled)', (done) => {
      const { trace } = require('@opentelemetry/api');
      trace.getActiveSpan.mockReturnValue(null);

      interceptor.intercept(mockExecutionContext as ExecutionContext, mockCallHandler)
        .subscribe({
          complete: () => {
            expect(mockSpan.setAttribute).not.toHaveBeenCalled();
            done();
          },
        });
    });

    it('should not throw when span operations fail', (done) => {
      const { trace } = require('@opentelemetry/api');
      const errorSpan = {
        setAttribute: jest.fn().mockImplementation(() => { throw new Error('span error'); }),
        setAttributes: jest.fn().mockImplementation(() => { throw new Error('span error'); }),
        setStatus: jest.fn(),
        addEvent: jest.fn(),
        recordException: jest.fn(),
        end: jest.fn(),
      };
      trace.getActiveSpan.mockReturnValue(errorSpan);

      interceptor.intercept(mockExecutionContext as ExecutionContext, mockCallHandler)
        .subscribe({
          next: (value) => {
            expect(value).toBe('response');
          },
          complete: () => {
            done();
          },
        });
    });
  });

  describe('error handling', () => {
    it('should set span status to ERROR and record exception on 5xx errors', (done) => {
      const { trace } = require('@opentelemetry/api');
      trace.getActiveSpan.mockReturnValue(mockSpan);

      const error = new Error('Internal server error');
      (error as any).status = 500;
      mockCallHandler.handle = jest.fn().mockReturnValue(throwError(() => error));

      interceptor.intercept(mockExecutionContext as ExecutionContext, mockCallHandler)
        .subscribe({
          error: () => {
            expect(mockSpan.setStatus).toHaveBeenCalledWith({
              code: SpanStatusCode.ERROR,
              message: 'Internal server error',
            });
            expect(mockSpan.recordException).toHaveBeenCalledWith(error);
            done();
          },
        });
    });
  });
});
