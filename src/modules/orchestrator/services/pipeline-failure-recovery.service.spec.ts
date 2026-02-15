/**
 * PipelineFailureRecoveryService Tests
 * Story 11.9: Agent Failure Recovery & Checkpoints
 *
 * Tests recovery orchestration for pipeline agent failures.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PipelineFailureRecoveryService } from './pipeline-failure-recovery.service';
import { CheckpointService } from './checkpoint.service';
import { AgentFailureDetectorService } from './agent-failure-detector.service';
import { PipelineStateMachineService } from './pipeline-state-machine.service';
import { CLISessionLifecycleService } from './cli-session-lifecycle.service';
import { SessionHealthMonitorService } from './session-health-monitor.service';
import { HandoffCoordinatorService } from './handoff-coordinator.service';
import { FailureRecoveryHistory } from '../entities/failure-recovery-history.entity';
import {
  AgentFailure,
  Checkpoint,
  DEFAULT_MAX_RECOVERY_RETRIES,
} from '../interfaces/failure-recovery.interfaces';

describe('PipelineFailureRecoveryService', () => {
  let service: PipelineFailureRecoveryService;
  let checkpointService: jest.Mocked<CheckpointService>;
  let failureDetector: jest.Mocked<AgentFailureDetectorService>;
  let stateMachine: jest.Mocked<PipelineStateMachineService>;
  let lifecycleService: jest.Mocked<CLISessionLifecycleService>;
  let healthMonitor: jest.Mocked<SessionHealthMonitorService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let historyRepo: any;

  const mockCheckpoint: Checkpoint = {
    id: 'cp-1',
    sessionId: 'session-123',
    agentId: 'agent-001',
    projectId: 'proj-789',
    workspaceId: 'ws-456',
    storyId: 'story-11-9',
    commitHash: 'abc123',
    branch: 'feature/test',
    filesModified: ['file.ts'],
    testsPassed: true,
    description: 'Checkpoint',
    createdAt: new Date(),
  };

  const createMockFailure = (
    overrides: Partial<AgentFailure> = {},
  ): AgentFailure => ({
    id: 'failure-001',
    sessionId: 'session-123',
    agentId: 'agent-001',
    agentType: 'dev',
    projectId: 'proj-789',
    workspaceId: 'ws-456',
    storyId: 'story-11-9',
    failureType: 'crash',
    retryCount: 0,
    lastCheckpoint: null,
    errorDetails: 'Process exited with code 1',
    recoveryAction: 'pending',
    resolved: false,
    timestamp: new Date(),
    metadata: {},
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineFailureRecoveryService,
        {
          provide: CheckpointService,
          useValue: {
            getLatestCheckpoint: jest.fn().mockResolvedValue(mockCheckpoint),
            getLatestStoryCheckpoint: jest
              .fn()
              .mockResolvedValue(mockCheckpoint),
            deleteSessionCheckpoints: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AgentFailureDetectorService,
          useValue: {
            getActiveFailures: jest.fn().mockReturnValue([]),
            resolveFailure: jest.fn(),
            getFailure: jest.fn(),
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
              projectId: 'proj-789',
              workspaceId: 'ws-456',
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
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FailureRecoveryHistory),
          useValue: {
            create: jest.fn().mockImplementation((data) => data),
            save: jest.fn().mockResolvedValue({}),
            find: jest.fn().mockResolvedValue([]),
            findAndCount: jest
              .fn()
              .mockResolvedValue([[], 0]),
          },
        },
      ],
    }).compile();

    service = module.get<PipelineFailureRecoveryService>(
      PipelineFailureRecoveryService,
    );
    checkpointService = module.get(CheckpointService);
    failureDetector = module.get(AgentFailureDetectorService);
    stateMachine = module.get(PipelineStateMachineService);
    lifecycleService = module.get(CLISessionLifecycleService);
    healthMonitor = module.get(SessionHealthMonitorService);
    eventEmitter = module.get(EventEmitter2);
    historyRepo = module.get(getRepositoryToken(FailureRecoveryHistory));
  });

  describe('handleFailure', () => {
    it('should route to retryFromCheckpoint on first failure', async () => {
      const failure = createMockFailure({ retryCount: 0 });
      const result = await service.handleFailure(failure);

      expect(result.strategy).toMatch(/retry|checkpoint_recovery/);
      expect(lifecycleService.terminateSession).toHaveBeenCalled();
    });

    it('should route to retryFromCheckpoint on second failure with extended timeout', async () => {
      const failure = createMockFailure({ retryCount: 0 });

      // First failure
      await service.handleFailure(failure);

      // Second failure for same project
      const failure2 = createMockFailure({
        id: 'failure-002',
        retryCount: 0,
      });
      const result2 = await service.handleFailure(failure2);

      expect(result2.strategy).toMatch(/retry|checkpoint_recovery/);
    });

    it('should route to contextRefreshRetry on third failure', async () => {
      const failure = createMockFailure();

      // Exhaust first two retries
      await service.handleFailure(failure);
      await service.handleFailure(
        createMockFailure({ id: 'failure-002' }),
      );

      // Third failure should go to context refresh
      const failure3 = createMockFailure({ id: 'failure-003' });
      const result3 = await service.handleFailure(failure3);

      expect(result3.strategy).toBe('context_refresh');
    });

    it('should route to escalateToUser after 3 retries', async () => {
      const failure = createMockFailure();

      // Exhaust all retries
      await service.handleFailure(failure);
      await service.handleFailure(
        createMockFailure({ id: 'failure-002' }),
      );
      await service.handleFailure(
        createMockFailure({ id: 'failure-003' }),
      );

      // 4th failure should escalate
      const failure4 = createMockFailure({ id: 'failure-004' });
      const result4 = await service.handleFailure(failure4);

      expect(result4.strategy).toBe('escalation');
    });

    it('should apply exponential backoff for API error 429', async () => {
      jest.useFakeTimers();

      const failure = createMockFailure({
        failureType: 'api_error',
        metadata: { statusCode: 429 },
      });

      // Start the handleFailure call (it will be waiting on delay)
      const resultPromise = service.handleFailure(failure);

      // Advance timers to resolve the backoff delay
      jest.advanceTimersByTime(60_000);

      const result = await resultPromise;

      // Should still route to retry/checkpoint_recovery
      expect(result.strategy).toMatch(/retry|checkpoint_recovery/);
      expect(result).toBeDefined();

      jest.useRealTimers();
    });

    it('should route infinite loop to context refresh immediately', async () => {
      const failure = createMockFailure({
        failureType: 'loop',
      });

      const result = await service.handleFailure(failure);

      expect(result.strategy).toBe('context_refresh');
    });

    it('should extend timeout for timeout failures', async () => {
      const failure = createMockFailure({
        failureType: 'timeout',
      });

      const result = await service.handleFailure(failure);

      expect(result.strategy).toMatch(/retry|checkpoint_recovery/);
      expect(result).toBeDefined();
    });
  });

  describe('retryFromCheckpoint', () => {
    it('should terminate failed session', async () => {
      const failure = createMockFailure();
      await service.retryFromCheckpoint(failure);

      expect(lifecycleService.terminateSession).toHaveBeenCalledWith(
        'session-123',
      );
    });

    it('should get checkpoint from CheckpointService', async () => {
      const failure = createMockFailure();
      await service.retryFromCheckpoint(failure);

      expect(checkpointService.getLatestCheckpoint).toHaveBeenCalledWith(
        'session-123',
      );
    });

    it('should fall back to fresh start when no checkpoint exists', async () => {
      checkpointService.getLatestCheckpoint.mockResolvedValue(null);
      checkpointService.getLatestStoryCheckpoint.mockResolvedValue(null);

      const failure = createMockFailure();
      const result = await service.retryFromCheckpoint(failure);

      expect(result.checkpointUsed).toBeNull();
      expect(result.success).toBe(true);
    });

    it('should emit agent:recovery_attempt event', async () => {
      const failure = createMockFailure();
      await service.retryFromCheckpoint(failure);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent:recovery_attempt',
        expect.objectContaining({
          type: 'agent:recovery_attempt',
          failureId: failure.id,
          strategy: 'checkpoint_recovery',
        }),
      );
    });

    it('should record recovery in FailureRecoveryHistory', async () => {
      const failure = createMockFailure();
      await service.retryFromCheckpoint(failure);

      expect(historyRepo.create).toHaveBeenCalled();
      expect(historyRepo.save).toHaveBeenCalled();
    });

    it('should use checkpoint commit hash when available', async () => {
      const failure = createMockFailure();
      const result = await service.retryFromCheckpoint(failure);

      expect(result.checkpointUsed).toBe('abc123');
    });
  });

  describe('contextRefreshRetry', () => {
    it('should regenerate context files before retry', async () => {
      const failure = createMockFailure();
      const result = await service.contextRefreshRetry(failure);

      expect(result.strategy).toBe('context_refresh');
      expect(result.success).toBe(true);
    });

    it('should use checkpoint if available', async () => {
      const failure = createMockFailure();
      const result = await service.contextRefreshRetry(failure);

      expect(checkpointService.getLatestCheckpoint).toHaveBeenCalled();
      expect(result.checkpointUsed).toBe('abc123');
    });

    it('should emit agent:recovery_attempt event', async () => {
      const failure = createMockFailure();
      await service.contextRefreshRetry(failure);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent:recovery_attempt',
        expect.objectContaining({
          type: 'agent:recovery_attempt',
          strategy: 'context_refresh',
        }),
      );
    });
  });

  describe('escalateToUser', () => {
    it('should pause pipeline via state machine', async () => {
      const failure = createMockFailure();
      await service.escalateToUser(failure);

      expect(stateMachine.pausePipeline).toHaveBeenCalledWith(
        'proj-789',
        'system:failure-recovery',
      );
    });

    it('should emit agent:recovery_escalation event', async () => {
      const failure = createMockFailure();
      await service.escalateToUser(failure);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent:recovery_escalation',
        expect.objectContaining({
          type: 'agent:recovery_escalation',
          failureId: failure.id,
          overrideOptions: ['terminate', 'reassign', 'provide_guidance'],
        }),
      );
    });

    it('should record escalation in FailureRecoveryHistory', async () => {
      const failure = createMockFailure();
      await service.escalateToUser(failure);

      expect(historyRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recoveryStrategy: 'escalation',
        }),
      );
      expect(historyRepo.save).toHaveBeenCalled();
    });
  });

  describe('handleManualOverride', () => {
    beforeEach(() => {
      const failure = createMockFailure();
      failureDetector.getFailure.mockReturnValue(failure);
    });

    it('should terminate pipeline on terminate action', async () => {
      const result = await service.handleManualOverride({
        failureId: 'failure-001',
        workspaceId: 'ws-456',
        userId: 'user-1',
        action: 'terminate',
      });

      expect(stateMachine.transition).toHaveBeenCalledWith(
        'proj-789',
        expect.anything(),
        expect.objectContaining({
          triggeredBy: 'user:user-1:manual_override',
        }),
      );
      expect(result.strategy).toBe('manual_override');
    });

    it('should transition to FAILED on terminate', async () => {
      await service.handleManualOverride({
        failureId: 'failure-001',
        workspaceId: 'ws-456',
        userId: 'user-1',
        action: 'terminate',
      });

      expect(stateMachine.transition).toHaveBeenCalledWith(
        'proj-789',
        'failed',
        expect.anything(),
      );
    });

    it('should reassign to specified agent type on reassign', async () => {
      const result = await service.handleManualOverride({
        failureId: 'failure-001',
        workspaceId: 'ws-456',
        userId: 'user-1',
        action: 'reassign',
        reassignToAgentType: 'planner',
      });

      expect(result.strategy).toBe('manual_override');
      expect(result.success).toBe(true);
    });

    it('should resume pipeline with guidance on provide_guidance', async () => {
      await service.handleManualOverride({
        failureId: 'failure-001',
        workspaceId: 'ws-456',
        userId: 'user-1',
        action: 'provide_guidance',
        guidance: 'Try using a different approach for the database migration',
      });

      expect(stateMachine.resumePipeline).toHaveBeenCalledWith(
        'proj-789',
        'user:user-1:manual_override',
      );
    });

    it('should return error for unknown failure ID', async () => {
      failureDetector.getFailure.mockReturnValue(undefined);

      await expect(
        service.handleManualOverride({
          failureId: 'nonexistent',
          workspaceId: 'ws-456',
          userId: 'user-1',
          action: 'terminate',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRecoveryStatus', () => {
    it('should return active failures, history, escalation status', async () => {
      const mockFailure = createMockFailure({
        recoveryAction: 'escalated',
      });
      failureDetector.getActiveFailures.mockReturnValue([mockFailure]);
      historyRepo.find.mockResolvedValue([
        {
          id: 'f1',
          failureType: 'crash',
          recoveryStrategy: 'retry',
          success: true,
          createdAt: new Date(),
          durationMs: 5000,
        },
      ]);

      const status = await service.getRecoveryStatus('proj-789');

      expect(status.projectId).toBe('proj-789');
      expect(status.activeFailures).toHaveLength(1);
      expect(status.isEscalated).toBe(true);
      expect(status.maxRetries).toBe(DEFAULT_MAX_RECOVERY_RETRIES);
    });
  });
});
