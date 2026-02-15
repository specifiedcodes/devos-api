/**
 * ContextController Tests
 * Story 12.4: Three-Tier Context Recovery Enhancement
 * Story 12.5: Context Health Indicators UI
 *
 * TDD: Tests written first, then implementation verified.
 * Tests the POST /api/v1/context/refresh/:projectId endpoint.
 * Tests the GET /api/v1/context/health/:projectId endpoint (Story 12.5).
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
import { ContextController } from './context.controller';
import { ContextGenerationService } from './services/context-generation.service';
import { ContextHealthService } from './services/context-health.service';
import { ContextRefreshResult } from './interfaces/context-generation.interfaces';
import { ContextHealth } from './interfaces/context-health.interfaces';

describe('ContextController', () => {
  let controller: ContextController;
  let mockContextGenerationService: any;
  let mockContextHealthService: any;
  let mockConfigService: any;

  const mockProjectId = 'proj-uuid-123';

  const mockRefreshResult: ContextRefreshResult = {
    tier1Updated: true,
    tier2Updated: true,
    tier3Updated: false,
    refreshDurationMs: 42,
  };

  const mockHealthResult: ContextHealth = {
    projectId: mockProjectId,
    workspaceId: 'default',
    tier1: { valid: true, exists: true, lastModified: '2026-02-15T10:00:00Z', stale: false, sizeBytes: 500, error: null },
    tier2: { valid: true, exists: true, lastModified: '2026-02-15T10:00:00Z', stale: false, sizeBytes: 1000, error: null },
    tier3: { valid: true, exists: true, lastModified: '2026-02-15T10:00:00Z', stale: false, sizeBytes: 2000, error: null },
    graphitiConnected: true,
    graphitiEpisodeCount: 100,
    lastRecoveryTime: 0,
    recoveryCount: 0,
    lastRefreshAt: '2026-02-15T10:00:00Z',
    overallHealth: 'healthy',
    issues: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockContextGenerationService = {
      refreshAllTiers: jest.fn().mockResolvedValue(mockRefreshResult),
    };

    mockContextHealthService = {
      assessHealth: jest.fn().mockResolvedValue(mockHealthResult),
      invalidateCache: jest.fn().mockResolvedValue(undefined),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          CLI_WORKSPACE_BASE_PATH: '/workspaces',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContextController],
      providers: [
        {
          provide: ContextGenerationService,
          useValue: mockContextGenerationService,
        },
        {
          provide: ContextHealthService,
          useValue: mockContextHealthService,
        },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<ContextController>(ContextController);
  });

  describe('POST /api/v1/context/refresh/:projectId', () => {
    it('should return ContextRefreshWithHealth including both refresh and health', async () => {
      const result = await controller.refreshContext(mockProjectId);

      expect(result).toHaveProperty('refresh');
      expect(result).toHaveProperty('health');
      expect(result.refresh).toEqual(mockRefreshResult);
      expect(result.health).toEqual(mockHealthResult);
    });

    it('should require JWT authentication (guard is applied via decorator)', () => {
      // Verify the controller class has UseGuards decorator
      // In NestJS, this is verified through metadata reflection
      const guards = Reflect.getMetadata(
        '__guards__',
        ContextController,
      );
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
    });

    it('should call ContextGenerationService.refreshAllTiers', async () => {
      await controller.refreshContext(mockProjectId);

      expect(
        mockContextGenerationService.refreshAllTiers,
      ).toHaveBeenCalledWith(
        mockProjectId,
        'default',
        `/workspaces/default/${mockProjectId}`,
        expect.objectContaining({
          name: 'DevOS Project',
          techStack: expect.any(String),
        }),
      );
    });

    it('should pass project ID from URL params', async () => {
      const customProjectId = 'custom-proj-uuid';
      await controller.refreshContext(customProjectId);

      expect(
        mockContextGenerationService.refreshAllTiers,
      ).toHaveBeenCalledWith(
        customProjectId,
        expect.any(String),
        expect.stringContaining(customProjectId),
        expect.any(Object),
      );
    });

    it('should propagate errors from service', async () => {
      mockContextGenerationService.refreshAllTiers.mockRejectedValue(
        new Error('Service error'),
      );

      await expect(
        controller.refreshContext(mockProjectId),
      ).rejects.toThrow('Service error');
    });

    it('should invalidate health cache after refresh', async () => {
      await controller.refreshContext(mockProjectId);

      expect(mockContextHealthService.invalidateCache).toHaveBeenCalledWith(
        mockProjectId,
      );
    });

    it('should call assessHealth with forceRefresh after refresh', async () => {
      await controller.refreshContext(mockProjectId);

      expect(mockContextHealthService.assessHealth).toHaveBeenCalledWith(
        mockProjectId,
        'default',
        `/workspaces/default/${mockProjectId}`,
        true,
      );
    });
  });

  describe('GET /api/v1/context/health/:projectId', () => {
    it('should return 200 with ContextHealth object', async () => {
      const result = await controller.getHealth(mockProjectId, false);

      expect(result).toEqual(mockHealthResult);
      expect(result.projectId).toBe(mockProjectId);
      expect(result.overallHealth).toBe('healthy');
    });

    it('should require JWT authentication (guard is applied via class decorator)', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        ContextController,
      );
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
    });

    it('should call ContextHealthService.assessHealth', async () => {
      await controller.getHealth(mockProjectId, false);

      expect(mockContextHealthService.assessHealth).toHaveBeenCalledWith(
        mockProjectId,
        'default',
        `/workspaces/default/${mockProjectId}`,
        false,
      );
    });

    it('should pass forceRefresh query parameter', async () => {
      await controller.getHealth(mockProjectId, true);

      expect(mockContextHealthService.assessHealth).toHaveBeenCalledWith(
        mockProjectId,
        'default',
        `/workspaces/default/${mockProjectId}`,
        true,
      );
    });

    it('should propagate errors from health service', async () => {
      mockContextHealthService.assessHealth.mockRejectedValue(
        new Error('Health check failed'),
      );

      await expect(controller.getHealth(mockProjectId, false)).rejects.toThrow(
        'Health check failed',
      );
    });
  });
});
