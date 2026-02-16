// Mock the OpenTelemetry modules BEFORE importing the instrumentation
const mockSdkStart = jest.fn();
const mockSdkShutdown = jest.fn().mockResolvedValue(undefined);

const MockNodeSDK = jest.fn().mockImplementation(() => ({
  start: mockSdkStart,
  shutdown: mockSdkShutdown,
}));

jest.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: MockNodeSDK,
}));

const MockOTLPTraceExporter = jest.fn().mockImplementation(() => ({}));
jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: MockOTLPTraceExporter,
}));

const MockBatchSpanProcessor = jest.fn().mockImplementation(() => ({}));
jest.mock('@opentelemetry/sdk-trace-base', () => ({
  BatchSpanProcessor: MockBatchSpanProcessor,
}));

const mockResourceFromAttributes = jest.fn().mockImplementation(() => ({}));
jest.mock('@opentelemetry/resources', () => ({
  resourceFromAttributes: mockResourceFromAttributes,
}));

jest.mock('@opentelemetry/semantic-conventions', () => ({
  ATTR_SERVICE_NAME: 'service.name',
  ATTR_SERVICE_VERSION: 'service.version',
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT: 'deployment.environment',
}));

const mockGetNodeAutoInstrumentations = jest.fn().mockReturnValue([]);
jest.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: mockGetNodeAutoInstrumentations,
}));

jest.mock('@opentelemetry/api', () => ({
  diag: {
    setLogger: jest.fn(),
  },
  DiagConsoleLogger: jest.fn(),
  DiagLogLevel: {
    DEBUG: 0,
  },
}));

describe('Tracing Instrumentation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    // Reset module cache so setupTracing can be re-imported fresh
    jest.resetModules();

    // Re-apply mocks after resetModules
    jest.doMock('@opentelemetry/sdk-node', () => ({ NodeSDK: MockNodeSDK }));
    jest.doMock('@opentelemetry/exporter-trace-otlp-http', () => ({ OTLPTraceExporter: MockOTLPTraceExporter }));
    jest.doMock('@opentelemetry/sdk-trace-base', () => ({ BatchSpanProcessor: MockBatchSpanProcessor }));
    jest.doMock('@opentelemetry/resources', () => ({ resourceFromAttributes: mockResourceFromAttributes }));
    jest.doMock('@opentelemetry/semantic-conventions', () => ({
      ATTR_SERVICE_NAME: 'service.name',
      ATTR_SERVICE_VERSION: 'service.version',
      SEMRESATTRS_DEPLOYMENT_ENVIRONMENT: 'deployment.environment',
    }));
    jest.doMock('@opentelemetry/auto-instrumentations-node', () => ({
      getNodeAutoInstrumentations: mockGetNodeAutoInstrumentations,
    }));
    jest.doMock('@opentelemetry/api', () => ({
      diag: { setLogger: jest.fn() },
      DiagConsoleLogger: jest.fn(),
      DiagLogLevel: { DEBUG: 0 },
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should export setupTracing function', () => {
    process.env.OTEL_ENABLED = 'false';
    const { setupTracing } = require('../tracing.instrumentation');
    expect(typeof setupTracing).toBe('function');
  });

  it('should return undefined when OTEL_ENABLED is false', () => {
    process.env.OTEL_ENABLED = 'false';
    const { setupTracing } = require('../tracing.instrumentation');
    const result = setupTracing();
    expect(result).toBeUndefined();
    expect(MockNodeSDK).not.toHaveBeenCalled();
  });

  it('should create NodeSDK with correct service name from OTEL_SERVICE_NAME', () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_SERVICE_NAME = 'my-custom-service';
    const { setupTracing } = require('../tracing.instrumentation');
    setupTracing();

    expect(mockResourceFromAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'service.name': 'my-custom-service',
      }),
    );
  });

  it('should configure OTLPTraceExporter with correct endpoint from OTEL_EXPORTER_OTLP_ENDPOINT', () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://custom-jaeger:4318';
    const { setupTracing } = require('../tracing.instrumentation');
    setupTracing();

    expect(MockOTLPTraceExporter).toHaveBeenCalledWith({
      url: 'http://custom-jaeger:4318/v1/traces',
    });
  });

  it('should include HTTP, PostgreSQL, and Redis auto-instrumentations', () => {
    process.env.OTEL_ENABLED = 'true';
    const { setupTracing } = require('../tracing.instrumentation');
    setupTracing();

    expect(mockGetNodeAutoInstrumentations).toHaveBeenCalledWith(
      expect.objectContaining({
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-pg': { enabled: true },
        '@opentelemetry/instrumentation-ioredis': { enabled: true },
      }),
    );
  });

  it('should call sdk.start() when enabled', () => {
    process.env.OTEL_ENABLED = 'true';
    const { setupTracing } = require('../tracing.instrumentation');
    setupTracing();

    expect(mockSdkStart).toHaveBeenCalled();
  });

  it('should use default service name "devos-api" when OTEL_SERVICE_NAME not set', () => {
    process.env.OTEL_ENABLED = 'true';
    delete process.env.OTEL_SERVICE_NAME;
    const { setupTracing } = require('../tracing.instrumentation');
    setupTracing();

    expect(mockResourceFromAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'service.name': 'devos-api',
      }),
    );
  });

  it('should use default endpoint when OTEL_EXPORTER_OTLP_ENDPOINT not set', () => {
    process.env.OTEL_ENABLED = 'true';
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const { setupTracing } = require('../tracing.instrumentation');
    setupTracing();

    expect(MockOTLPTraceExporter).toHaveBeenCalledWith({
      url: 'http://jaeger:4318/v1/traces',
    });
  });
});
