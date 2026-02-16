import { CorrelationIdMiddleware } from '../middleware/correlation-id.middleware';
import { Request, Response, NextFunction } from 'express';
import { loggingContext } from '../logging.context';

// Mock span
const mockSpanContext = {
  traceId: 'otel-trace-id-abc123def456abc1',
  spanId: 'otel-span-id-1234',
};

const mockSpan = {
  spanContext: jest.fn().mockReturnValue(mockSpanContext),
};

// Mock @opentelemetry/api
jest.mock('@opentelemetry/api', () => ({
  trace: {
    getActiveSpan: jest.fn(),
  },
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('uuid-v4-fallback-id'),
}));

describe('CorrelationIdMiddleware - Tracing Integration', () => {
  let middleware: CorrelationIdMiddleware;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    middleware = new CorrelationIdMiddleware();

    mockReq = {
      headers: {},
    };

    mockRes = {
      setHeader: jest.fn(),
    };

    mockNext = jest.fn();
  });

  it('should use OTel trace ID when active span exists', () => {
    const { trace } = require('@opentelemetry/api');
    trace.getActiveSpan.mockReturnValue(mockSpan);

    middleware.use(mockReq as Request, mockRes as Response, mockNext);

    // Verify loggingContext was set with OTel trace ID
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'x-trace-id',
      'otel-trace-id-abc123def456abc1',
    );
  });

  it('should fall back to UUID v4 when no active span', () => {
    const { trace } = require('@opentelemetry/api');
    trace.getActiveSpan.mockReturnValue(null);

    middleware.use(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'x-trace-id',
      'uuid-v4-fallback-id',
    );
  });

  it('should still respect x-trace-id header over OTel trace ID', () => {
    const { trace } = require('@opentelemetry/api');
    trace.getActiveSpan.mockReturnValue(mockSpan);
    mockReq.headers = { 'x-trace-id': 'header-trace-id-999' };

    middleware.use(mockReq as Request, mockRes as Response, mockNext);

    // Header should take precedence over OTel trace ID
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'x-trace-id',
      'header-trace-id-999',
    );
  });

  it('should add spanId to RequestContext when OTel is active', (done) => {
    const { trace } = require('@opentelemetry/api');
    trace.getActiveSpan.mockReturnValue(mockSpan);

    mockNext = jest.fn().mockImplementation(() => {
      // Inside the request context, verify spanId is set
      const store = loggingContext.getStore();
      expect(store?.spanId).toBe('otel-span-id-1234');
      done();
    });

    middleware.use(mockReq as Request, mockRes as Response, mockNext);
  });

  it('should have undefined spanId when no active span', (done) => {
    const { trace } = require('@opentelemetry/api');
    trace.getActiveSpan.mockReturnValue(null);

    mockNext = jest.fn().mockImplementation(() => {
      const store = loggingContext.getStore();
      expect(store?.spanId).toBeUndefined();
      done();
    });

    middleware.use(mockReq as Request, mockRes as Response, mockNext);
  });

  it('should have matching traceId for Jaeger correlation in log output', (done) => {
    const { trace } = require('@opentelemetry/api');
    trace.getActiveSpan.mockReturnValue(mockSpan);

    mockNext = jest.fn().mockImplementation(() => {
      const store = loggingContext.getStore();
      expect(store?.traceId).toBe('otel-trace-id-abc123def456abc1');
      // This traceId will match Jaeger's trace ID, enabling log-to-trace correlation
      done();
    });

    middleware.use(mockReq as Request, mockRes as Response, mockNext);
  });

  it('should handle OTel trace.getActiveSpan throwing an error', () => {
    const { trace } = require('@opentelemetry/api');
    trace.getActiveSpan.mockImplementation(() => {
      throw new Error('OTel not initialized');
    });

    // Should fall back to UUID without crashing
    middleware.use(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'x-trace-id',
      'uuid-v4-fallback-id',
    );
    expect(mockNext).toHaveBeenCalled();
  });

  it('should handle all-zeros trace ID as invalid', () => {
    const { trace } = require('@opentelemetry/api');
    trace.getActiveSpan.mockReturnValue({
      spanContext: () => ({
        traceId: '00000000000000000000000000000000',
        spanId: '0000000000000000',
      }),
    });

    middleware.use(mockReq as Request, mockRes as Response, mockNext);

    // Should fall back to UUID since all-zeros is invalid
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'x-trace-id',
      'uuid-v4-fallback-id',
    );
  });
});
