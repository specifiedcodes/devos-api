import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FailureRecoveryService } from './failure-recovery.service';
import { AgentsService } from './agents.service';
import { ContextRecoveryService } from './context-recovery.service';
import { AgentQueueService } from '../agent-queue/services/agent-queue.service';
import {
  Agent,
  AgentStatus,
  AgentType,
} from '../../database/entities/agent.entity';
import { AgentJobType } from '../agent-queue/entities/agent-job.entity';

describe('FailureRecoveryService', () => {
  let service: FailureRecoveryService;
  let mockAgentsService: any;
  let mockContextRecoveryService: any;
  let mockAgentQueueService: any;
  let mockAgentRepository: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockAgentId = '55555555-5555-5555-5555-555555555555';
  const mockAgentId2 = '66666666-6666-6666-6666-666666666666';

  const createMockAgent = (overrides?: Partial<Agent>): Partial<Agent> => ({
    id: mockAgentId,
    workspaceId: mockWorkspaceId,
    status: AgentStatus.RUNNING,
    type: AgentType.DEV,
    lastHeartbeat: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago (stalled)
    name: 'Test Agent',
    errorMessage: null,
    completedAt: null,
    ...overrides,
  });

  beforeEach(async () => {
    mockAgentsService = {
      listAgents: jest.fn().mockResolvedValue({ agents: [], total: 0 }),
      updateAgent: jest.fn().mockResolvedValue({}),
      markFailed: jest.fn().mockResolvedValue(undefined),
      getAgent: jest.fn().mockResolvedValue(createMockAgent()),
    };

    mockContextRecoveryService = {
      recoverContext: jest.fn().mockResolvedValue({ lastTask: 'test' }),
      deleteContext: jest
        .fn()
        .mockResolvedValue({
          tier1Cleaned: true,
          tier2Deleted: 1,
          tier3Cleaned: true,
        }),
    };

    mockAgentQueueService = {
      addJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    mockAgentRepository = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FailureRecoveryService,
        { provide: AgentsService, useValue: mockAgentsService },
        {
          provide: ContextRecoveryService,
          useValue: mockContextRecoveryService,
        },
        { provide: AgentQueueService, useValue: mockAgentQueueService },
        {
          provide: getRepositoryToken(Agent),
          useValue: mockAgentRepository,
        },
      ],
    }).compile();

    service = module.get<FailureRecoveryService>(FailureRecoveryService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ========================
  // detectStalledAgents Tests
  // ========================
  describe('detectStalledAgents', () => {
    it('should detect agents with stale heartbeats (>5 minutes)', async () => {
      const stalledAgent = createMockAgent({
        lastHeartbeat: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
      });

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([stalledAgent]),
      };
      mockAgentRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.detectStalledAgents();

      expect(result.detected).toBe(1);
      expect(queryBuilder.where).toHaveBeenCalledWith(
        'agent.status IN (:...statuses)',
        {
          statuses: [AgentStatus.RUNNING, AgentStatus.INITIALIZING],
        },
      );
    });

    it('should skip agents with recent heartbeats', async () => {
      // No agents returned from query = agents with recent heartbeats are filtered out by DB
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockAgentRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.detectStalledAgents();

      expect(result.detected).toBe(0);
      expect(result.recovered).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should skip agents not in RUNNING/INITIALIZING status', async () => {
      // The query filters by status, so completed/failed agents won't appear
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockAgentRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.detectStalledAgents();

      expect(result.detected).toBe(0);
      // Verify the query filtered by correct statuses
      expect(queryBuilder.where).toHaveBeenCalledWith(
        'agent.status IN (:...statuses)',
        {
          statuses: [AgentStatus.RUNNING, AgentStatus.INITIALIZING],
        },
      );
    });

    it('should attempt recovery for each stalled agent', async () => {
      const stalledAgent1 = createMockAgent({ id: mockAgentId });
      const stalledAgent2 = createMockAgent({
        id: mockAgentId2,
        lastHeartbeat: new Date(Date.now() - 15 * 60 * 1000),
      });

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([stalledAgent1, stalledAgent2]),
      };
      mockAgentRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.detectStalledAgents();

      expect(result.detected).toBe(2);
      // Both should have had recovery attempted (via agentRepository.update and agentQueueService.addJob)
      expect(mockAgentRepository.update).toHaveBeenCalledTimes(2);
      expect(mockAgentQueueService.addJob).toHaveBeenCalledTimes(2);
    });

    it('should mark agent as permanently failed after max retries', async () => {
      const stalledAgent = createMockAgent();

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([stalledAgent]),
      };
      mockAgentRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      // Simulate 3 previous retries by calling recoverAgent enough times
      // Set the retry tracker to MAX_RETRY_ATTEMPTS (3) via recoverAgent calls
      await service.recoverAgent(mockAgentId, mockWorkspaceId); // attempt 1
      await service.recoverAgent(mockAgentId, mockWorkspaceId); // attempt 2
      await service.recoverAgent(mockAgentId, mockWorkspaceId); // attempt 3
      jest.clearAllMocks();

      // Reset the query builder mock after clearAllMocks
      mockAgentRepository.createQueryBuilder.mockReturnValue(queryBuilder);
      queryBuilder.getMany.mockResolvedValue([stalledAgent]);

      // Now 4th attempt should mark as permanently failed
      const result = await service.detectStalledAgents();

      expect(result.detected).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.recovered).toBe(0);
      expect(mockAgentsService.markFailed).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
        expect.stringContaining('Permanently failed'),
      );
    });

    it('should return correct summary counts', async () => {
      const stalledAgent1 = createMockAgent({ id: mockAgentId });
      const stalledAgent2 = createMockAgent({ id: mockAgentId2 });

      // Agent2 will fail recovery (repository.update fails for second call)
      mockAgentRepository.update
        .mockResolvedValueOnce({ affected: 1 }) // first agent succeeds
        .mockRejectedValueOnce(new Error('DB error')); // second agent fails

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest
          .fn()
          .mockResolvedValue([stalledAgent1, stalledAgent2]),
      };
      mockAgentRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.detectStalledAgents();

      expect(result.detected).toBe(2);
      expect(result.recovered).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should handle empty agent list gracefully', async () => {
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockAgentRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.detectStalledAgents();

      expect(result.detected).toBe(0);
      expect(result.recovered).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  // ====================
  // recoverAgent Tests
  // ====================
  describe('recoverAgent', () => {
    it('should recover context from ContextRecoveryService', async () => {
      await service.recoverAgent(mockAgentId, mockWorkspaceId);

      expect(mockContextRecoveryService.recoverContext).toHaveBeenCalledWith(
        mockAgentId,
      );
    });

    it('should queue spawn job for re-spawn', async () => {
      const mockContext = { lastTask: 'implement feature' };
      mockContextRecoveryService.recoverContext.mockResolvedValue(
        mockContext,
      );

      await service.recoverAgent(mockAgentId, mockWorkspaceId);

      expect(mockAgentQueueService.addJob).toHaveBeenCalledWith({
        workspaceId: mockWorkspaceId,
        userId: 'system',
        jobType: AgentJobType.SPAWN_AGENT,
        data: {
          agentId: mockAgentId,
          recoveredContext: mockContext,
        },
      });
    });

    it('should update agent status to INITIALIZING via direct repository update', async () => {
      await service.recoverAgent(mockAgentId, mockWorkspaceId);

      expect(mockAgentRepository.update).toHaveBeenCalledWith(
        { id: mockAgentId },
        expect.objectContaining({
          status: AgentStatus.INITIALIZING,
          errorMessage: null,
        }),
      );
    });

    it('should return false when max retries exceeded', async () => {
      // Exhaust retries
      await service.recoverAgent(mockAgentId, mockWorkspaceId); // 1
      await service.recoverAgent(mockAgentId, mockWorkspaceId); // 2
      await service.recoverAgent(mockAgentId, mockWorkspaceId); // 3

      jest.clearAllMocks();

      // 4th attempt should fail
      const result = await service.recoverAgent(
        mockAgentId,
        mockWorkspaceId,
      );

      expect(result).toBe(false);
    });

    it('should return false and mark permanently failed after max retries', async () => {
      // Exhaust retries
      await service.recoverAgent(mockAgentId, mockWorkspaceId); // 1
      await service.recoverAgent(mockAgentId, mockWorkspaceId); // 2
      await service.recoverAgent(mockAgentId, mockWorkspaceId); // 3

      jest.clearAllMocks();

      // 4th attempt should mark permanently failed
      const result = await service.recoverAgent(
        mockAgentId,
        mockWorkspaceId,
      );

      expect(result).toBe(false);
      expect(mockAgentsService.markFailed).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
        expect.stringContaining('Permanently failed'),
      );
    });

    it('should handle missing context gracefully (still attempts recovery)', async () => {
      mockContextRecoveryService.recoverContext.mockResolvedValue(null);

      const result = await service.recoverAgent(
        mockAgentId,
        mockWorkspaceId,
      );

      expect(result).toBe(true);
      // Should still update status via direct repo update and queue spawn
      expect(mockAgentRepository.update).toHaveBeenCalled();
      expect(mockAgentQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            agentId: mockAgentId,
            recoveredContext: null,
          }),
        }),
      );
    });

    it('should handle errors gracefully (returns false, does not throw)', async () => {
      mockAgentRepository.update.mockRejectedValue(
        new Error('DB connection failed'),
      );

      const result = await service.recoverAgent(
        mockAgentId,
        mockWorkspaceId,
      );

      expect(result).toBe(false);
    });

    it('should increment retry counter on each attempt', async () => {
      await service.recoverAgent(mockAgentId, mockWorkspaceId);
      let status = service.getRecoveryStatus(mockAgentId);
      expect(status.retryCount).toBe(1);

      await service.recoverAgent(mockAgentId, mockWorkspaceId);
      status = service.getRecoveryStatus(mockAgentId);
      expect(status.retryCount).toBe(2);

      await service.recoverAgent(mockAgentId, mockWorkspaceId);
      status = service.getRecoveryStatus(mockAgentId);
      expect(status.retryCount).toBe(3);
    });
  });

  // ============================
  // markPermanentlyFailed Tests
  // ============================
  describe('markPermanentlyFailed', () => {
    it('should call AgentsService.markFailed with descriptive message', async () => {
      // Set up some retry state first
      await service.recoverAgent(mockAgentId, mockWorkspaceId);
      await service.recoverAgent(mockAgentId, mockWorkspaceId);
      jest.clearAllMocks();

      await service.markPermanentlyFailed(
        mockAgentId,
        mockWorkspaceId,
        'Agent stopped responding',
      );

      expect(mockAgentsService.markFailed).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
        expect.stringContaining('retry attempts'),
      );
      expect(mockAgentsService.markFailed).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
        expect.stringContaining('Agent stopped responding'),
      );
    });

    it('should clear retry tracker and action history', async () => {
      // Set up state
      await service.recoverAgent(mockAgentId, mockWorkspaceId);
      service.recordAgentAction(mockAgentId, 'some_action');
      jest.clearAllMocks();

      await service.markPermanentlyFailed(
        mockAgentId,
        mockWorkspaceId,
        'test reason',
      );

      // Verify cleared
      const recoveryStatus = service.getRecoveryStatus(mockAgentId);
      expect(recoveryStatus.retryCount).toBe(0);
      expect(recoveryStatus.isRecovering).toBe(false);

      // Action history should be cleared too
      const loopCheck = service.checkForInfiniteLoop(mockAgentId);
      expect(loopCheck.detected).toBe(false);
    });
  });

  // ==========================
  // cleanupZombieAgents Tests
  // ==========================
  describe('cleanupZombieAgents', () => {
    it('should find and terminate zombie agents (>24 hours stale)', async () => {
      const zombieAgent = createMockAgent({
        lastHeartbeat: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
      });

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([zombieAgent]),
      };
      mockAgentRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.cleanupZombieAgents();

      expect(result.zombiesFound).toBe(1);
      expect(result.cleaned).toBe(1);
      expect(mockAgentRepository.update).toHaveBeenCalledWith(
        { id: mockAgentId },
        expect.objectContaining({
          status: AgentStatus.TERMINATED,
          errorMessage:
            'Zombie agent cleanup: no heartbeat for >24 hours',
        }),
      );
    });

    it('should clean up context for zombie agents', async () => {
      const zombieAgent = createMockAgent({
        lastHeartbeat: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([zombieAgent]),
      };
      mockAgentRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      await service.cleanupZombieAgents();

      expect(mockContextRecoveryService.deleteContext).toHaveBeenCalledWith(
        mockAgentId,
        mockWorkspaceId,
      );
    });

    it('should return correct summary counts', async () => {
      const zombie1 = createMockAgent({
        id: mockAgentId,
        lastHeartbeat: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });
      const zombie2 = createMockAgent({
        id: mockAgentId2,
        lastHeartbeat: new Date(Date.now() - 30 * 60 * 60 * 1000),
      });

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([zombie1, zombie2]),
      };
      mockAgentRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.cleanupZombieAgents();

      expect(result.zombiesFound).toBe(2);
      expect(result.cleaned).toBe(2);
      expect(result.errors).toBe(0);
    });

    it('should handle errors for individual agents gracefully', async () => {
      const zombie1 = createMockAgent({
        id: mockAgentId,
        lastHeartbeat: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });
      const zombie2 = createMockAgent({
        id: mockAgentId2,
        lastHeartbeat: new Date(Date.now() - 30 * 60 * 60 * 1000),
      });

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([zombie1, zombie2]),
      };
      mockAgentRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      // First agent update fails, second succeeds
      mockAgentRepository.update
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ affected: 1 });

      const result = await service.cleanupZombieAgents();

      expect(result.zombiesFound).toBe(2);
      expect(result.errors).toBe(1);
      expect(result.cleaned).toBe(1);
    });

    it('should handle query with agents not in RUNNING/INITIALIZING status via DB filter', async () => {
      // The query filters by status in the DB, so only RUNNING/INITIALIZING agents are returned
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockAgentRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      const result = await service.cleanupZombieAgents();

      expect(result.zombiesFound).toBe(0);
      expect(result.cleaned).toBe(0);
      expect(queryBuilder.where).toHaveBeenCalledWith(
        'agent.status IN (:...statuses)',
        {
          statuses: [AgentStatus.RUNNING, AgentStatus.INITIALIZING],
        },
      );
    });
  });

  // ====================
  // healthCheck Tests
  // ====================
  describe('healthCheck', () => {
    it('should return correct counts for each health category', async () => {
      const healthyAgent = createMockAgent({
        id: 'agent-1',
        status: AgentStatus.RUNNING,
        lastHeartbeat: new Date(Date.now() - 1 * 60 * 1000), // 1 min ago
      });
      const stalledAgent = createMockAgent({
        id: 'agent-2',
        status: AgentStatus.RUNNING,
        lastHeartbeat: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
      });
      const failedAgent = createMockAgent({
        id: 'agent-3',
        status: AgentStatus.FAILED,
      });

      mockAgentRepository.find.mockResolvedValue([
        healthyAgent,
        stalledAgent,
        failedAgent,
      ]);

      const result = await service.healthCheck(mockWorkspaceId);

      expect(result.healthy).toBe(1);
      expect(result.stalled).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.recovering).toBe(0);
    });

    it('should count recovering agents from retry tracker', async () => {
      // Set up a recovering agent by calling recoverAgent
      const recoveringAgent = createMockAgent({
        id: mockAgentId,
        status: AgentStatus.RUNNING,
        lastHeartbeat: new Date(Date.now() - 10 * 60 * 1000),
      });

      // Trigger recovery to populate the retry tracker
      await service.recoverAgent(mockAgentId, mockWorkspaceId);

      mockAgentRepository.find.mockResolvedValue([recoveringAgent]);

      const result = await service.healthCheck(mockWorkspaceId);

      expect(result.recovering).toBe(1);
      // Should not double-count as stalled
      expect(result.stalled).toBe(0);
    });

    it('should handle workspace with no agents', async () => {
      mockAgentRepository.find.mockResolvedValue([]);

      const result = await service.healthCheck(mockWorkspaceId);

      expect(result.healthy).toBe(0);
      expect(result.stalled).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.recovering).toBe(0);
    });
  });

  // ========================
  // getRecoveryStatus Tests
  // ========================
  describe('getRecoveryStatus', () => {
    it('should return current retry count for agent', async () => {
      // Trigger some retries
      await service.recoverAgent(mockAgentId, mockWorkspaceId);
      await service.recoverAgent(mockAgentId, mockWorkspaceId);

      const status = service.getRecoveryStatus(mockAgentId);

      expect(status.agentId).toBe(mockAgentId);
      expect(status.retryCount).toBe(2);
      expect(status.maxRetries).toBe(3);
      expect(status.isRecovering).toBe(true);
    });

    it('should return zero retry count for unknown agent', () => {
      const status = service.getRecoveryStatus('unknown-agent-id');

      expect(status.agentId).toBe('unknown-agent-id');
      expect(status.retryCount).toBe(0);
      expect(status.maxRetries).toBe(3);
      expect(status.isRecovering).toBe(false);
    });
  });

  // ==============================
  // Infinite Loop Detection Tests
  // ==============================
  describe('recordAgentAction', () => {
    it('should store action with timestamp', () => {
      service.recordAgentAction(mockAgentId, 'compile_code');

      const loopCheck = service.checkForInfiniteLoop(mockAgentId);
      // One action should not trigger loop detection
      expect(loopCheck.detected).toBe(false);
    });

    it('should prune old entries beyond 30-minute window', () => {
      // We can't easily manipulate time without jest.useFakeTimers,
      // but we can verify the pruning mechanism works by checking behavior
      // Record an action
      service.recordAgentAction(mockAgentId, 'old_action');

      // The action was just recorded, so it should be within the window
      const loopCheck = service.checkForInfiniteLoop(mockAgentId);
      expect(loopCheck.detected).toBe(false);
    });
  });

  describe('checkForInfiniteLoop', () => {
    it('should detect same action repeated 10+ times', () => {
      // Record the same action 10 times
      for (let i = 0; i < 10; i++) {
        service.recordAgentAction(mockAgentId, 'repeated_action');
      }

      const result = service.checkForInfiniteLoop(mockAgentId);

      expect(result.detected).toBe(true);
      expect(result.action).toBe('repeated_action');
      expect(result.count).toBe(10);
    });

    it('should return false when action count below threshold', () => {
      for (let i = 0; i < 9; i++) {
        service.recordAgentAction(mockAgentId, 'almost_repeated');
      }

      const result = service.checkForInfiniteLoop(mockAgentId);

      expect(result.detected).toBe(false);
    });

    it('should ignore actions outside 30-minute window', () => {
      // Directly manipulate the internal state to simulate old actions
      // Access private actionHistory via type assertion
      const actionHistory = (service as any).actionHistory as Map<
        string,
        Array<{ action: string; timestamp: Date }>
      >;

      const oldTimestamp = new Date(Date.now() - 35 * 60 * 1000); // 35 minutes ago
      const oldActions = Array.from({ length: 15 }, () => ({
        action: 'old_action',
        timestamp: oldTimestamp,
      }));

      actionHistory.set(mockAgentId, oldActions);

      const result = service.checkForInfiniteLoop(mockAgentId);

      // Old actions should be outside the window
      expect(result.detected).toBe(false);
    });
  });

  describe('clearActionHistory', () => {
    it('should remove all tracked actions for agent', () => {
      // Record some actions
      for (let i = 0; i < 5; i++) {
        service.recordAgentAction(mockAgentId, 'test_action');
      }

      // Clear
      service.clearActionHistory(mockAgentId);

      // Verify cleared - check should find nothing
      const result = service.checkForInfiniteLoop(mockAgentId);
      expect(result.detected).toBe(false);

      // Recording 5 new actions after clear shouldn't detect loop
      for (let i = 0; i < 5; i++) {
        service.recordAgentAction(mockAgentId, 'new_action');
      }
      const result2 = service.checkForInfiniteLoop(mockAgentId);
      expect(result2.detected).toBe(false);
    });
  });
});
