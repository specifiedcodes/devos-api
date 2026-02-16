import { Test, TestingModule } from '@nestjs/testing';
import { TracingModule } from '../tracing.module';
import { TracingService } from '../tracing.service';
import { TracingInterceptor } from '../interceptors/tracing.interceptor';

// Mock @opentelemetry/api
jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: jest.fn().mockReturnValue({
      startSpan: jest.fn(),
      startActiveSpan: jest.fn(),
    }),
    getActiveSpan: jest.fn(),
  },
  context: {
    active: jest.fn().mockReturnValue({}),
  },
  SpanStatusCode: {
    OK: 1,
    ERROR: 2,
    UNSET: 0,
  },
}));

describe('TracingModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [TracingModule],
    }).compile();
  });

  it('should be defined and can be instantiated', () => {
    expect(module).toBeDefined();
  });

  it('should export TracingService', () => {
    const tracingService = module.get<TracingService>(TracingService);
    expect(tracingService).toBeDefined();
    expect(tracingService).toBeInstanceOf(TracingService);
  });

  it('should provide TracingInterceptor', () => {
    const tracingInterceptor = module.get<TracingInterceptor>(TracingInterceptor);
    expect(tracingInterceptor).toBeDefined();
    expect(tracingInterceptor).toBeInstanceOf(TracingInterceptor);
  });
});
