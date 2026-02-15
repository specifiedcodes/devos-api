/**
 * ContextGenerationTriggerService Tests
 * Story 12.4: Three-Tier Context Recovery Enhancement
 *
 * TDD: Tests written first, then implementation verified.
 * Tests event-driven triggers, debounce, and conditional tier updates.
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
import { ConfigService } from '@nestjs/config';
import { ContextGenerationTriggerService } from './context-generation-trigger.service';
import { ContextGenerationService } from './context-generation.service';
import { PipelineState, PipelineStateEvent } from '../../orchestrator/interfaces/pipeline.interfaces';

describe('ContextGenerationTriggerService', () => {
  let service: ContextGenerationTriggerService;
  let mockContextGenerationService: any;
  let mockConfigService: any;

  const mockProjectId = 'proj-uuid-123';
  const mockWorkspaceId = 'ws-uuid-456';

  const baseEvent: PipelineStateEvent = {
    type: 'pipeline:state_changed',
    projectId: mockProjectId,
    workspaceId: mockWorkspaceId,
    previousState: PipelineState.PLANNING,
    newState: PipelineState.IMPLEMENTING,
    agentId: 'agent-1',
    storyId: '12.4',
    timestamp: new Date(),
    metadata: {},
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockContextGenerationService = {
      generateDevOSContext: jest.fn().mockResolvedValue({
        version: '1.0',
        project_id: mockProjectId,
        workspace_id: mockWorkspaceId,
        phase: 'implementation',
        current_sprint: 5,
        active_agents: [],
        next_actions: [],
        blockers: [],
        last_updated: new Date().toISOString(),
      }),
      writeDevOSContext: jest.fn().mockResolvedValue(undefined),
      generateDevOSMd: jest.fn().mockResolvedValue('# DEVOS'),
      writeDevOSMd: jest.fn().mockResolvedValue(undefined),
      appendProjectState: jest.fn().mockResolvedValue(undefined),
      refreshAllTiers: jest.fn().mockResolvedValue({
        tier1Updated: true,
        tier2Updated: true,
        tier3Updated: false,
        refreshDurationMs: 50,
      }),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          CONTEXT_GENERATION_ENABLED: 'true',
          CLI_WORKSPACE_BASE_PATH: '/workspaces',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextGenerationTriggerService,
        {
          provide: ContextGenerationService,
          useValue: mockContextGenerationService,
        },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ContextGenerationTriggerService>(
      ContextGenerationTriggerService,
    );
  });

  describe('handleStateChange', () => {
    it('should listen for pipeline:state_changed events', () => {
      // Verify the method exists and is decorated properly
      expect(service.handleStateChange).toBeDefined();
      expect(typeof service.handleStateChange).toBe('function');
    });

    it('should trigger Tier 1 update on any story status change', async () => {
      await service.handleStateChange(baseEvent);

      expect(
        mockContextGenerationService.generateDevOSContext,
      ).toHaveBeenCalledWith(mockProjectId, mockWorkspaceId);
      expect(
        mockContextGenerationService.writeDevOSContext,
      ).toHaveBeenCalled();
    });

    it('should trigger Tier 1 + Tier 3 on story completion (status -> done)', async () => {
      const completionEvent: PipelineStateEvent = {
        ...baseEvent,
        newState: PipelineState.COMPLETE,
        metadata: {
          storyTitle: 'Three-Tier Context Recovery Enhancement',
          agentType: 'dev',
          decisions: ['Used EventEmitter2'],
          filesChanged: 15,
          testsPassed: 92,
          memoryEpisodeIds: ['ep-1'],
        },
      };

      await service.handleStateChange(completionEvent);

      // Should update Tier 1
      expect(
        mockContextGenerationService.generateDevOSContext,
      ).toHaveBeenCalled();
      expect(
        mockContextGenerationService.writeDevOSContext,
      ).toHaveBeenCalled();

      // Should append Tier 3
      expect(
        mockContextGenerationService.appendProjectState,
      ).toHaveBeenCalled();
    });

    it('should trigger all three tiers on epic completion', async () => {
      const epicEvent: PipelineStateEvent = {
        ...baseEvent,
        newState: PipelineState.COMPLETE,
        metadata: {
          epicCompletion: true,
          projectName: 'DevOS',
          storyTitle: 'Final story',
        },
      };

      await service.handleStateChange(epicEvent);

      expect(
        mockContextGenerationService.refreshAllTiers,
      ).toHaveBeenCalled();
    });

    it('should not trigger when CONTEXT_GENERATION_ENABLED=false', async () => {
      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'CONTEXT_GENERATION_ENABLED') return 'false';
          return defaultValue;
        },
      );

      await service.handleStateChange(baseEvent);

      expect(
        mockContextGenerationService.generateDevOSContext,
      ).not.toHaveBeenCalled();
      expect(
        mockContextGenerationService.writeDevOSContext,
      ).not.toHaveBeenCalled();
    });

    it('should handle event processing errors gracefully (logs, does not throw)', async () => {
      mockContextGenerationService.generateDevOSContext.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      // Should not throw
      await expect(
        service.handleStateChange(baseEvent),
      ).resolves.toBeUndefined();
    });

    it('should debounce rapid successive events for same project (100ms window)', async () => {
      // First event should be processed
      await service.handleStateChange(baseEvent);
      expect(
        mockContextGenerationService.generateDevOSContext,
      ).toHaveBeenCalledTimes(1);

      // Second event within 100ms should be debounced
      await service.handleStateChange(baseEvent);
      expect(
        mockContextGenerationService.generateDevOSContext,
      ).toHaveBeenCalledTimes(1); // Still 1 (debounced)
    });

    it('should process events for different projects independently', async () => {
      const event1 = { ...baseEvent, projectId: 'proj-1' };
      const event2 = { ...baseEvent, projectId: 'proj-2' };

      await service.handleStateChange(event1);
      await service.handleStateChange(event2);

      // Both should be processed since they are for different projects
      expect(
        mockContextGenerationService.generateDevOSContext,
      ).toHaveBeenCalledTimes(2);
    });

    it('should build story entry with metadata for Tier 3 on completion', async () => {
      const completionEvent: PipelineStateEvent = {
        ...baseEvent,
        newState: PipelineState.COMPLETE,
        storyId: '12.4',
        metadata: {
          storyTitle: 'Three-Tier Context Recovery Enhancement',
          agentType: 'dev',
          decisions: ['Used EventEmitter2', 'Created separate module'],
          issues: [],
          filesChanged: 15,
          testsPassed: 92,
          memoryEpisodeIds: ['ep-1', 'ep-2'],
        },
      };

      await service.handleStateChange(completionEvent);

      const appendCall =
        mockContextGenerationService.appendProjectState.mock.calls[0];
      const entry = appendCall[3]; // 4th argument is the entry

      expect(entry.storyId).toBe('12.4');
      expect(entry.title).toBe('Three-Tier Context Recovery Enhancement');
      expect(entry.agentType).toBe('dev');
      expect(entry.decisions).toEqual([
        'Used EventEmitter2',
        'Created separate module',
      ]);
      expect(entry.filesChanged).toBe(15);
      expect(entry.testsPassed).toBe(92);
      expect(entry.memoryEpisodeIds).toEqual(['ep-1', 'ep-2']);
    });
  });
});
