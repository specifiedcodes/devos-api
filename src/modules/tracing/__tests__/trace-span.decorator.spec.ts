// Mock span - declared before jest.mock
const mockSpan = {
  setStatus: jest.fn(),
  recordException: jest.fn(),
  end: jest.fn(),
};

const mockTracer = {
  startActiveSpan: jest.fn().mockImplementation((_name: string, fn: Function) => {
    return fn(mockSpan);
  }),
};

// Mock @opentelemetry/api - factory uses closures over mockSpan/mockTracer
jest.mock('@opentelemetry/api', () => {
  return {
    trace: {
      getTracer: jest.fn().mockImplementation(() => mockTracer),
      getActiveSpan: jest.fn().mockImplementation(() => mockSpan),
    },
    SpanStatusCode: {
      OK: 1,
      ERROR: 2,
      UNSET: 0,
    },
  };
});

import { TraceSpan } from '../decorators/trace-span.decorator';
import { TraceAsync } from '../decorators/trace-async.decorator';
import { SpanStatusCode } from '@opentelemetry/api';

describe('TraceSpan Decorator', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations after clearAllMocks
    mockTracer.startActiveSpan.mockImplementation((_name: string, fn: Function) => {
      return fn(mockSpan);
    });

    const { trace } = require('@opentelemetry/api');
    trace.getTracer.mockImplementation(() => mockTracer);
    trace.getActiveSpan.mockImplementation(() => mockSpan);
  });

  describe('@TraceSpan', () => {
    it('should create child span with provided name', () => {
      class TestService {
        @TraceSpan('custom.operation')
        doWork(): string {
          return 'result';
        }
      }

      const service = new TestService();
      service.doWork();

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'custom.operation',
        expect.any(Function),
      );
    });

    it('should use method name when name not provided', () => {
      class TestService {
        @TraceSpan()
        myMethod(): string {
          return 'result';
        }
      }

      const service = new TestService();
      service.myMethod();

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'TestService.myMethod',
        expect.any(Function),
      );
    });

    it('should record exception when method throws', () => {
      class TestService {
        @TraceSpan('test.throw')
        throwError(): string {
          throw new Error('sync error');
        }
      }

      const service = new TestService();
      expect(() => service.throwError()).toThrow('sync error');

      expect(mockSpan.recordException).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'sync error' }),
      );
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'sync error',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should set span status OK on successful completion', () => {
      class TestService {
        @TraceSpan('test.success')
        succeed(): string {
          return 'success';
        }
      }

      const service = new TestService();
      service.succeed();

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle async methods correctly', async () => {
      class TestService {
        @TraceSpan('test.async')
        async doAsyncWork(): Promise<string> {
          return 'async-result';
        }
      }

      const service = new TestService();
      const result = await service.doAsyncWork();

      expect(result).toBe('async-result');
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should pass through return value from decorated method', () => {
      class TestService {
        @TraceSpan('test.return')
        getValue(): number {
          return 42;
        }
      }

      const service = new TestService();
      const result = service.getValue();
      expect(result).toBe(42);
    });

    it('should be no-op when tracing is disabled (no active span)', () => {
      const { trace } = require('@opentelemetry/api');
      trace.getActiveSpan.mockReturnValueOnce(null);

      class TestService {
        @TraceSpan('test.disabled')
        doWork(): string {
          return 'no-tracing';
        }
      }

      const service = new TestService();
      const result = service.doWork();
      expect(result).toBe('no-tracing');
      expect(mockTracer.startActiveSpan).not.toHaveBeenCalled();
    });

    it('should record exception for async methods that reject', async () => {
      class TestService {
        @TraceSpan('test.async.error')
        async failAsync(): Promise<string> {
          throw new Error('async error');
        }
      }

      const service = new TestService();
      await expect(service.failAsync()).rejects.toThrow('async error');

      expect(mockSpan.recordException).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'async error' }),
      );
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'async error',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });

  describe('@TraceAsync', () => {
    it('should create child span with provided name', async () => {
      class TestService {
        @TraceAsync('async.custom')
        async doWork(): Promise<string> {
          return 'result';
        }
      }

      const service = new TestService();
      await service.doWork();

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'async.custom',
        expect.any(Function),
      );
    });

    it('should use method name when name not provided', async () => {
      class TestService {
        @TraceAsync()
        async myAsyncMethod(): Promise<string> {
          return 'result';
        }
      }

      const service = new TestService();
      await service.myAsyncMethod();

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'TestService.myAsyncMethod',
        expect.any(Function),
      );
    });

    it('should be no-op when tracing is disabled', async () => {
      const { trace } = require('@opentelemetry/api');
      trace.getActiveSpan.mockReturnValueOnce(null);

      class TestService {
        @TraceAsync('async.disabled')
        async doWork(): Promise<string> {
          return 'no-tracing';
        }
      }

      const service = new TestService();
      const result = await service.doWork();
      expect(result).toBe('no-tracing');
      expect(mockTracer.startActiveSpan).not.toHaveBeenCalled();
    });
  });
});
