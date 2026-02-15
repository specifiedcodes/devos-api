/**
 * AgentFailureDetectorService Tests
 * Story 11.9: Agent Failure Recovery & Checkpoints
 *
 * Tests failure detection for CLI pipeline sessions.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentFailureDetectorService } from './agent-failure-detector.service';
import {
  FailureMonitoringParams,
  DEFAULT_MAX_SESSION_DURATION_MS,
  API_ERROR_THRESHOLD,
  FILE_MODIFICATION_LOOP_THRESHOLD,
} from '../interfaces/failure-recovery.interfaces';

describe('AgentFailureDetectorService', () => {
  let service: AgentFailureDetectorService;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const mockParams: FailureMonitoringParams = {
    sessionId: 'session-123',
    agentId: 'agent-001',
    agentType: 'dev',
    projectId: 'proj-789',
    workspaceId: 'ws-456',
    storyId: 'story-11-9',
  };

  beforeEach(async () => {
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentFailureDetectorService,
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
            on: jest.fn(),
            removeListener: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AgentFailureDetectorService>(
      AgentFailureDetectorService,
    );
    eventEmitter = module.get(EventEmitter2);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  describe('registerSession', () => {
    it('should initialize tracking state for session', () => {
      service.registerSession(mockParams);

      // The session should be registered (no error thrown)
      // We can verify by trying to handle events for this session
      expect(() => service.unregisterSession(mockParams.sessionId)).not.toThrow();
    });

    it('should set up timeout timer based on configured max duration', () => {
      service.registerSession(mockParams);

      // Fast-forward past default max duration (2 hours)
      jest.advanceTimersByTime(DEFAULT_MAX_SESSION_DURATION_MS + 1000);

      // Should have emitted timeout failure
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent:failure',
        expect.objectContaining({
          failureType: 'timeout',
          sessionId: 'session-123',
        }),
      );
    });

    it('should use custom maxDurationMs when provided', () => {
      const customParams = { ...mockParams, maxDurationMs: 60_000 }; // 1 minute
      service.registerSession(customParams);

      // Should not trigger at 50s
      jest.advanceTimersByTime(50_000);
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'agent:failure',
        expect.objectContaining({ failureType: 'timeout' }),
      );

      // Should trigger after 1 minute
      jest.advanceTimersByTime(11_000);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent:failure',
        expect.objectContaining({
          failureType: 'timeout',
          sessionId: 'session-123',
        }),
      );
    });
  });

  describe('unregisterSession', () => {
    it('should clear all tracking state and timers', () => {
      service.registerSession(mockParams);
      service.unregisterSession(mockParams.sessionId);

      // Fast-forward past timeout - should NOT trigger failure
      jest.advanceTimersByTime(DEFAULT_MAX_SESSION_DURATION_MS + 1000);

      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'agent:failure',
        expect.objectContaining({ failureType: 'timeout' }),
      );
    });

    it('should not emit failure for already-unregistered session', () => {
      // Unregistering a non-existent session should not throw
      expect(() =>
        service.unregisterSession('nonexistent-session'),
      ).not.toThrow();
    });
  });

  describe('handleProcessExit', () => {
    beforeEach(() => {
      service.registerSession(mockParams);
    });

    it('should create AgentFailure for non-zero exit code', async () => {
      const failure = await service.handleProcessExit({
        sessionId: 'session-123',
        exitCode: 1,
        signal: null,
        stderr: 'Segmentation fault',
      });

      expect(failure).toBeDefined();
      expect(failure!.sessionId).toBe('session-123');
      expect(failure!.failureType).toBe('crash');
    });

    it('should ignore zero exit code (normal termination)', async () => {
      const failure = await service.handleProcessExit({
        sessionId: 'session-123',
        exitCode: 0,
        signal: null,
        stderr: '',
      });

      expect(failure).toBeNull();
    });

    it('should set failureType to crash', async () => {
      const failure = await service.handleProcessExit({
        sessionId: 'session-123',
        exitCode: 137,
        signal: 'SIGKILL',
        stderr: 'Killed',
      });

      expect(failure).toBeDefined();
      expect(failure!.failureType).toBe('crash');
    });

    it('should include exit code in errorDetails', async () => {
      const failure = await service.handleProcessExit({
        sessionId: 'session-123',
        exitCode: 1,
        signal: null,
        stderr: 'Error occurred',
      });

      expect(failure).toBeDefined();
      expect(failure!.errorDetails).toContain('1');
      expect(failure!.errorDetails).toContain('Error occurred');
    });

    it('should emit agent:failure event', async () => {
      await service.handleProcessExit({
        sessionId: 'session-123',
        exitCode: 1,
        signal: null,
        stderr: 'Crash',
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent:failure',
        expect.objectContaining({
          failureType: 'crash',
          sessionId: 'session-123',
        }),
      );
    });
  });

  describe('handleApiError', () => {
    beforeEach(() => {
      service.registerSession(mockParams);
    });

    it('should return null for first 4 errors (below threshold)', async () => {
      for (let i = 0; i < API_ERROR_THRESHOLD - 1; i++) {
        const result = await service.handleApiError({
          sessionId: 'session-123',
          statusCode: 429,
          errorMessage: 'Rate limited',
        });
        expect(result).toBeNull();
      }
    });

    it('should create AgentFailure on 5th consecutive error', async () => {
      // Send 4 errors (below threshold)
      for (let i = 0; i < API_ERROR_THRESHOLD - 1; i++) {
        await service.handleApiError({
          sessionId: 'session-123',
          statusCode: 429,
          errorMessage: 'Rate limited',
        });
      }

      // 5th error should trigger failure
      const failure = await service.handleApiError({
        sessionId: 'session-123',
        statusCode: 429,
        errorMessage: 'Rate limited',
      });

      expect(failure).toBeDefined();
      expect(failure!.failureType).toBe('api_error');
    });

    it('should reset error count on successful API call (statusCode < 400)', async () => {
      // Send 3 errors
      for (let i = 0; i < 3; i++) {
        await service.handleApiError({
          sessionId: 'session-123',
          statusCode: 500,
          errorMessage: 'Server error',
        });
      }

      // Reset with success
      await service.handleApiError({
        sessionId: 'session-123',
        statusCode: 200,
        errorMessage: '',
      });

      // Send 4 more errors - should still be below threshold
      for (let i = 0; i < API_ERROR_THRESHOLD - 1; i++) {
        const result = await service.handleApiError({
          sessionId: 'session-123',
          statusCode: 500,
          errorMessage: 'Server error',
        });
        expect(result).toBeNull();
      }
    });

    it('should distinguish 429 (rate_limit) from 500 (server error) in metadata', async () => {
      // Trigger 429 failure
      for (let i = 0; i < API_ERROR_THRESHOLD; i++) {
        await service.handleApiError({
          sessionId: 'session-123',
          statusCode: 429,
          errorMessage: 'Rate limited',
        });
      }

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent:failure',
        expect.objectContaining({
          metadata: expect.objectContaining({
            statusCode: 429,
          }),
        }),
      );
    });
  });

  describe('handleFileModification', () => {
    beforeEach(() => {
      service.registerSession(mockParams);
    });

    it('should return null below 20 modifications of same file', async () => {
      for (let i = 0; i < FILE_MODIFICATION_LOOP_THRESHOLD - 1; i++) {
        const result = await service.handleFileModification({
          sessionId: 'session-123',
          filePath: 'src/app.ts',
          testsPassed: false,
        });
        expect(result).toBeNull();
      }
    });

    it('should create AgentFailure on 20th modification of same file', async () => {
      for (let i = 0; i < FILE_MODIFICATION_LOOP_THRESHOLD - 1; i++) {
        await service.handleFileModification({
          sessionId: 'session-123',
          filePath: 'src/app.ts',
          testsPassed: false,
        });
      }

      const failure = await service.handleFileModification({
        sessionId: 'session-123',
        filePath: 'src/app.ts',
        testsPassed: false,
      });

      expect(failure).toBeDefined();
      expect(failure!.failureType).toBe('loop');
    });

    it('should set failureType to loop', async () => {
      for (let i = 0; i < FILE_MODIFICATION_LOOP_THRESHOLD; i++) {
        await service.handleFileModification({
          sessionId: 'session-123',
          filePath: 'src/app.ts',
          testsPassed: false,
        });
      }

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent:failure',
        expect.objectContaining({
          failureType: 'loop',
        }),
      );
    });

    it('should reset count when tests pass', async () => {
      // Modify file 15 times
      for (let i = 0; i < 15; i++) {
        await service.handleFileModification({
          sessionId: 'session-123',
          filePath: 'src/app.ts',
          testsPassed: false,
        });
      }

      // Tests pass - should reset count
      await service.handleFileModification({
        sessionId: 'session-123',
        filePath: 'src/app.ts',
        testsPassed: true,
      });

      // Modify 19 more times - should not trigger failure (reset happened)
      for (let i = 0; i < FILE_MODIFICATION_LOOP_THRESHOLD - 1; i++) {
        const result = await service.handleFileModification({
          sessionId: 'session-123',
          filePath: 'src/app.ts',
          testsPassed: false,
        });
        expect(result).toBeNull();
      }
    });
  });

  describe('stalled session event handling', () => {
    it('should create stuck failure when cli:session:stalled event is received', () => {
      service.registerSession(mockParams);

      // Simulate the stalled event
      service.handleSessionStalled({
        sessionId: 'session-123',
        lastActivityTimestamp: new Date(),
        stallDuration: 600_000,
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent:failure',
        expect.objectContaining({
          failureType: 'stuck',
          sessionId: 'session-123',
        }),
      );
    });
  });

  describe('timeout', () => {
    it('should create timeout failure when session exceeds max duration', () => {
      service.registerSession(mockParams);

      jest.advanceTimersByTime(DEFAULT_MAX_SESSION_DURATION_MS + 1000);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent:failure',
        expect.objectContaining({
          failureType: 'timeout',
          sessionId: 'session-123',
        }),
      );
    });
  });

  describe('getActiveFailures', () => {
    it('should return only unresolved failures', async () => {
      service.registerSession(mockParams);

      // Create a failure
      await service.handleProcessExit({
        sessionId: 'session-123',
        exitCode: 1,
        signal: null,
        stderr: 'Crash',
      });

      const failures = service.getActiveFailures();
      expect(failures).toHaveLength(1);
      expect(failures[0].resolved).toBe(false);
    });

    it('should not return resolved failures', async () => {
      service.registerSession(mockParams);

      const failure = await service.handleProcessExit({
        sessionId: 'session-123',
        exitCode: 1,
        signal: null,
        stderr: 'Crash',
      });

      // Mark as resolved
      service.resolveFailure(failure!.id);

      const failures = service.getActiveFailures();
      expect(failures).toHaveLength(0);
    });
  });
});
