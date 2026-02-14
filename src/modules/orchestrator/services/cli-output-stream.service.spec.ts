/**
 * CLIOutputStreamService Tests
 * Story 11.3: Agent-to-CLI Execution Pipeline
 *
 * TDD: Tests written first, then implementation.
 * Tests real-time output streaming with batching, Redis buffering, and archival.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CLIOutputStreamService } from './cli-output-stream.service';
import { RedisService } from '../../redis/redis.service';
import { CliSessionsService } from '../../cli-sessions/cli-sessions.service';

describe('CLIOutputStreamService', () => {
  let service: CLIOutputStreamService;
  let redisService: jest.Mocked<RedisService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let cliSessionsService: jest.Mocked<CliSessionsService>;

  const mockSessionId = 'session-123';
  const mockStreamParams = {
    sessionId: mockSessionId,
    workspaceId: 'ws-123',
    agentId: 'agent-456',
    agentType: 'dev',
  };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CLIOutputStreamService,
        {
          provide: RedisService,
          useValue: {
            del: jest.fn().mockResolvedValue(undefined),
            set: jest.fn().mockResolvedValue(undefined),
            get: jest.fn().mockResolvedValue(null),
            expire: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: CliSessionsService,
          useValue: {
            createSession: jest.fn().mockResolvedValue({ id: mockSessionId }),
          },
        },
      ],
    }).compile();

    service = module.get<CLIOutputStreamService>(CLIOutputStreamService);
    redisService = module.get(RedisService) as jest.Mocked<RedisService>;
    eventEmitter = module.get(EventEmitter2) as jest.Mocked<EventEmitter2>;
    cliSessionsService = module.get(
      CliSessionsService,
    ) as jest.Mocked<CliSessionsService>;
  });

  afterEach(() => {
    jest.useRealTimers();
    // Clean up any active streams
    service.onModuleDestroy();
  });

  describe('startStreaming', () => {
    it('should initialize output buffer in Redis', () => {
      service.startStreaming(mockStreamParams);

      expect(redisService.del).toHaveBeenCalledWith(
        `cli:output:${mockSessionId}`,
      );
    });

    it('should set up internal buffer and flush timer', () => {
      service.startStreaming(mockStreamParams);

      // Service should have the session tracked internally
      // We verify by calling onOutput and expecting no crash
      expect(() => {
        service.onOutput(mockSessionId, Buffer.from('test line\n'));
      }).not.toThrow();
    });
  });

  describe('onOutput', () => {
    it('should buffer output and flush at 100ms interval', () => {
      service.startStreaming(mockStreamParams);

      service.onOutput(mockSessionId, Buffer.from('line 1\nline 2\n'));

      // Before timer fires, no event should be emitted
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'cli:output',
        expect.anything(),
      );

      // Advance timer by 100ms
      jest.advanceTimersByTime(100);

      // Now the flush should have occurred
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'cli:output',
        expect.objectContaining({
          sessionId: mockSessionId,
          lines: expect.arrayContaining(['line 1', 'line 2']),
        }),
      );
    });

    it('should emit cli:output event with batched lines on flush', () => {
      service.startStreaming(mockStreamParams);

      service.onOutput(mockSessionId, Buffer.from('first\n'));
      service.onOutput(mockSessionId, Buffer.from('second\n'));

      jest.advanceTimersByTime(100);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'cli:output',
        expect.objectContaining({
          sessionId: mockSessionId,
          lines: expect.arrayContaining(['first', 'second']),
          lineOffset: 0,
        }),
      );
    });

    it('should store output lines in Redis', () => {
      service.startStreaming(mockStreamParams);

      service.onOutput(mockSessionId, Buffer.from('test line\n'));

      jest.advanceTimersByTime(100);

      // Should have stored in Redis
      expect(redisService.set).toHaveBeenCalledWith(
        `cli:output:${mockSessionId}`,
        expect.any(String),
        3600,
      );
    });

    it('should limit Redis buffer to 1000 lines', () => {
      service.startStreaming(mockStreamParams);

      // Send more than 1000 lines
      const lines = Array.from({ length: 1100 }, (_, i) => `line ${i}`).join(
        '\n',
      );
      service.onOutput(mockSessionId, Buffer.from(lines + '\n'));

      jest.advanceTimersByTime(100);

      // Verify Redis set was called - the service internally trims to 1000
      expect(redisService.set).toHaveBeenCalled();
      const setCall = redisService.set.mock.calls[0];
      const storedLines = JSON.parse(setCall[1]);
      expect(storedLines.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('stopStreaming', () => {
    it('should flush remaining buffer', async () => {
      service.startStreaming(mockStreamParams);

      service.onOutput(mockSessionId, Buffer.from('final line\n'));

      await service.stopStreaming(mockSessionId);

      // Should have flushed the remaining buffer
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'cli:output',
        expect.objectContaining({
          sessionId: mockSessionId,
          lines: expect.arrayContaining(['final line']),
        }),
      );
    });

    it('should set TTL on Redis buffer (1 hour)', async () => {
      service.startStreaming(mockStreamParams);

      await service.stopStreaming(mockSessionId);

      expect(redisService.expire).toHaveBeenCalledWith(
        `cli:output:${mockSessionId}`,
        3600,
      );
    });

    it('should archive full output to CLI sessions database', async () => {
      service.startStreaming(mockStreamParams);

      service.onOutput(mockSessionId, Buffer.from('line 1\nline 2\n'));

      jest.advanceTimersByTime(100);

      await service.stopStreaming(mockSessionId);

      expect(cliSessionsService.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockSessionId,
          agentId: 'agent-456',
          agentType: expect.any(String),
          workspaceId: 'ws-123',
          outputText: expect.stringContaining('line 1'),
          status: expect.any(String),
          startedAt: expect.any(String),
        }),
      );
    });
  });

  describe('getBufferedOutput', () => {
    it('should return buffered lines from Redis', async () => {
      const mockLines = JSON.stringify([
        'line 1',
        'line 2',
        'line 3',
      ]);
      redisService.get.mockResolvedValue(mockLines);

      const result = await service.getBufferedOutput(mockSessionId);

      expect(result).toEqual(['line 1', 'line 2', 'line 3']);
      expect(redisService.get).toHaveBeenCalledWith(
        `cli:output:${mockSessionId}`,
      );
    });

    it('should return empty array for non-existent session', async () => {
      redisService.get.mockResolvedValue(null);

      const result = await service.getBufferedOutput('nonexistent');

      expect(result).toEqual([]);
    });
  });
});
