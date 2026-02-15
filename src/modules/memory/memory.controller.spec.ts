/**
 * MemoryController Unit Tests
 * Story 12.1: Graphiti/Neo4j Setup
 * Story 12.2: Memory Ingestion Pipeline
 */

// Mock uuid (required by transitive GraphitiService import)
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid-1234'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { MemoryController } from './memory.controller';
import { MemoryHealthService } from './services/memory-health.service';
import { MemoryIngestionService } from './services/memory-ingestion.service';
import {
  MemoryHealth,
  IngestionResult,
  IngestionStats,
} from './interfaces/memory.interfaces';

describe('MemoryController', () => {
  let controller: MemoryController;
  let mockMemoryHealthService: Partial<MemoryHealthService>;
  let mockMemoryIngestionService: Partial<MemoryIngestionService>;

  const healthyResponse: MemoryHealth = {
    neo4jConnected: true,
    neo4jVersion: '5.15.0',
    totalEpisodes: 42,
    totalEntities: 15,
    lastEpisodeTimestamp: new Date('2026-01-15T10:00:00.000Z'),
    overallStatus: 'healthy',
  };

  const unavailableResponse: MemoryHealth = {
    neo4jConnected: false,
    neo4jVersion: null,
    totalEpisodes: 0,
    totalEntities: 0,
    lastEpisodeTimestamp: null,
    overallStatus: 'unavailable',
  };

  const ingestionResult: IngestionResult = {
    episodesCreated: 3,
    episodeIds: ['ep-1', 'ep-2', 'ep-3'],
    extractionDurationMs: 150,
    errors: [],
  };

  const ingestionStats: IngestionStats = {
    totalIngestions: 10,
    totalEpisodes: 42,
    deduplicationsSkipped: 5,
    errors: 1,
  };

  beforeEach(async () => {
    mockMemoryHealthService = {
      getHealth: jest.fn().mockResolvedValue(healthyResponse),
    };

    mockMemoryIngestionService = {
      ingest: jest.fn().mockResolvedValue(ingestionResult),
      getIngestionStats: jest.fn().mockResolvedValue(ingestionStats),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MemoryController],
      providers: [
        {
          provide: MemoryHealthService,
          useValue: mockMemoryHealthService,
        },
        {
          provide: MemoryIngestionService,
          useValue: mockMemoryIngestionService,
        },
      ],
    }).compile();

    controller = module.get<MemoryController>(MemoryController);
  });

  describe('GET /api/v1/memory/health', () => {
    it('should return 200 with health data when Neo4j is connected', async () => {
      const result = await controller.getHealth();

      expect(result).toEqual(healthyResponse);
      expect(result.neo4jConnected).toBe(true);
      expect(result.overallStatus).toBe('healthy');
      expect(mockMemoryHealthService.getHealth).toHaveBeenCalled();
    });

    it('should return health data with unavailable status when Neo4j is disconnected', async () => {
      (mockMemoryHealthService.getHealth as jest.Mock).mockResolvedValue(
        unavailableResponse,
      );

      const result = await controller.getHealth();

      expect(result).toEqual(unavailableResponse);
      expect(result.neo4jConnected).toBe(false);
      expect(result.overallStatus).toBe('unavailable');
    });

    it('should have JwtAuthGuard applied', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MemoryController.prototype.getHealth,
      );
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/memory/ingest', () => {
    const validBody = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      storyId: 'story-1',
      agentType: 'dev',
      sessionId: 'session-1',
      branch: 'feature/test',
      commitHash: 'abc123',
      exitCode: 0,
      durationMs: 30000,
      outputSummary: null,
      filesChanged: ['src/test.ts'],
      commitMessages: ['Decided to use NestJS'],
      testResults: { passed: 10, failed: 0, total: 10 },
      prUrl: null,
      deploymentUrl: null,
      errorMessage: null,
      pipelineMetadata: {},
    };

    it('should create episodes and return IngestionResult', async () => {
      const result = await controller.ingest(validBody as any);

      expect(result).toEqual(ingestionResult);
      expect(result.episodesCreated).toBe(3);
      expect(result.episodeIds).toHaveLength(3);
      expect(mockMemoryIngestionService.ingest).toHaveBeenCalled();
    });

    it('should pass correct IngestionInput to service', async () => {
      await controller.ingest(validBody as any);

      expect(mockMemoryIngestionService.ingest).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project-1',
          workspaceId: 'workspace-1',
          agentType: 'dev',
          sessionId: 'session-1',
        }),
      );
    });

    it('should have JwtAuthGuard applied', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MemoryController.prototype.ingest,
      );
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
    });

    it('should handle extraction errors gracefully (returns partial result)', async () => {
      const partialResult: IngestionResult = {
        episodesCreated: 1,
        episodeIds: ['ep-1'],
        extractionDurationMs: 200,
        errors: ['Failed to store episode: Neo4j error'],
      };
      (mockMemoryIngestionService.ingest as jest.Mock).mockResolvedValue(
        partialResult,
      );

      const result = await controller.ingest(validBody as any);

      expect(result.episodesCreated).toBe(1);
      expect(result.errors.length).toBe(1);
    });

    it('should handle null optional fields with defaults', async () => {
      const bodyWithNulls = {
        ...validBody,
        storyId: null,
        branch: null,
        commitHash: null,
        exitCode: null,
        outputSummary: null,
        filesChanged: undefined,
        commitMessages: undefined,
        testResults: null,
        prUrl: null,
        deploymentUrl: null,
        errorMessage: null,
        pipelineMetadata: undefined,
      };

      await controller.ingest(bodyWithNulls as any);

      expect(mockMemoryIngestionService.ingest).toHaveBeenCalledWith(
        expect.objectContaining({
          storyId: null,
          branch: null,
          filesChanged: [],
          commitMessages: [],
          pipelineMetadata: {},
        }),
      );
    });
  });

  describe('GET /api/v1/memory/ingestion-stats', () => {
    it('should return stats for project', async () => {
      const query = {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
      };

      const result = await controller.getIngestionStats(query as any);

      expect(result).toEqual(ingestionStats);
      expect(result.totalEpisodes).toBe(42);
      expect(
        mockMemoryIngestionService.getIngestionStats,
      ).toHaveBeenCalledWith('project-1', 'workspace-1', undefined);
    });

    it('should pass since date when provided', async () => {
      const query = {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        since: '2026-01-01T00:00:00.000Z',
      };

      await controller.getIngestionStats(query as any);

      expect(
        mockMemoryIngestionService.getIngestionStats,
      ).toHaveBeenCalledWith(
        'project-1',
        'workspace-1',
        new Date('2026-01-01T00:00:00.000Z'),
      );
    });

    it('should have JwtAuthGuard applied', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MemoryController.prototype.getIngestionStats,
      );
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
    });
  });
});
