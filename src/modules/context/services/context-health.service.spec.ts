/**
 * ContextHealthService Tests
 * Story 12.5: Context Health Indicators UI
 *
 * TDD: Tests written first, then implementation verified.
 * Tests health assessment, tier validation, caching, and Graphiti integration.
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

// Mock fs/promises for file validation
jest.mock('fs/promises');

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import { ContextHealthService } from './context-health.service';
import { MemoryHealthService } from '../../memory/services/memory-health.service';
import { RedisService } from '../../redis/redis.service';

const mockedFs = jest.mocked(fs);

describe('ContextHealthService', () => {
  let service: ContextHealthService;
  let mockRedisService: any;
  let mockMemoryHealthService: any;
  let mockConfigService: any;

  const mockProjectId = 'proj-uuid-123';
  const mockWorkspaceId = 'ws-uuid-456';
  const mockWorkspacePath = '/workspaces/default/proj-uuid-123';

  // Valid .devoscontext JSON
  const validDevOSContext = JSON.stringify({
    version: '1.0',
    project_id: mockProjectId,
    workspace_id: mockWorkspaceId,
    phase: 'implementation',
    current_sprint: 1,
    active_agents: [],
    next_actions: ['Complete implementation'],
    blockers: [],
    last_updated: new Date().toISOString(),
  });

  // Valid project-state.yaml content
  const validProjectState = `
version: "1.0"
project_id: "${mockProjectId}"
workspace_id: "${mockWorkspaceId}"
generated_at: "2026-02-15T10:00:00Z"
stories:
  - storyId: "12.4"
    title: "Three-Tier Context Recovery Enhancement"
    completedAt: "2026-02-15T10:00:00Z"
    agentType: "dev"
    decisions:
      - "Used EventEmitter2 for generation triggers"
    issues: []
    filesChanged: 15
    testsPassed: 92
    memoryEpisodeIds:
      - "episode-uuid-1"
`;

  // Valid DEVOS.md content
  const validDevOSMd = '# DEVOS Project Context\n\n## Project Overview\nDevOS - AI-powered development platform\n';

  // Helper to create fresh file stat
  const freshStat = (size = 500) => ({
    mtime: new Date(), // just now
    size,
    isFile: () => true,
    isDirectory: () => false,
  });

  // Helper to create stale file stat (2 hours ago)
  const staleStat = (size = 500) => ({
    mtime: new Date(Date.now() - 2 * 60 * 60 * 1000),
    size,
    isFile: () => true,
    isDirectory: () => false,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRedisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    mockMemoryHealthService = {
      getHealth: jest.fn().mockResolvedValue({
        neo4jConnected: true,
        neo4jVersion: '5.0',
        totalEpisodes: 100,
        totalEntities: 50,
        lastEpisodeTimestamp: new Date(),
        overallStatus: 'healthy',
      }),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          CONTEXT_HEALTH_CACHE_TTL_SECONDS: '30',
          CONTEXT_HEALTH_TIER1_STALE_MINUTES: '60',
          CONTEXT_HEALTH_TIER2_STALE_MINUTES: '1440',
          CONTEXT_HEALTH_TIER3_STALE_MINUTES: '10080',
          CLI_WORKSPACE_BASE_PATH: '/workspaces',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextHealthService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: MemoryHealthService, useValue: mockMemoryHealthService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ContextHealthService>(ContextHealthService);
  });

  // Helper to set up all files as fresh and valid
  function setupHealthyFiles() {
    mockedFs.stat.mockImplementation((filePath: any) => {
      return Promise.resolve(freshStat() as any);
    });
    mockedFs.readFile.mockImplementation((filePath: any) => {
      const p = filePath.toString();
      if (p.endsWith('.devoscontext')) return Promise.resolve(validDevOSContext);
      if (p.endsWith('DEVOS.md')) return Promise.resolve(validDevOSMd);
      if (p.endsWith('project-state.yaml')) return Promise.resolve(validProjectState);
      return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    });
  }

  describe('assessHealth', () => {
    it('should return healthy when all tiers valid, Graphiti connected, fresh refresh', async () => {
      setupHealthyFiles();

      const health = await service.assessHealth(
        mockProjectId,
        mockWorkspaceId,
        mockWorkspacePath,
      );

      expect(health.overallHealth).toBe('healthy');
      expect(health.tier1.valid).toBe(true);
      expect(health.tier1.exists).toBe(true);
      expect(health.tier1.stale).toBe(false);
      expect(health.tier2.valid).toBe(true);
      expect(health.tier3.valid).toBe(true);
      expect(health.graphitiConnected).toBe(true);
      expect(health.graphitiEpisodeCount).toBe(100);
      expect(health.issues).toHaveLength(0);
      expect(health.projectId).toBe(mockProjectId);
      expect(health.workspaceId).toBe(mockWorkspaceId);
    });

    it('should return degraded when one tier is stale but others are valid', async () => {
      // Tier 2 is stale, others are fresh
      mockedFs.stat.mockImplementation((filePath: any) => {
        const p = filePath.toString();
        if (p.endsWith('DEVOS.md')) return Promise.resolve(staleStat() as any);
        return Promise.resolve(freshStat() as any);
      });
      mockedFs.readFile.mockImplementation((filePath: any) => {
        const p = filePath.toString();
        if (p.endsWith('.devoscontext')) return Promise.resolve(validDevOSContext);
        if (p.endsWith('DEVOS.md')) return Promise.resolve(validDevOSMd);
        if (p.endsWith('project-state.yaml')) return Promise.resolve(validProjectState);
        return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      });

      // Tier 2 stale threshold is 1440 minutes (24 hours), but our stale stat is only 2 hours
      // So we need to set threshold lower for this test
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          CONTEXT_HEALTH_CACHE_TTL_SECONDS: '30',
          CONTEXT_HEALTH_TIER1_STALE_MINUTES: '60',
          CONTEXT_HEALTH_TIER2_STALE_MINUTES: '1', // 1 minute - so 2-hour-old file is stale
          CONTEXT_HEALTH_TIER3_STALE_MINUTES: '10080',
        };
        return config[key] ?? defaultValue;
      });

      const health = await service.assessHealth(
        mockProjectId,
        mockWorkspaceId,
        mockWorkspacePath,
      );

      expect(health.overallHealth).toBe('degraded');
      expect(health.tier2.stale).toBe(true);
      expect(health.tier2.valid).toBe(false);
      expect(health.issues.length).toBe(1);
    });

    it('should return degraded when Graphiti is disconnected but tiers are valid', async () => {
      setupHealthyFiles();
      mockMemoryHealthService.getHealth.mockResolvedValue({
        neo4jConnected: false,
        neo4jVersion: null,
        totalEpisodes: 0,
        totalEntities: 0,
        lastEpisodeTimestamp: null,
        overallStatus: 'unavailable',
      });

      const health = await service.assessHealth(
        mockProjectId,
        mockWorkspaceId,
        mockWorkspacePath,
      );

      expect(health.overallHealth).toBe('degraded');
      expect(health.graphitiConnected).toBe(false);
      expect(health.issues).toContain('Graphiti/Neo4j is disconnected');
    });

    it('should return critical when two or more tiers are invalid/missing', async () => {
      // Tier 1 and Tier 2 missing
      mockedFs.stat.mockImplementation((filePath: any) => {
        const p = filePath.toString();
        if (p.endsWith('project-state.yaml')) return Promise.resolve(freshStat() as any);
        return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      });
      mockedFs.readFile.mockImplementation((filePath: any) => {
        const p = filePath.toString();
        if (p.endsWith('project-state.yaml')) return Promise.resolve(validProjectState);
        return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      });

      const health = await service.assessHealth(
        mockProjectId,
        mockWorkspaceId,
        mockWorkspacePath,
      );

      expect(health.overallHealth).toBe('critical');
      expect(health.tier1.exists).toBe(false);
      expect(health.tier2.exists).toBe(false);
      expect(health.issues.length).toBeGreaterThanOrEqual(2);
    });

    it('should return critical when Tier 1 is missing (most important tier)', async () => {
      // Only Tier 1 is missing
      mockedFs.stat.mockImplementation((filePath: any) => {
        const p = filePath.toString();
        if (p.endsWith('.devoscontext'))
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        return Promise.resolve(freshStat() as any);
      });
      mockedFs.readFile.mockImplementation((filePath: any) => {
        const p = filePath.toString();
        if (p.endsWith('.devoscontext'))
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        if (p.endsWith('DEVOS.md')) return Promise.resolve(validDevOSMd);
        if (p.endsWith('project-state.yaml')) return Promise.resolve(validProjectState);
        return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      });

      const health = await service.assessHealth(
        mockProjectId,
        mockWorkspaceId,
        mockWorkspacePath,
      );

      expect(health.overallHealth).toBe('critical');
      expect(health.tier1.exists).toBe(false);
    });

    it('should include descriptive issue strings for each detected problem', async () => {
      // All tiers missing
      mockedFs.stat.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );
      mockedFs.readFile.mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );
      mockMemoryHealthService.getHealth.mockResolvedValue({
        neo4jConnected: false,
        neo4jVersion: null,
        totalEpisodes: 0,
        totalEntities: 0,
        lastEpisodeTimestamp: null,
        overallStatus: 'unavailable',
      });

      const health = await service.assessHealth(
        mockProjectId,
        mockWorkspaceId,
        mockWorkspacePath,
      );

      expect(health.issues).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Tier 1'),
          expect.stringContaining('Tier 2'),
          expect.stringContaining('Tier 3'),
          expect.stringContaining('Graphiti'),
        ]),
      );
    });

    it('should handle file system errors gracefully (permission denied)', async () => {
      mockedFs.stat.mockRejectedValue(
        Object.assign(new Error('Permission denied'), { code: 'EACCES' }),
      );
      mockedFs.readFile.mockRejectedValue(
        Object.assign(new Error('Permission denied'), { code: 'EACCES' }),
      );

      const health = await service.assessHealth(
        mockProjectId,
        mockWorkspaceId,
        mockWorkspacePath,
      );

      expect(health.overallHealth).toBe('critical');
      expect(health.tier1.valid).toBe(false);
      expect(health.tier1.error).toContain('Permission denied');
    });

    it('should respect configurable staleness thresholds from ConfigService', async () => {
      // Set very short staleness threshold so a 2-hour-old file is stale
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          CONTEXT_HEALTH_CACHE_TTL_SECONDS: '30',
          CONTEXT_HEALTH_TIER1_STALE_MINUTES: '1', // 1 minute
          CONTEXT_HEALTH_TIER2_STALE_MINUTES: '1440',
          CONTEXT_HEALTH_TIER3_STALE_MINUTES: '10080',
        };
        return config[key] ?? defaultValue;
      });

      // Tier 1 is 2 hours old
      mockedFs.stat.mockImplementation((filePath: any) => {
        const p = filePath.toString();
        if (p.endsWith('.devoscontext')) return Promise.resolve(staleStat() as any);
        return Promise.resolve(freshStat() as any);
      });
      mockedFs.readFile.mockImplementation((filePath: any) => {
        const p = filePath.toString();
        if (p.endsWith('.devoscontext')) return Promise.resolve(validDevOSContext);
        if (p.endsWith('DEVOS.md')) return Promise.resolve(validDevOSMd);
        if (p.endsWith('project-state.yaml')) return Promise.resolve(validProjectState);
        return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      });

      const health = await service.assessHealth(
        mockProjectId,
        mockWorkspaceId,
        mockWorkspacePath,
      );

      expect(health.tier1.stale).toBe(true);
      // Tier 1 stale but still exists, so degraded (1 issue)
      expect(health.overallHealth).toBe('degraded');
    });

    it('should read Graphiti health from MemoryHealthService', async () => {
      setupHealthyFiles();
      mockMemoryHealthService.getHealth.mockResolvedValue({
        neo4jConnected: true,
        neo4jVersion: '5.12',
        totalEpisodes: 250,
        totalEntities: 100,
        lastEpisodeTimestamp: new Date(),
        overallStatus: 'healthy',
      });

      const health = await service.assessHealth(
        mockProjectId,
        mockWorkspaceId,
        mockWorkspacePath,
      );

      expect(mockMemoryHealthService.getHealth).toHaveBeenCalled();
      expect(health.graphitiConnected).toBe(true);
      expect(health.graphitiEpisodeCount).toBe(250);
    });

    it('should return default health when workspace path cannot be resolved', async () => {
      // All file operations fail
      mockedFs.stat.mockRejectedValue(new Error('Path does not exist'));
      mockedFs.readFile.mockRejectedValue(new Error('Path does not exist'));

      const health = await service.assessHealth(
        mockProjectId,
        mockWorkspaceId,
        '/nonexistent/path',
      );

      expect(health.projectId).toBe(mockProjectId);
      expect(health.tier1.valid).toBe(false);
      expect(health.tier2.valid).toBe(false);
      expect(health.tier3.valid).toBe(false);
    });
  });

  describe('caching', () => {
    it('should cache result in Redis with configured TTL', async () => {
      setupHealthyFiles();

      await service.assessHealth(mockProjectId, mockWorkspaceId, mockWorkspacePath);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        `context:health:${mockProjectId}`,
        expect.any(String),
        30,
      );
    });

    it('should return cached result within TTL', async () => {
      const cachedHealth = {
        projectId: mockProjectId,
        workspaceId: mockWorkspaceId,
        tier1: { valid: true, exists: true, lastModified: null, stale: false, sizeBytes: 100, error: null },
        tier2: { valid: true, exists: true, lastModified: null, stale: false, sizeBytes: 200, error: null },
        tier3: { valid: true, exists: true, lastModified: null, stale: false, sizeBytes: 300, error: null },
        graphitiConnected: true,
        graphitiEpisodeCount: 50,
        lastRecoveryTime: 0,
        recoveryCount: 0,
        lastRefreshAt: null,
        overallHealth: 'healthy',
        issues: [],
      };
      mockRedisService.get.mockResolvedValue(JSON.stringify(cachedHealth));

      const health = await service.assessHealth(
        mockProjectId,
        mockWorkspaceId,
        mockWorkspacePath,
      );

      expect(health.overallHealth).toBe('healthy');
      // Should NOT call fs since cached
      expect(mockedFs.stat).not.toHaveBeenCalled();
    });

    it('should bypass cache when forceRefresh is true', async () => {
      const cachedHealth = {
        projectId: mockProjectId,
        overallHealth: 'healthy',
        issues: [],
      };
      mockRedisService.get.mockResolvedValue(JSON.stringify(cachedHealth));
      setupHealthyFiles();

      const health = await service.assessHealth(
        mockProjectId,
        mockWorkspaceId,
        mockWorkspacePath,
        true, // forceRefresh
      );

      // Should call fs (bypassed cache)
      expect(mockedFs.stat).toHaveBeenCalled();
    });

    it('should remove cached health on invalidateCache', async () => {
      await service.invalidateCache(mockProjectId);

      expect(mockRedisService.del).toHaveBeenCalledWith(
        `context:health:${mockProjectId}`,
      );
    });
  });

  describe('tier validation', () => {
    it('should detect invalid JSON in Tier 1', async () => {
      mockedFs.stat.mockResolvedValue(freshStat() as any);
      mockedFs.readFile.mockImplementation((filePath: any) => {
        const p = filePath.toString();
        if (p.endsWith('.devoscontext')) return Promise.resolve('not-valid-json{');
        if (p.endsWith('DEVOS.md')) return Promise.resolve(validDevOSMd);
        if (p.endsWith('project-state.yaml')) return Promise.resolve(validProjectState);
        return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      });

      const health = await service.assessHealth(
        mockProjectId,
        mockWorkspaceId,
        mockWorkspacePath,
      );

      expect(health.tier1.valid).toBe(false);
      expect(health.tier1.error).toContain('Invalid JSON');
    });

    it('should detect invalid YAML in Tier 3', async () => {
      mockedFs.stat.mockResolvedValue(freshStat() as any);
      mockedFs.readFile.mockImplementation((filePath: any) => {
        const p = filePath.toString();
        if (p.endsWith('.devoscontext')) return Promise.resolve(validDevOSContext);
        if (p.endsWith('DEVOS.md')) return Promise.resolve(validDevOSMd);
        if (p.endsWith('project-state.yaml')) return Promise.resolve('  invalid:\n  yaml: [unclosed');
        return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      });

      const health = await service.assessHealth(
        mockProjectId,
        mockWorkspaceId,
        mockWorkspacePath,
      );

      // Invalid YAML should result in invalid tier 3
      expect(health.tier3.valid).toBe(false);
      expect(health.tier3.error).toContain('Invalid YAML');
    });
  });
});
