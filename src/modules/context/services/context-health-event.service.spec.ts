/**
 * ContextHealthEventService Tests
 * Story 12.5: Context Health Indicators UI
 *
 * TDD: Tests written first, then implementation verified.
 * Tests health transition detection and event emission.
 */

// Mock ESM modules that cause Jest transform issues
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-v4'),
}));
jest.mock('neo4j-driver', () => ({
  default: {
    driver: jest.fn(),
  },
  auth: { basic: jest.fn() },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContextHealthEventService, CONTEXT_HEALTH_CHANGED_EVENT } from './context-health-event.service';
import { ContextHealthService } from './context-health.service';
import { ContextHealth } from '../interfaces/context-health.interfaces';

describe('ContextHealthEventService', () => {
  let service: ContextHealthEventService;
  let mockEventEmitter: any;
  let mockContextHealthService: any;

  const mockProjectId = 'proj-uuid-123';
  const mockWorkspaceId = 'ws-uuid-456';
  const mockWorkspacePath = '/workspaces/default/proj-uuid-123';

  const buildMockHealth = (
    overallHealth: 'healthy' | 'degraded' | 'critical',
    issues: string[] = [],
  ): ContextHealth => ({
    projectId: mockProjectId,
    workspaceId: mockWorkspaceId,
    tier1: { valid: true, exists: true, lastModified: null, stale: false, sizeBytes: 100, error: null },
    tier2: { valid: true, exists: true, lastModified: null, stale: false, sizeBytes: 200, error: null },
    tier3: { valid: true, exists: true, lastModified: null, stale: false, sizeBytes: 300, error: null },
    graphitiConnected: true,
    graphitiEpisodeCount: 100,
    lastRecoveryTime: 0,
    recoveryCount: 0,
    lastRefreshAt: null,
    overallHealth,
    issues,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    mockEventEmitter = {
      emit: jest.fn(),
    };

    mockContextHealthService = {
      assessHealth: jest.fn().mockResolvedValue(buildMockHealth('healthy')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextHealthEventService,
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ContextHealthService, useValue: mockContextHealthService },
      ],
    }).compile();

    service = module.get<ContextHealthEventService>(ContextHealthEventService);
  });

  describe('checkAndEmitHealthChange', () => {
    it('should emit context:health_changed when health transitions from healthy to degraded', async () => {
      // First call: establish baseline as healthy
      mockContextHealthService.assessHealth.mockResolvedValue(buildMockHealth('healthy'));
      await service.checkAndEmitHealthChange(mockProjectId, mockWorkspaceId, mockWorkspacePath);

      // Second call: transition to degraded
      mockContextHealthService.assessHealth.mockResolvedValue(
        buildMockHealth('degraded', ['Graphiti/Neo4j is disconnected']),
      );
      await service.checkAndEmitHealthChange(mockProjectId, mockWorkspaceId, mockWorkspacePath);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        CONTEXT_HEALTH_CHANGED_EVENT,
        expect.objectContaining({
          projectId: mockProjectId,
          workspaceId: mockWorkspaceId,
          previousHealth: 'healthy',
          currentHealth: 'degraded',
          issues: ['Graphiti/Neo4j is disconnected'],
          timestamp: expect.any(String),
        }),
      );
    });

    it('should emit context:health_changed when health transitions from degraded to critical', async () => {
      // Establish baseline as degraded
      mockContextHealthService.assessHealth.mockResolvedValue(buildMockHealth('degraded'));
      await service.checkAndEmitHealthChange(mockProjectId, mockWorkspaceId, mockWorkspacePath);

      // Transition to critical
      mockContextHealthService.assessHealth.mockResolvedValue(
        buildMockHealth('critical', ['Tier 1 missing', 'Tier 2 missing']),
      );
      await service.checkAndEmitHealthChange(mockProjectId, mockWorkspaceId, mockWorkspacePath);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        CONTEXT_HEALTH_CHANGED_EVENT,
        expect.objectContaining({
          previousHealth: 'degraded',
          currentHealth: 'critical',
        }),
      );
    });

    it('should emit context:health_changed when health transitions from critical to healthy', async () => {
      // Establish baseline as critical
      mockContextHealthService.assessHealth.mockResolvedValue(buildMockHealth('critical'));
      await service.checkAndEmitHealthChange(mockProjectId, mockWorkspaceId, mockWorkspacePath);

      // Transition to healthy
      mockContextHealthService.assessHealth.mockResolvedValue(buildMockHealth('healthy'));
      await service.checkAndEmitHealthChange(mockProjectId, mockWorkspaceId, mockWorkspacePath);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        CONTEXT_HEALTH_CHANGED_EVENT,
        expect.objectContaining({
          previousHealth: 'critical',
          currentHealth: 'healthy',
        }),
      );
    });

    it('should not emit when health status remains the same', async () => {
      // Two calls with same health
      mockContextHealthService.assessHealth.mockResolvedValue(buildMockHealth('healthy'));
      await service.checkAndEmitHealthChange(mockProjectId, mockWorkspaceId, mockWorkspacePath);
      await service.checkAndEmitHealthChange(mockProjectId, mockWorkspaceId, mockWorkspacePath);

      // Should not emit (no transition, same status)
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should track previous health state per project', async () => {
      const otherProjectId = 'other-proj-uuid';

      // Project 1: healthy
      mockContextHealthService.assessHealth.mockResolvedValue(buildMockHealth('healthy'));
      await service.checkAndEmitHealthChange(mockProjectId, mockWorkspaceId, mockWorkspacePath);

      // Project 2: degraded
      mockContextHealthService.assessHealth.mockResolvedValue(buildMockHealth('degraded'));
      await service.checkAndEmitHealthChange(otherProjectId, mockWorkspaceId, '/other/path');

      // Project 1: transition to degraded (should emit)
      mockContextHealthService.assessHealth.mockResolvedValue(buildMockHealth('degraded'));
      await service.checkAndEmitHealthChange(mockProjectId, mockWorkspaceId, mockWorkspacePath);

      // Project 2: remain degraded (should not emit)
      mockContextHealthService.assessHealth.mockResolvedValue(buildMockHealth('degraded'));
      await service.checkAndEmitHealthChange(otherProjectId, mockWorkspaceId, '/other/path');

      // Only one emit: project 1 healthy -> degraded
      expect(mockEventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        CONTEXT_HEALTH_CHANGED_EVENT,
        expect.objectContaining({
          projectId: mockProjectId,
          previousHealth: 'healthy',
          currentHealth: 'degraded',
        }),
      );
    });

    it('should include issues array in emitted event', async () => {
      const issues = ['Tier 1: File is stale', 'Graphiti/Neo4j is disconnected'];

      // Establish baseline
      mockContextHealthService.assessHealth.mockResolvedValue(buildMockHealth('healthy'));
      await service.checkAndEmitHealthChange(mockProjectId, mockWorkspaceId, mockWorkspacePath);

      // Transition with issues
      mockContextHealthService.assessHealth.mockResolvedValue(
        buildMockHealth('critical', issues),
      );
      await service.checkAndEmitHealthChange(mockProjectId, mockWorkspaceId, mockWorkspacePath);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        CONTEXT_HEALTH_CHANGED_EVENT,
        expect.objectContaining({
          issues,
        }),
      );
    });

    it('should not throw when assessHealth fails', async () => {
      mockContextHealthService.assessHealth.mockRejectedValue(new Error('Service error'));

      // Should not throw
      await expect(
        service.checkAndEmitHealthChange(mockProjectId, mockWorkspaceId, mockWorkspacePath),
      ).resolves.not.toThrow();

      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should not emit on first call (no previous state to compare)', async () => {
      mockContextHealthService.assessHealth.mockResolvedValue(buildMockHealth('critical'));
      await service.checkAndEmitHealthChange(mockProjectId, mockWorkspaceId, mockWorkspacePath);

      // First call should not emit (no previous state)
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
