/**
 * MemoryController Unit Tests
 * Story 12.1: Graphiti/Neo4j Setup
 * Story 12.2: Memory Ingestion Pipeline
 * Story 12.3: Memory Query Service
 * Story 12.6: Cross-Project Learning
 * Story 12.7: Memory Summarization (Cheap Models)
 */

// Mock uuid (required by transitive GraphitiService import)
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid-1234'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { MemoryController } from './memory.controller';
import { MemoryHealthService } from './services/memory-health.service';
import { MemoryIngestionService } from './services/memory-ingestion.service';
import { MemoryQueryService } from './services/memory-query.service';
import { CrossProjectLearningService } from './services/cross-project-learning.service';
import { MemorySummarizationService } from './services/memory-summarization.service';
import {
  MemoryHealth,
  IngestionResult,
  IngestionStats,
  MemoryQueryResult,
  WorkspacePattern,
  PatternDetectionResult,
  PatternRecommendation,
  PatternAdoptionStats,
  SummarizationResult,
  SummarizationStats,
  MemorySummary,
} from './interfaces/memory.interfaces';

describe('MemoryController', () => {
  let controller: MemoryController;
  let mockMemoryHealthService: Partial<MemoryHealthService>;
  let mockMemoryIngestionService: Partial<MemoryIngestionService>;
  let mockMemoryQueryService: Partial<MemoryQueryService>;
  let mockCrossProjectLearningService: any;
  let mockMemorySummarizationService: any;

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

  const queryResult: MemoryQueryResult = {
    memories: [
      {
        id: 'ep-1',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        storyId: 'story-1',
        agentType: 'dev',
        timestamp: new Date('2026-02-10T10:00:00.000Z'),
        episodeType: 'decision',
        content: 'Decided to use BullMQ for task queue',
        entities: ['BullMQ'],
        confidence: 0.9,
        metadata: {},
      },
    ],
    totalCount: 1,
    relevanceScores: [0.85],
    queryDurationMs: 42,
  };

  // Story 12.6 test data
  const testPattern: WorkspacePattern = {
    id: 'pattern-1',
    workspaceId: 'workspace-1',
    patternType: 'architecture',
    content: 'Use Zustand for React state management',
    sourceProjectIds: ['project-1', 'project-2'],
    sourceEpisodeIds: ['ep-1', 'ep-2'],
    occurrenceCount: 3,
    confidence: 'medium',
    status: 'active',
    overriddenBy: null,
    overrideReason: null,
    createdAt: new Date('2026-02-10T10:00:00.000Z'),
    updatedAt: new Date('2026-02-10T10:00:00.000Z'),
    metadata: {},
  };

  const detectionResult: PatternDetectionResult = {
    newPatterns: 2,
    updatedPatterns: 1,
    totalPatterns: 5,
    detectionDurationMs: 150,
  };

  const adoptionStats: PatternAdoptionStats = {
    totalPatterns: 10,
    byConfidence: { low: 3, medium: 5, high: 2 },
    byType: { architecture: 4, error: 2, testing: 2, deployment: 1, security: 1 },
    overrideRate: 0.1,
    averageOccurrenceCount: 3.5,
    topPatterns: [testPattern],
  };

  beforeEach(async () => {
    mockMemoryHealthService = {
      getHealth: jest.fn().mockResolvedValue(healthyResponse),
    };

    mockMemoryIngestionService = {
      ingest: jest.fn().mockResolvedValue(ingestionResult),
      getIngestionStats: jest.fn().mockResolvedValue(ingestionStats),
    };

    mockMemoryQueryService = {
      query: jest.fn().mockResolvedValue(queryResult),
      recordRelevanceFeedback: jest.fn().mockResolvedValue(true),
    };

    mockCrossProjectLearningService = {
      getWorkspacePatterns: jest.fn().mockResolvedValue([testPattern]),
      detectPatterns: jest.fn().mockResolvedValue(detectionResult),
      overridePattern: jest.fn().mockResolvedValue({ ...testPattern, status: 'overridden' }),
      restorePattern: jest.fn().mockResolvedValue(testPattern),
      getPatternRecommendations: jest.fn().mockResolvedValue([
        { pattern: testPattern, relevanceScore: 0.7, confidenceLabel: '[RECOMMENDED]' },
      ]),
      getPatternAdoptionStats: jest.fn().mockResolvedValue(adoptionStats),
    };

    mockMemorySummarizationService = {
      summarizeProject: jest.fn().mockResolvedValue({
        summariesCreated: 3,
        episodesArchived: 15,
        totalProcessed: 15,
        durationMs: 250,
        skipped: false,
        errors: [],
      } as SummarizationResult),
      getProjectSummaries: jest.fn().mockResolvedValue([
        {
          id: 'summary-1',
          projectId: 'project-1',
          workspaceId: 'workspace-1',
          periodStart: new Date('2025-12-01'),
          periodEnd: new Date('2025-12-31'),
          originalEpisodeCount: 10,
          summary: 'December summary',
          keyDecisions: [],
          keyPatterns: [],
          archivedEpisodeIds: ['ep-1'],
          summarizationModel: 'stub',
          createdAt: new Date('2026-01-15'),
          metadata: {},
        },
      ] as MemorySummary[]),
      getSummarizationStats: jest.fn().mockResolvedValue({
        totalSummaries: 5,
        totalArchivedEpisodes: 100,
        activeEpisodes: 500,
        oldestSummary: new Date('2025-10-01'),
        newestSummary: new Date('2025-12-01'),
      } as SummarizationStats),
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
        {
          provide: MemoryQueryService,
          useValue: mockMemoryQueryService,
        },
        {
          provide: CrossProjectLearningService,
          useValue: mockCrossProjectLearningService,
        },
        {
          provide: MemorySummarizationService,
          useValue: mockMemorySummarizationService,
        },
      ],
    }).compile();

    controller = module.get<MemoryController>(MemoryController);
  });

  // ─── Health Endpoint Tests (Story 12.1) ────────────────────────────────────

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

  // ─── Ingest Endpoint Tests (Story 12.2) ────────────────────────────────────

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

  // ─── Ingestion Stats Endpoint Tests (Story 12.2) ──────────────────────────

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

  // ─── Query Endpoint Tests (Story 12.3) ─────────────────────────────────────

  describe('POST /api/v1/memory/query', () => {
    it('should return 200 with MemoryQueryResult', async () => {
      const body = {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'BullMQ task queue',
      };

      const result = await controller.queryMemories(body as any);

      expect(result).toEqual(queryResult);
      expect(result.memories).toHaveLength(1);
      expect(result.relevanceScores).toHaveLength(1);
      expect(result.totalCount).toBe(1);
      expect(result.queryDurationMs).toBeDefined();
    });

    it('should require JWT authentication (JwtAuthGuard applied)', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MemoryController.prototype.queryMemories,
      );
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
    });

    it('should pass required fields to MemoryQueryService', async () => {
      const body = {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'BullMQ task queue',
      };

      await controller.queryMemories(body as any);

      expect(mockMemoryQueryService.query).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project-1',
          workspaceId: 'workspace-1',
          query: 'BullMQ task queue',
        }),
      );
    });

    it('should handle optional filters', async () => {
      const body = {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'test query',
        filters: {
          types: ['decision', 'problem'],
          entityIds: ['BullMQ'],
          since: '2026-02-01T00:00:00.000Z',
          maxResults: 5,
        },
      };

      await controller.queryMemories(body as any);

      expect(mockMemoryQueryService.query).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project-1',
          workspaceId: 'workspace-1',
          query: 'test query',
          filters: expect.objectContaining({
            types: ['decision', 'problem'],
            entityIds: ['BullMQ'],
            since: new Date('2026-02-01T00:00:00.000Z'),
            maxResults: 5,
          }),
        }),
      );
    });

    it('should handle query without filters', async () => {
      const body = {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'simple query',
      };

      await controller.queryMemories(body as any);

      expect(mockMemoryQueryService.query).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: undefined,
        }),
      );
    });
  });

  // ─── Feedback Endpoint Tests (Story 12.3) ──────────────────────────────────

  describe('POST /api/v1/memory/feedback', () => {
    it('should return 200 with updated status', async () => {
      const body = {
        episodeId: 'ep-1',
        wasUseful: true,
      };

      const result = await controller.recordFeedback(body as any);

      expect(result).toEqual({ updated: true });
    });

    it('should require JWT authentication (JwtAuthGuard applied)', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MemoryController.prototype.recordFeedback,
      );
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
    });

    it('should call recordRelevanceFeedback with correct parameters', async () => {
      const body = {
        episodeId: 'ep-1',
        wasUseful: true,
      };

      await controller.recordFeedback(body as any);

      expect(
        mockMemoryQueryService.recordRelevanceFeedback,
      ).toHaveBeenCalledWith('ep-1', true);
    });

    it('should handle negative feedback', async () => {
      const body = {
        episodeId: 'ep-2',
        wasUseful: false,
      };

      await controller.recordFeedback(body as any);

      expect(
        mockMemoryQueryService.recordRelevanceFeedback,
      ).toHaveBeenCalledWith('ep-2', false);
    });

    it('should return updated: false when episode not found', async () => {
      (mockMemoryQueryService.recordRelevanceFeedback as jest.Mock).mockResolvedValue(false);

      const body = {
        episodeId: 'nonexistent-ep',
        wasUseful: true,
      };

      const result = await controller.recordFeedback(body as any);

      expect(result).toEqual({ updated: false });
    });
  });

  // ─── Cross-Project Learning Endpoint Tests (Story 12.6) ───────────────────

  describe('GET /api/v1/memory/patterns/:workspaceId', () => {
    it('should return 200 with patterns', async () => {
      const result = await controller.getWorkspacePatterns('workspace-1', {} as any);

      expect(result).toEqual([testPattern]);
      expect(mockCrossProjectLearningService.getWorkspacePatterns).toHaveBeenCalledWith(
        'workspace-1',
        expect.any(Object),
      );
    });

    it('should require JWT (JwtAuthGuard applied)', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MemoryController.prototype.getWorkspacePatterns,
      );
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
    });

    it('should filter by query params', async () => {
      const query = {
        type: 'architecture',
        confidence: 'high',
        status: 'active',
        limit: 10,
      };

      await controller.getWorkspacePatterns('workspace-1', query as any);

      expect(mockCrossProjectLearningService.getWorkspacePatterns).toHaveBeenCalledWith(
        'workspace-1',
        expect.objectContaining({
          patternType: 'architecture',
          confidence: 'high',
          status: 'active',
          limit: 10,
        }),
      );
    });
  });

  describe('POST /api/v1/memory/patterns/detect', () => {
    it('should return 200 with detection result', async () => {
      const body = { workspaceId: 'workspace-1' };

      const result = await controller.detectPatterns(body as any);

      expect(result).toEqual(detectionResult);
      expect(result.newPatterns).toBe(2);
      expect(result.updatedPatterns).toBe(1);
      expect(result.totalPatterns).toBe(5);
      expect(mockCrossProjectLearningService.detectPatterns).toHaveBeenCalledWith('workspace-1');
    });

    it('should require JWT (JwtAuthGuard applied)', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MemoryController.prototype.detectPatterns,
      );
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/memory/patterns/:patternId/override', () => {
    it('should return 200 with updated pattern', async () => {
      const body = { userId: 'user-1', reason: 'Not applicable' };

      const result = await controller.overridePattern('pattern-1', body as any);

      expect(result.status).toBe('overridden');
      expect(mockCrossProjectLearningService.overridePattern).toHaveBeenCalledWith(
        'pattern-1',
        'user-1',
        'Not applicable',
      );
    });

    it('should require JWT (JwtAuthGuard applied)', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MemoryController.prototype.overridePattern,
      );
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
    });

    it('should require userId and reason in body', async () => {
      const body = { userId: 'user-1', reason: 'Not applicable' };

      await controller.overridePattern('pattern-1', body as any);

      expect(mockCrossProjectLearningService.overridePattern).toHaveBeenCalledWith(
        'pattern-1',
        'user-1',
        'Not applicable',
      );
    });
  });

  describe('POST /api/v1/memory/patterns/:patternId/restore', () => {
    it('should return 200 with restored pattern', async () => {
      const result = await controller.restorePattern('pattern-1');

      expect(result).toEqual(testPattern);
      expect(result.status).toBe('active');
      expect(mockCrossProjectLearningService.restorePattern).toHaveBeenCalledWith('pattern-1');
    });

    it('should require JWT (JwtAuthGuard applied)', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MemoryController.prototype.restorePattern,
      );
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/memory/patterns/:workspaceId/recommendations', () => {
    it('should return 200 with recommendations', async () => {
      const query = { projectId: 'project-new', task: 'React state management' };

      const result = await controller.getPatternRecommendations('workspace-1', query as any);

      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBeDefined();
      expect(result[0].relevanceScore).toBe(0.7);
      expect(result[0].confidenceLabel).toBe('[RECOMMENDED]');
      expect(mockCrossProjectLearningService.getPatternRecommendations).toHaveBeenCalledWith(
        'workspace-1',
        'project-new',
        'React state management',
      );
    });

    it('should require JWT (JwtAuthGuard applied)', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MemoryController.prototype.getPatternRecommendations,
      );
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/memory/patterns/:workspaceId/stats', () => {
    it('should return 200 with stats', async () => {
      const result = await controller.getPatternAdoptionStats('workspace-1');

      expect(result).toEqual(adoptionStats);
      expect(result.totalPatterns).toBe(10);
      expect(result.byConfidence.high).toBe(2);
      expect(result.overrideRate).toBe(0.1);
      expect(mockCrossProjectLearningService.getPatternAdoptionStats).toHaveBeenCalledWith('workspace-1');
    });

    it('should require JWT (JwtAuthGuard applied)', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MemoryController.prototype.getPatternAdoptionStats,
      );
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
    });
  });

  // ─── Summarization Endpoint Tests (Story 12.7) ─────────────────────────────

  describe('POST /api/v1/memory/summarize', () => {
    it('should return 200 with SummarizationResult', async () => {
      const body = { projectId: 'project-1', workspaceId: 'workspace-1' };

      const result = await controller.summarize(body as any);

      expect(result.summariesCreated).toBe(3);
      expect(result.episodesArchived).toBe(15);
      expect(result.skipped).toBe(false);
      expect(result.errors).toEqual([]);
      expect(mockMemorySummarizationService.summarizeProject).toHaveBeenCalledWith(
        'project-1',
        'workspace-1',
      );
    });

    it('should require JWT authentication (JwtAuthGuard applied)', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MemoryController.prototype.summarize,
      );
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
    });

    it('should validate required fields (projectId, workspaceId)', async () => {
      const body = { projectId: 'project-1', workspaceId: 'workspace-1' };

      await controller.summarize(body as any);

      expect(mockMemorySummarizationService.summarizeProject).toHaveBeenCalledWith(
        'project-1',
        'workspace-1',
      );
    });
  });

  describe('GET /api/v1/memory/summaries', () => {
    it('should return 200 with MemorySummary array', async () => {
      const query = { projectId: 'project-1', workspaceId: 'workspace-1' };

      const result = await controller.getSummaries(query as any);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('summary-1');
      expect(result[0].summary).toBe('December summary');
      expect(mockMemorySummarizationService.getProjectSummaries).toHaveBeenCalledWith(
        'project-1',
        'workspace-1',
      );
    });

    it('should require JWT authentication (JwtAuthGuard applied)', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MemoryController.prototype.getSummaries,
      );
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
    });

    it('should validate required query params', async () => {
      const query = { projectId: 'project-1', workspaceId: 'workspace-1' };

      await controller.getSummaries(query as any);

      expect(mockMemorySummarizationService.getProjectSummaries).toHaveBeenCalledWith(
        'project-1',
        'workspace-1',
      );
    });
  });

  describe('GET /api/v1/memory/summarization-stats', () => {
    it('should return 200 with SummarizationStats', async () => {
      const query = { projectId: 'project-1', workspaceId: 'workspace-1' };

      const result = await controller.getSummarizationStats(query as any);

      expect(result.totalSummaries).toBe(5);
      expect(result.totalArchivedEpisodes).toBe(100);
      expect(result.activeEpisodes).toBe(500);
      expect(result.oldestSummary).toBeDefined();
      expect(result.newestSummary).toBeDefined();
      expect(mockMemorySummarizationService.getSummarizationStats).toHaveBeenCalledWith(
        'project-1',
        'workspace-1',
      );
    });

    it('should require JWT authentication (JwtAuthGuard applied)', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MemoryController.prototype.getSummarizationStats,
      );
      expect(guards).toBeDefined();
      expect(guards.length).toBeGreaterThan(0);
    });
  });
});
