import { Test, TestingModule } from '@nestjs/testing';
import { SpanStatusCode } from '@opentelemetry/api';

// Declare mock objects that jest.mock can reference
const mockSpan = {
  spanContext: jest.fn().mockReturnValue({
    traceId: 'abc123def456abc123def456abc123de',
    spanId: 'abc123def456ab12',
  }),
  setAttributes: jest.fn(),
  setAttribute: jest.fn(),
  setStatus: jest.fn(),
  recordException: jest.fn(),
  addEvent: jest.fn(),
  end: jest.fn(),
};

const mockTracer = {
  startSpan: jest.fn().mockReturnValue(mockSpan),
  startActiveSpan: jest.fn().mockImplementation((_name: string, fn: Function) => {
    return fn(mockSpan);
  }),
};

// Mock @opentelemetry/api BEFORE importing TracingService
// Use factory function that references variables defined above (they're hoisted as let/const but
// jest.mock factory is evaluated lazily when the module is first required)
jest.mock('@opentelemetry/api', () => {
  return {
    trace: {
      getTracer: jest.fn().mockImplementation(() => mockTracer),
      getActiveSpan: jest.fn().mockImplementation(() => mockSpan),
    },
    context: {
      active: jest.fn().mockReturnValue({}),
    },
    SpanStatusCode: {
      OK: 1,
      ERROR: 2,
      UNSET: 0,
    },
  };
});

// Import after mock setup
import { TracingService } from '../tracing.service';

describe('TracingService', () => {
  let service: TracingService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset mock implementations after clearAllMocks
    mockSpan.spanContext.mockReturnValue({
      traceId: 'abc123def456abc123def456abc123de',
      spanId: 'abc123def456ab12',
    });
    mockTracer.startSpan.mockReturnValue(mockSpan);
    mockTracer.startActiveSpan.mockImplementation((_name: string, fn: Function) => {
      return fn(mockSpan);
    });

    const { trace } = require('@opentelemetry/api');
    trace.getTracer.mockImplementation(() => mockTracer);
    trace.getActiveSpan.mockImplementation(() => mockSpan);

    const module: TestingModule = await Test.createTestingModule({
      providers: [TracingService],
    }).compile();

    service = module.get<TracingService>(TracingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should initialize with default tracer name "devos-api"', () => {
      const { trace } = require('@opentelemetry/api');
      expect(trace.getTracer).toHaveBeenCalledWith('devos-api');
    });
  });

  describe('startSpan', () => {
    it('should create a new span with correct name', () => {
      const span = service.startSpan('test-span');
      expect(mockTracer.startSpan).toHaveBeenCalledWith('test-span', undefined);
      expect(span).toBe(mockSpan);
    });

    it('should pass options to startSpan', () => {
      const options = { attributes: { 'test.key': 'value' } };
      service.startSpan('test-span', options);
      expect(mockTracer.startSpan).toHaveBeenCalledWith('test-span', options);
    });
  });

  describe('startActiveSpan', () => {
    it('should execute callback and return result', async () => {
      const result = await service.startActiveSpan('test-span', async () => {
        return 'test-result';
      });
      expect(result).toBe('test-result');
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should record exception on error and re-throw', async () => {
      const error = new Error('test error');
      await expect(
        service.startActiveSpan('test-span', async () => {
          throw error;
        }),
      ).rejects.toThrow('test error');

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'test error',
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });

  describe('recordException', () => {
    it('should set span status to ERROR and record exception event', () => {
      const error = new Error('test exception');
      service.recordException(mockSpan as any, error);
      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'test exception',
      });
    });
  });

  describe('setSpanAttributes', () => {
    it('should set multiple attributes on span', () => {
      const attributes = {
        'test.string': 'value',
        'test.number': 42,
        'test.boolean': true,
      };
      service.setSpanAttributes(mockSpan as any, attributes);
      expect(mockSpan.setAttributes).toHaveBeenCalledWith(attributes);
    });
  });

  describe('getCurrentTraceId', () => {
    it('should return trace ID from active span', () => {
      const traceId = service.getCurrentTraceId();
      expect(traceId).toBe('abc123def456abc123def456abc123de');
    });

    it('should return undefined when no active span', () => {
      const { trace } = require('@opentelemetry/api');
      trace.getActiveSpan.mockReturnValueOnce(null);
      const traceId = service.getCurrentTraceId();
      expect(traceId).toBeUndefined();
    });

    it('should return undefined when trace ID is all zeros', () => {
      const { trace } = require('@opentelemetry/api');
      trace.getActiveSpan.mockReturnValueOnce({
        spanContext: () => ({
          traceId: '00000000000000000000000000000000',
          spanId: '0000000000000000',
        }),
      });
      const traceId = service.getCurrentTraceId();
      expect(traceId).toBeUndefined();
    });
  });

  describe('getCurrentSpanId', () => {
    it('should return span ID from active span', () => {
      const spanId = service.getCurrentSpanId();
      expect(spanId).toBe('abc123def456ab12');
    });

    it('should return undefined when no active span', () => {
      const { trace } = require('@opentelemetry/api');
      trace.getActiveSpan.mockReturnValueOnce(null);
      const spanId = service.getCurrentSpanId();
      expect(spanId).toBeUndefined();
    });

    it('should return undefined when span ID is all zeros', () => {
      const { trace } = require('@opentelemetry/api');
      trace.getActiveSpan.mockReturnValueOnce({
        spanContext: () => ({
          traceId: 'abc123def456abc123def456abc123de',
          spanId: '0000000000000000',
        }),
      });
      const spanId = service.getCurrentSpanId();
      expect(spanId).toBeUndefined();
    });
  });

  describe('setDbAttributes', () => {
    it('should set db.system, db.operation, db.sql.table attributes', () => {
      service.setDbAttributes(mockSpan as any, 'SELECT', 'users');
      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'db.system': 'postgresql',
        'db.operation': 'SELECT',
        'db.sql.table': 'users',
      });
    });
  });

  describe('setHttpAttributes', () => {
    it('should set http.method, http.url, http.status_code attributes (stable + legacy)', () => {
      service.setHttpAttributes(
        mockSpan as any,
        'GET',
        '/api/projects',
        200,
      );
      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'http.request.method': 'GET',
        'url.full': '/api/projects',
        'http.response.status_code': 200,
        'http.method': 'GET',
        'http.url': '/api/projects',
        'http.status_code': 200,
      });
    });
  });

  describe('setAiAttributes', () => {
    it('should set ai.provider, ai.model, ai.tokens custom attributes', () => {
      service.setAiAttributes(
        mockSpan as any,
        'anthropic',
        'claude-3-opus',
        1500,
      );
      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'ai.provider': 'anthropic',
        'ai.model': 'claude-3-opus',
        'ai.tokens': 1500,
      });
    });
  });
});
