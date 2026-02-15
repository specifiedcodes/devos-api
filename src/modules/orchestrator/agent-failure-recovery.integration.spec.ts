/**
 * Agent Failure Recovery Integration Tests
 * Story 11.9: Agent Failure Recovery & Checkpoints
 *
 * Tests the full failure -> detection -> recovery cycle with all services
 * working together.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AgentFailureDetectorService } from './services/agent-failure-detector.service';
import { CheckpointService } from './services/checkpoint.service';
import { PipelineFailureRecoveryService } from './services/pipeline-failure-recovery.service';
import { PipelineStateMachineService } from './services/pipeline-state-machine.service';
import { CLISessionLifecycleService } from './services/cli-session-lifecycle.service';
import { SessionHealthMonitorService } from './services/session-health-monitor.service';
import { HandoffCoordinatorService } from './services/handoff-coordinator.service';
import { FailureRecoveryHistory } from './entities/failure-recovery-history.entity';
import { RedisService } from '../redis/redis.service';
import {
  FailureMonitoringParams,
  AgentFailure,
  DEFAULT_MAX_SESSION_DURATION_MS,
} from './interfaces/failure-recovery.interfaces';

describe('Agent Failure Recovery Integration', () => {
  let failureDetector: AgentFailureDetectorService;
  let checkpointService: CheckpointService;
  let recoveryService: PipelineFailureRecoveryService;
  let eventEmitter: EventEmitter2;
  let lifecycleService: jest.Mocked<CLISessionLifecycleService>;
  let stateMachine: jest.Mocked<PipelineStateMachineService>;
  let historyRepo: any;
  let redisService: jest.Mocked<RedisService>;

  const mockParams: FailureMonitoringParams = {
    sessionId: 'session-int-001',
    agentId: 'agent-int-001',
    agentType: 'dev',
    projectId: 'proj-int-789',
    workspaceId: 'ws-int-456',
    storyId: 'story-int-11-9',
  };

  beforeEach(async () => {
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentFailureDetectorService,
        CheckpointService,
        PipelineFailureRecoveryService,
        {
          provide: EventEmitter2,
          useValue: new EventEmitter2(),
        },
        {
          provide: RedisService,
          useValue: {
            zadd: jest.fn().mockResolvedValue(1),
            zrangebyscore: jest.fn().mockResolvedValue([]),
            del: jest.fn().mockResolvedValue(undefined),
            set: jest.fn().mockResolvedValue(undefined),
            get: jest.fn().mockResolvedValue(null),
            expire: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: PipelineStateMachineService,
          useValue: {
            pausePipeline: jest.fn().mockResolvedValue({
              previousState: 'implementing',
              newState: 'paused',
              message: 'Pipeline paused',
            }),
            resumePipeline: jest.fn().mockResolvedValue({
              previousState: 'paused',
              newState: 'implementing',
              message: 'Pipeline resumed',
            }),
            transition: jest.fn().mockResolvedValue(undefined),
            getState: jest.fn().mockResolvedValue({
              projectId: 'proj-int-789',
              workspaceId: 'ws-int-456',
              currentState: 'implementing',
              metadata: {},
            }),
            onPhaseFailed: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: CLISessionLifecycleService,
          useValue: {
            terminateSession: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SessionHealthMonitorService,
          useValue: {
            stopMonitoring: jest.fn(),
          },
        },
        {
          provide: HandoffCoordinatorService,
          useValue: {
            processHandoff: jest.fn().mockResolvedValue({
              success: true,
              queued: false,
            }),
          },
        },
        {
          provide: getRepositoryToken(FailureRecoveryHistory),
          useValue: {
            create: jest.fn().mockImplementation((data) => data),
            save: jest.fn().mockResolvedValue({}),
            find: jest.fn().mockResolvedValue([]),
            findAndCount: jest.fn().mockResolvedValue([[], 0]),
          },
        },
      ],
    }).compile();

    failureDetector = module.get<AgentFailureDetectorService>(
      AgentFailureDetectorService,
    );
    checkpointService = module.get<CheckpointService>(CheckpointService);
    recoveryService = module.get<PipelineFailureRecoveryService>(
      PipelineFailureRecoveryService,
    );
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    lifecycleService = module.get(CLISessionLifecycleService);
    stateMachine = module.get(PipelineStateMachineService);
    historyRepo = module.get(getRepositoryToken(FailureRecoveryHistory));
    redisService = module.get(RedisService);
  });

  afterEach(() => {
    failureDetector.onModuleDestroy();
    jest.useRealTimers();
  });

  describe('CLI crash triggers failure detection and automatic retry', () => {
    it('should detect crash and attempt retry from checkpoint', async () => {
      // Register session
      failureDetector.registerSession(mockParams);

      // Simulate a CLI crash
      const failure = await failureDetector.handleProcessExit({
        sessionId: 'session-int-001',
        exitCode: 1,
        signal: null,
        stderr: 'Segfault',
      });

      expect(failure).toBeDefined();
      expect(failure!.failureType).toBe('crash');

      // Handle recovery
      const result = await recoveryService.handleFailure(failure!);

      expect(result.success).toBe(true);
      expect(result.strategy).toMatch(/retry|checkpoint_recovery/);
      expect(lifecycleService.terminateSession).toHaveBeenCalledWith(
        'session-int-001',
      );
    });
  });

  describe('Stuck agent triggers failure detection after stall event', () => {
    it('should detect stalled session and create stuck failure', () => {
      failureDetector.registerSession(mockParams);

      // Simulate stall event from SessionHealthMonitorService
      failureDetector.handleSessionStalled({
        sessionId: 'session-int-001',
        lastActivityTimestamp: new Date(),
        stallDuration: 600_000,
      });

      const failures = failureDetector.getActiveFailures();
      expect(failures).toHaveLength(1);
      expect(failures[0].failureType).toBe('stuck');
    });
  });

  describe('Retry from checkpoint uses correct git commit', () => {
    it('should use latest checkpoint commit hash during recovery', async () => {
      // Create a checkpoint
      await checkpointService.createCheckpoint({
        sessionId: 'session-int-001',
        agentId: 'agent-int-001',
        projectId: 'proj-int-789',
        workspaceId: 'ws-int-456',
        storyId: 'story-int-11-9',
        commitHash: 'good-commit-abc123',
        branch: 'feature/test',
        filesModified: ['file.ts'],
        testsPassed: true,
        description: 'Good checkpoint',
      });

      // Mock Redis to return the checkpoint
      redisService.zrangebyscore.mockResolvedValue([
        JSON.stringify({
          id: 'cp-1',
          sessionId: 'session-int-001',
          commitHash: 'good-commit-abc123',
          branch: 'feature/test',
          filesModified: ['file.ts'],
          testsPassed: true,
          description: 'Good checkpoint',
          createdAt: new Date(),
        }),
      ]);

      failureDetector.registerSession(mockParams);

      const failure = await failureDetector.handleProcessExit({
        sessionId: 'session-int-001',
        exitCode: 1,
        signal: null,
        stderr: 'Crash',
      });

      const result = await recoveryService.retryFromCheckpoint(failure!);

      expect(result.checkpointUsed).toBe('good-commit-abc123');
    });
  });

  describe('Context refresh regenerates context files', () => {
    it('should use context_refresh strategy', async () => {
      failureDetector.registerSession(mockParams);

      const failure = await failureDetector.handleProcessExit({
        sessionId: 'session-int-001',
        exitCode: 1,
        signal: null,
        stderr: 'Context confusion',
      });

      const result = await recoveryService.contextRefreshRetry(failure!);

      expect(result.strategy).toBe('context_refresh');
      expect(result.success).toBe(true);
    });
  });

  describe('Escalation pauses pipeline and emits event', () => {
    it('should escalate to user after all retries exhausted', async () => {
      failureDetector.registerSession(mockParams);

      const failure = await failureDetector.handleProcessExit({
        sessionId: 'session-int-001',
        exitCode: 1,
        signal: null,
        stderr: 'Persistent failure',
      });

      const result = await recoveryService.escalateToUser(failure!);

      expect(result.strategy).toBe('escalation');
      expect(result.success).toBe(false);
      expect(stateMachine.pausePipeline).toHaveBeenCalled();
    });
  });

  describe('Manual override terminates pipeline correctly', () => {
    it('should transition to FAILED on terminate override', async () => {
      failureDetector.registerSession(mockParams);

      const failure = await failureDetector.handleProcessExit({
        sessionId: 'session-int-001',
        exitCode: 1,
        signal: null,
        stderr: 'Fatal error',
      });

      const result = await recoveryService.handleManualOverride({
        failureId: failure!.id,
        workspaceId: 'ws-int-456',
        userId: 'user-001',
        action: 'terminate',
      });

      expect(result.strategy).toBe('manual_override');
      expect(stateMachine.transition).toHaveBeenCalledWith(
        'proj-int-789',
        'failed',
        expect.anything(),
      );
    });
  });

  describe('Manual override reassigns to new agent type', () => {
    it('should allow reassigning to a different agent', async () => {
      failureDetector.registerSession(mockParams);

      const failure = await failureDetector.handleProcessExit({
        sessionId: 'session-int-001',
        exitCode: 1,
        signal: null,
        stderr: 'Wrong agent type',
      });

      const result = await recoveryService.handleManualOverride({
        failureId: failure!.id,
        workspaceId: 'ws-int-456',
        userId: 'user-001',
        action: 'reassign',
        reassignToAgentType: 'planner',
      });

      expect(result.strategy).toBe('manual_override');
      expect(result.success).toBe(true);
    });
  });

  describe('Recovery succeeds and pipeline continues', () => {
    it('should resolve failure after successful recovery', async () => {
      failureDetector.registerSession(mockParams);

      const failure = await failureDetector.handleProcessExit({
        sessionId: 'session-int-001',
        exitCode: 1,
        signal: null,
        stderr: 'Transient crash',
      });

      await recoveryService.retryFromCheckpoint(failure!);

      // After recovery, failure should be resolved
      const activeFailures = failureDetector.getActiveFailures();
      expect(activeFailures).toHaveLength(0);
    });
  });

  describe('Multiple failures exhaust retries and escalate', () => {
    it('should escalate after 3+ retries', async () => {
      failureDetector.registerSession(mockParams);

      // Create and handle 4 failures
      for (let i = 0; i < 4; i++) {
        const failure = await failureDetector.handleProcessExit({
          sessionId: 'session-int-001',
          exitCode: 1,
          signal: null,
          stderr: `Failure #${i + 1}`,
        });

        const result = await recoveryService.handleFailure(failure!);

        if (i < 3) {
          // First 3 should be retry/context_refresh strategies
          expect(result.strategy).not.toBe('escalation');
        } else {
          // 4th should be escalation
          expect(result.strategy).toBe('escalation');
        }
      }
    });
  });

  describe('Infinite loop triggers immediate context refresh', () => {
    it('should route loop detection to context_refresh on first attempt', async () => {
      failureDetector.registerSession(mockParams);

      // Simulate infinite loop (20 modifications without test pass)
      let failure: AgentFailure | null = null;
      for (let i = 0; i < 20; i++) {
        failure = await failureDetector.handleFileModification({
          sessionId: 'session-int-001',
          filePath: 'src/stuck-file.ts',
          testsPassed: false,
        });
      }

      expect(failure).toBeDefined();
      expect(failure!.failureType).toBe('loop');

      const result = await recoveryService.handleFailure(failure!);
      expect(result.strategy).toBe('context_refresh');
    });
  });

  describe('Timeout failure', () => {
    it('should detect timeout when session exceeds max duration', () => {
      failureDetector.registerSession(mockParams);

      jest.advanceTimersByTime(DEFAULT_MAX_SESSION_DURATION_MS + 1000);

      const failures = failureDetector.getActiveFailures();
      expect(failures).toHaveLength(1);
      expect(failures[0].failureType).toBe('timeout');
    });
  });

  describe('Checkpoint cleanup after session completion', () => {
    it('should delete session checkpoints on cleanup', async () => {
      await checkpointService.deleteSessionCheckpoints('session-int-001');

      expect(redisService.del).toHaveBeenCalledWith(
        'pipeline:checkpoints:session-int-001',
      );
    });
  });

  describe('Failure events emitted in correct order', () => {
    it('should emit agent:failure event when failure is detected', async () => {
      const emittedEvents: string[] = [];
      eventEmitter.on('agent:failure', () =>
        emittedEvents.push('agent:failure'),
      );

      failureDetector.registerSession(mockParams);

      await failureDetector.handleProcessExit({
        sessionId: 'session-int-001',
        exitCode: 1,
        signal: null,
        stderr: 'Crash',
      });

      expect(emittedEvents).toContain('agent:failure');
    });
  });

  describe('Recovery history persisted', () => {
    it('should record recovery attempt in PostgreSQL', async () => {
      failureDetector.registerSession(mockParams);

      const failure = await failureDetector.handleProcessExit({
        sessionId: 'session-int-001',
        exitCode: 1,
        signal: null,
        stderr: 'Crash',
      });

      await recoveryService.retryFromCheckpoint(failure!);

      expect(historyRepo.create).toHaveBeenCalled();
      expect(historyRepo.save).toHaveBeenCalled();
    });
  });

  describe('Backward compatibility without recovery service', () => {
    it('should not break existing pipeline behavior', async () => {
      // The recovery service is @Optional in the controller,
      // so existing pipelines without failure recovery should still work
      const status = await recoveryService.getRecoveryStatus('proj-int-789');

      expect(status.projectId).toBe('proj-int-789');
      expect(status.activeFailures).toHaveLength(0);
    });
  });
});
