import { SanitizedLoggerService } from './sanitized-logger.service';
import { Logger } from '@nestjs/common';

// Mock the Logger
jest.mock('@nestjs/common', () => ({
  ...jest.requireActual('@nestjs/common'),
  Logger: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    fatal: jest.fn(),
  })),
}));

describe('SanitizedLoggerService', () => {
  let service: SanitizedLoggerService;
  let mockLogger: any;

  beforeEach(() => {
    service = new SanitizedLoggerService('TestContext');
    mockLogger = (service as any).logger;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('log', () => {
    it('should sanitize API keys in log messages', () => {
      const messageWithKey = 'Using API key: sk-ant-1234567890abcdefghijklmnop';
      service.log(messageWithKey);

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Using API key: sk-ant-[REDACTED]',
        undefined,
      );
    });

    it('should pass through clean messages unchanged', () => {
      const cleanMessage = 'Normal log message without secrets';
      service.log(cleanMessage);

      expect(mockLogger.log).toHaveBeenCalledWith(cleanMessage, undefined);
    });
  });

  describe('error', () => {
    it('should sanitize API keys in error messages', () => {
      const errorWithKey =
        'API call failed with key sk-proj-1234567890abcdefghijklmnop';
      service.error(errorWithKey, 'stack trace');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'API call failed with key sk-proj-[REDACTED]',
        'stack trace',
        undefined,
      );
    });

    it('should sanitize Error objects', () => {
      const error = new Error(
        'Failed with key sk-ant-1234567890abcdefghijklmnop',
      );
      service.error(error);

      const callArg = mockLogger.error.mock.calls[0][0];
      expect(callArg.message).toBe('Failed with key sk-ant-[REDACTED]');
    });
  });

  describe('warn', () => {
    it('should sanitize warnings', () => {
      const warnWithKey = 'Warning: using key sk-1234567890abcdefghijklmnop';
      service.warn(warnWithKey);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Warning: using key sk-[REDACTED]',
        undefined,
      );
    });
  });

  describe('debug', () => {
    it('should sanitize debug messages', () => {
      const debugWithKey = {
        apiKey: 'sk-ant-1234567890abcdefghijklmnop',
        userId: 'user-123',
      };
      service.debug(debugWithKey);

      const callArg = mockLogger.debug.mock.calls[0][0];
      expect(callArg.apiKey).toBe('sk-ant-[REDACTED]');
      expect(callArg.userId).toBe('user-123');
    });
  });

  describe('verbose', () => {
    it('should sanitize verbose messages', () => {
      const verboseWithKey = 'Verbose: sk-proj-1234567890abcdefghijklmnop';
      service.verbose(verboseWithKey);

      expect(mockLogger.verbose).toHaveBeenCalledWith(
        'Verbose: sk-proj-[REDACTED]',
        undefined,
      );
    });
  });

  describe('fatal', () => {
    it('should sanitize fatal error messages', () => {
      const fatalWithKey = 'Fatal error with key sk-ant-1234567890abcdefghijklmnop';
      service.fatal(fatalWithKey, 'stack trace');

      expect(mockLogger.fatal).toHaveBeenCalledWith(
        'Fatal error with key sk-ant-[REDACTED]',
        'stack trace',
        undefined,
      );
    });
  });

  describe('setContext', () => {
    it('should allow changing logger context', () => {
      service.setContext('NewContext');
      expect(Logger).toHaveBeenCalledWith('NewContext');
    });
  });
});
