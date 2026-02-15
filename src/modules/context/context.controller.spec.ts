/**
 * ContextController Tests
 * Story 12.4: Three-Tier Context Recovery Enhancement
 *
 * TDD: Tests written first, then implementation verified.
 * Tests the POST /api/v1/context/refresh/:projectId endpoint.
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
import { ContextRefreshResult } from './interfaces/context-generation.interfaces';

describe('ContextController', () => {
  let controller: ContextController;
  let mockContextGenerationService: any;
  let mockConfigService: any;

  const mockProjectId = 'proj-uuid-123';

  const mockRefreshResult: ContextRefreshResult = {
    tier1Updated: true,
    tier2Updated: true,
    tier3Updated: false,
    refreshDurationMs: 42,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockContextGenerationService = {
      refreshAllTiers: jest.fn().mockResolvedValue(mockRefreshResult),
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
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<ContextController>(ContextController);
  });

  describe('POST /api/v1/context/refresh/:projectId', () => {
    it('should return 200 with refresh result', async () => {
      const result = await controller.refreshContext(mockProjectId);

      expect(result).toEqual(mockRefreshResult);
      expect(result.tier1Updated).toBe(true);
      expect(result.tier2Updated).toBe(true);
      expect(result.tier3Updated).toBe(false);
      expect(result.refreshDurationMs).toBeGreaterThanOrEqual(0);
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
  });
});
