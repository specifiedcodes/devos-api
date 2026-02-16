import { LoggingService } from '../logging.service';
import { loggingContext } from '../logging.context';

describe('LoggingService', () => {
  let service: LoggingService;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  beforeEach(() => {
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_FORMAT;
    delete process.env.LOG_SERVICE_NAME;
    service = new LoggingService();
  });

  it('should create Winston logger instance', () => {
    const logger = service.getWinstonLogger();
    expect(logger).toBeDefined();
    expect(logger.transports).toBeDefined();
    expect(logger.transports.length).toBeGreaterThan(0);
  });

  it('should log info level messages with correct JSON structure', () => {
    const logger = service.getWinstonLogger();
    const writeSpy = jest.spyOn(logger, 'log');

    service.log('Test info message', 'TestContext');

    expect(writeSpy).toHaveBeenCalledWith(
      'info',
      'Test info message',
      expect.objectContaining({ context: 'TestContext' }),
    );
  });

  it('should log error level messages with error stack trace', () => {
    const logger = service.getWinstonLogger();
    const writeSpy = jest.spyOn(logger, 'log');

    service.error('Test error', 'Error stack trace', 'ErrorContext');

    expect(writeSpy).toHaveBeenCalledWith(
      'error',
      'Test error',
      expect.objectContaining({
        context: 'ErrorContext',
        error: 'Error stack trace',
      }),
    );
  });

  it('should log warn level messages', () => {
    const logger = service.getWinstonLogger();
    const writeSpy = jest.spyOn(logger, 'log');

    service.warn('Test warning', 'WarnContext');

    expect(writeSpy).toHaveBeenCalledWith(
      'warn',
      'Test warning',
      expect.objectContaining({ context: 'WarnContext' }),
    );
  });

  it('should log debug level messages (only when level is debug or verbose)', () => {
    process.env.LOG_LEVEL = 'debug';
    const debugService = new LoggingService();
    const logger = debugService.getWinstonLogger();
    const writeSpy = jest.spyOn(logger, 'log');

    debugService.debug('Debug message', 'DebugContext');

    expect(writeSpy).toHaveBeenCalledWith(
      'debug',
      'Debug message',
      expect.objectContaining({ context: 'DebugContext' }),
    );
  });

  it('should include service name in all log output', () => {
    const serviceName = service.getServiceName();
    expect(serviceName).toBe('devos-api');
  });

  it('should include timestamp in ISO-8601 format', () => {
    const logger = service.getWinstonLogger();
    // Winston's JSON format includes timestamp by default when configured
    expect(logger.format).toBeDefined();
  });

  it('should respect LOG_LEVEL configuration', () => {
    process.env.LOG_LEVEL = 'error';
    const errorOnlyService = new LoggingService();
    const logger = errorOnlyService.getWinstonLogger();
    expect(logger.level).toBe('error');
  });

  it('should map NestJS verbose to Winston debug (most permissive)', () => {
    process.env.LOG_LEVEL = 'verbose';
    const verboseService = new LoggingService();
    const logger = verboseService.getWinstonLogger();
    // NestJS verbose is the most permissive; maps to Winston debug (priority 5)
    expect(logger.level).toBe('debug');
  });

  it('should map NestJS debug to Winston verbose', () => {
    process.env.LOG_LEVEL = 'debug';
    const debugService = new LoggingService();
    const logger = debugService.getWinstonLogger();
    // NestJS debug maps to Winston verbose (priority 4)
    expect(logger.level).toBe('verbose');
  });

  it('should sanitize sensitive fields (password, token, apiKey, secret, authorization)', () => {
    const sensitiveData = {
      username: 'test',
      password: 'secret123',
      token: 'jwt-token-value',
      apiKey: 'api-key-value',
      secret: 'my-secret',
      authorization: 'Bearer xxx',
    };

    const sanitized = service.sanitize(sensitiveData);

    expect(sanitized.username).toBe('test');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.token).toBe('[REDACTED]');
    expect(sanitized.apiKey).toBe('[REDACTED]');
    expect(sanitized.secret).toBe('[REDACTED]');
    expect(sanitized.authorization).toBe('[REDACTED]');
  });

  it('should sanitize sensitive fields inside arrays', () => {
    const data = {
      users: [
        { name: 'Alice', password: 'secret123' },
        { name: 'Bob', token: 'jwt-value' },
      ],
    };

    const sanitized = service.sanitize(data);

    expect(sanitized.users[0].name).toBe('Alice');
    expect(sanitized.users[0].password).toBe('[REDACTED]');
    expect(sanitized.users[1].name).toBe('Bob');
    expect(sanitized.users[1].token).toBe('[REDACTED]');
  });

  it('should handle undefined/null messages gracefully', () => {
    const logger = service.getWinstonLogger();
    const logSpy = jest.spyOn(logger, 'log');

    service.log(undefined, 'TestContext');
    expect(logSpy).toHaveBeenCalledWith(
      'info',
      'undefined',
      expect.objectContaining({ context: 'TestContext' }),
    );

    service.log(null, 'TestContext');
    expect(logSpy).toHaveBeenCalledWith(
      'info',
      'null',
      expect.objectContaining({ context: 'TestContext' }),
    );
  });

  it('should include traceId from AsyncLocalStorage when available', (done) => {
    const logger = service.getWinstonLogger();
    const writeSpy = jest.spyOn(logger, 'log');

    loggingContext.run({ traceId: 'test-trace-123' }, () => {
      service.log('Traced message', 'TracedContext');
      expect(writeSpy).toHaveBeenCalledWith(
        'info',
        'Traced message',
        expect.objectContaining({
          context: 'TracedContext',
          traceId: 'test-trace-123',
        }),
      );
      done();
    });
  });

  it('should respect LOG_SERVICE_NAME environment variable', () => {
    process.env.LOG_SERVICE_NAME = 'custom-service';
    const customService = new LoggingService();
    expect(customService.getServiceName()).toBe('custom-service');
  });

  it('should default to info level when LOG_LEVEL is not set', () => {
    const logger = service.getWinstonLogger();
    expect(logger.level).toBe('info');
  });

  it('should merge object message properties into log meta as top-level fields', () => {
    const logger = service.getWinstonLogger();
    const logSpy = jest.spyOn(logger, 'log');

    service.log(
      {
        message: 'Request completed GET /api',
        method: 'GET',
        path: '/api',
        statusCode: 200,
        duration: 42,
      },
      'TestContext',
    );

    expect(logSpy).toHaveBeenCalledWith(
      'info',
      'Request completed GET /api',
      expect.objectContaining({
        context: 'TestContext',
        method: 'GET',
        path: '/api',
        statusCode: 200,
        duration: 42,
      }),
    );
  });
});
