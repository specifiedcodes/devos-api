/**
 * MemorySummarizationService Unit Tests
 * Story 12.7: Memory Summarization (Cheap Models)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MemorySummarizationService } from './memory-summarization.service';
import { GraphitiService } from './graphiti.service';
import { Neo4jService } from './neo4j.service';
import { MemoryEpisode } from '../interfaces/memory.interfaces';

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-summary-uuid'),
}));

describe('MemorySummarizationService', () => {
  let service: MemorySummarizationService;
  let mockGraphitiService: any;
  let mockNeo4jService: any;
  let mockConfigService: any;
  let mockEventEmitter: any;

  const now = new Date('2026-02-15T10:00:00.000Z');

  // ─── Test Data ──────────────────────────────────────────────────────────────

  const eligibleFact: MemoryEpisode = {
    id: 'ep-old-fact',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    storyId: 'story-1',
    agentType: 'dev',
    timestamp: new Date('2025-12-01T10:00:00.000Z'), // ~76 days old
    episodeType: 'fact',
    content: 'Created REST endpoint POST /api/v1/memory/ingest',
    entities: ['/api/v1/memory/ingest'],
    confidence: 0.8,
    metadata: {},
  };

  const eligibleProblem: MemoryEpisode = {
    id: 'ep-old-problem',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    storyId: 'story-1',
    agentType: 'dev',
    timestamp: new Date('2025-12-15T10:00:00.000Z'), // ~62 days old
    episodeType: 'problem',
    content: 'Fixed database connection timeout issue',
    entities: ['database'],
    confidence: 0.7,
    metadata: {},
  };

  const eligiblePattern: MemoryEpisode = {
    id: 'ep-old-pattern',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    storyId: 'story-1',
    agentType: 'dev',
    timestamp: new Date('2025-12-20T10:00:00.000Z'), // ~57 days old
    episodeType: 'pattern',
    content: 'Always use dependency injection for services',
    entities: ['NestJS'],
    confidence: 0.85,
    metadata: {},
  };

  const eligiblePreference: MemoryEpisode = {
    id: 'ep-old-preference',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    storyId: 'story-2',
    agentType: 'dev',
    timestamp: new Date('2025-11-15T10:00:00.000Z'), // ~92 days old
    episodeType: 'preference',
    content: 'Prefer camelCase for variable names',
    entities: [],
    confidence: 0.6,
    metadata: {},
  };

  const decisionEpisode: MemoryEpisode = {
    id: 'ep-decision',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    storyId: 'story-1',
    agentType: 'dev',
    timestamp: new Date('2025-12-01T10:00:00.000Z'),
    episodeType: 'decision',
    content: 'Decided to use NestJS guards for auth',
    entities: ['NestJS'],
    confidence: 0.9,
    metadata: {},
  };

  const pinnedEpisode: MemoryEpisode = {
    id: 'ep-pinned',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    storyId: 'story-1',
    agentType: 'dev',
    timestamp: new Date('2025-12-01T10:00:00.000Z'),
    episodeType: 'fact',
    content: 'Critical API endpoint documentation',
    entities: [],
    confidence: 0.8,
    metadata: { pinned: true },
  };

  const recentEpisode: MemoryEpisode = {
    id: 'ep-recent',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    storyId: 'story-2',
    agentType: 'dev',
    timestamp: new Date('2026-02-10T10:00:00.000Z'), // 5 days old
    episodeType: 'fact',
    content: 'Just created something new',
    entities: [],
    confidence: 0.7,
    metadata: {},
  };

  const highConfidenceEpisode: MemoryEpisode = {
    id: 'ep-high-conf',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    storyId: 'story-1',
    agentType: 'dev',
    timestamp: new Date('2025-12-01T10:00:00.000Z'),
    episodeType: 'fact',
    content: 'Critical infrastructure fact',
    entities: [],
    confidence: 0.95,
    metadata: {},
  };

  const archivedEpisode: MemoryEpisode = {
    id: 'ep-archived',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    storyId: 'story-1',
    agentType: 'dev',
    timestamp: new Date('2025-12-01T10:00:00.000Z'),
    episodeType: 'fact',
    content: 'Already archived fact',
    entities: [],
    confidence: 0.6,
    metadata: { archived: true },
  };

  // January episode for testing multi-month grouping
  const janFact: MemoryEpisode = {
    id: 'ep-jan-fact',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    storyId: 'story-1',
    agentType: 'dev',
    timestamp: new Date('2026-01-10T10:00:00.000Z'), // ~36 days old
    episodeType: 'fact',
    content: 'Setup CI/CD pipeline',
    entities: ['CI/CD'],
    confidence: 0.75,
    metadata: {},
  };

  // ─── Setup ──────────────────────────────────────────────────────────────────

  const createMockResult = (records: Record<string, unknown>[] = []) => ({
    records: records.map((record) => ({
      get: jest.fn((key: string) => record[key]),
    })),
  });

  beforeEach(async () => {
    mockGraphitiService = {
      searchEpisodes: jest.fn().mockResolvedValue([]),
      getProjectEpisodeCount: jest.fn().mockResolvedValue(0),
      archiveEpisode: jest.fn().mockResolvedValue(true),
    };

    mockNeo4jService = {
      runQuery: jest.fn().mockResolvedValue(createMockResult()),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          MEMORY_SUMMARIZATION_EPISODE_THRESHOLD: '1000',
          MEMORY_SUMMARIZATION_AGE_DAYS: '30',
          MEMORY_SUMMARIZATION_AGGRESSIVE_AGE_DAYS: '60',
          MEMORY_SUMMARIZATION_MODEL: 'stub',
          MEMORY_SUMMARIZATION_MAX_SUMMARY_LENGTH: '2000',
          MEMORY_SUMMARIZATION_BUDGET_CAP_TOKENS: '100000',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemorySummarizationService,
        { provide: GraphitiService, useValue: mockGraphitiService },
        { provide: Neo4jService, useValue: mockNeo4jService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<MemorySummarizationService>(
      MemorySummarizationService,
    );
  });

  // ─── Threshold and Eligibility Tests ────────────────────────────────────────

  describe('checkAndSummarize', () => {
    it('should skip when active episode count < threshold', async () => {
      // Now uses neo4jService.runQuery to count only non-archived episodes
      mockNeo4jService.runQuery.mockResolvedValue(
        createMockResult([{ count: 500 }]),
      );

      const result = await service.checkAndSummarize(
        'project-1',
        'workspace-1',
      );

      expect(result.skipped).toBe(true);
      expect(result.summariesCreated).toBe(0);
      expect(result.episodesArchived).toBe(0);
      expect(mockGraphitiService.searchEpisodes).not.toHaveBeenCalled();
    });

    it('should trigger summarization when active episode count >= threshold', async () => {
      // First call: count active episodes (returns >= threshold)
      // Subsequent calls: storeSummary, archiveEpisodes, etc.
      mockNeo4jService.runQuery
        .mockResolvedValueOnce(createMockResult([{ count: 1500 }]))
        .mockResolvedValue(createMockResult([{ archivedCount: 1 }]));
      mockGraphitiService.searchEpisodes.mockResolvedValue([eligibleFact]);

      const result = await service.checkAndSummarize(
        'project-1',
        'workspace-1',
      );

      expect(result.skipped).toBe(false);
      expect(mockGraphitiService.searchEpisodes).toHaveBeenCalled();
    });

    it('should return result with skipped=true when below threshold', async () => {
      mockNeo4jService.runQuery.mockResolvedValue(
        createMockResult([{ count: 999 }]),
      );

      const result = await service.checkAndSummarize(
        'project-1',
        'workspace-1',
      );

      expect(result).toEqual(
        expect.objectContaining({
          summariesCreated: 0,
          episodesArchived: 0,
          totalProcessed: 0,
          skipped: true,
          errors: [],
        }),
      );
    });
  });

  // ─── Episode Filtering Tests ────────────────────────────────────────────────

  describe('isEligibleForSummarization', () => {
    it('should exclude episodes with episodeType decision', () => {
      expect(
        service.isEligibleForSummarization(decisionEpisode, now),
      ).toBe(false);
    });

    it('should exclude episodes with pinned: true in metadata', () => {
      expect(
        service.isEligibleForSummarization(pinnedEpisode, now),
      ).toBe(false);
    });

    it('should exclude episodes with confidence >= 0.95', () => {
      expect(
        service.isEligibleForSummarization(highConfidenceEpisode, now),
      ).toBe(false);
    });

    it('should exclude episodes younger than MEMORY_SUMMARIZATION_AGE_DAYS', () => {
      expect(
        service.isEligibleForSummarization(recentEpisode, now),
      ).toBe(false);
    });

    it('should exclude already-archived episodes', () => {
      expect(
        service.isEligibleForSummarization(archivedEpisode, now),
      ).toBe(false);
    });

    it('should include eligible episodes (old, non-decision, non-pinned, low confidence)', () => {
      expect(
        service.isEligibleForSummarization(eligibleFact, now),
      ).toBe(true);
    });

    it('should include problem episodes older than AGE_DAYS', () => {
      expect(
        service.isEligibleForSummarization(eligibleProblem, now),
      ).toBe(true);
    });

    it('should include pattern episodes older than AGE_DAYS', () => {
      expect(
        service.isEligibleForSummarization(eligiblePattern, now),
      ).toBe(true);
    });

    it('should include preference episodes older than AGE_DAYS', () => {
      expect(
        service.isEligibleForSummarization(eligiblePreference, now),
      ).toBe(true);
    });
  });

  // ─── Grouping and Summary Generation Tests ─────────────────────────────────

  describe('groupByMonth', () => {
    it('should group episodes by calendar month correctly', () => {
      const episodes = [eligibleFact, eligibleProblem, eligiblePreference, janFact];
      const groups = service.groupByMonth(episodes);

      expect(groups.size).toBe(3); // Nov 2025, Dec 2025, Jan 2026
      expect(groups.has('2025-11')).toBe(true);
      expect(groups.has('2025-12')).toBe(true);
      expect(groups.has('2026-01')).toBe(true);

      expect(groups.get('2025-11')!.length).toBe(1);
      expect(groups.get('2025-12')!.length).toBe(2);
      expect(groups.get('2026-01')!.length).toBe(1);
    });

    it('should handle single month with many episodes', () => {
      const episodes = [eligibleFact, eligibleProblem, eligiblePattern];
      const groups = service.groupByMonth(episodes);

      expect(groups.get('2025-12')!.length).toBe(3);
    });
  });

  describe('generateStubSummary', () => {
    it('should generate stub summary text with correct format', () => {
      const periodStart = new Date('2025-12-01T00:00:00.000Z');
      const periodEnd = new Date('2025-12-31T23:59:59.999Z');

      const summary = service.generateStubSummary(
        [eligibleFact, eligibleProblem, eligiblePattern],
        periodStart,
        periodEnd,
      );

      expect(summary).toContain('Period 2025-12-01 to 2025-12-31');
      expect(summary).toContain('3 episodes summarized');
    });

    it('should include key facts in summary text', () => {
      const periodStart = new Date('2025-12-01T00:00:00.000Z');
      const periodEnd = new Date('2025-12-31T23:59:59.999Z');

      const summary = service.generateStubSummary(
        [eligibleFact],
        periodStart,
        periodEnd,
      );

      expect(summary).toContain('Key facts:');
      expect(summary).toContain(eligibleFact.content);
    });

    it('should include problems resolved in summary text', () => {
      const periodStart = new Date('2025-12-01T00:00:00.000Z');
      const periodEnd = new Date('2025-12-31T23:59:59.999Z');

      const summary = service.generateStubSummary(
        [eligibleProblem],
        periodStart,
        periodEnd,
      );

      expect(summary).toContain('Problems resolved:');
      expect(summary).toContain(eligibleProblem.content);
    });

    it('should include patterns observed in summary text', () => {
      const periodStart = new Date('2025-12-01T00:00:00.000Z');
      const periodEnd = new Date('2025-12-31T23:59:59.999Z');

      const summary = service.generateStubSummary(
        [eligiblePattern],
        periodStart,
        periodEnd,
      );

      expect(summary).toContain('Patterns observed:');
      expect(summary).toContain(eligiblePattern.content);
    });

    it('should include preferences in summary text', () => {
      const periodStart = new Date('2025-11-01T00:00:00.000Z');
      const periodEnd = new Date('2025-11-30T23:59:59.999Z');

      const summary = service.generateStubSummary(
        [eligiblePreference],
        periodStart,
        periodEnd,
      );

      expect(summary).toContain('Preferences:');
      expect(summary).toContain(eligiblePreference.content);
    });

    it('should truncate summary to MAX_SUMMARY_LENGTH', () => {
      // Set max length very low
      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: any) => {
          if (key === 'MEMORY_SUMMARIZATION_MAX_SUMMARY_LENGTH') return '50';
          return defaultValue;
        },
      );

      const periodStart = new Date('2025-12-01T00:00:00.000Z');
      const periodEnd = new Date('2025-12-31T23:59:59.999Z');

      const summary = service.generateStubSummary(
        [eligibleFact, eligibleProblem, eligiblePattern],
        periodStart,
        periodEnd,
      );

      expect(summary.length).toBeLessThanOrEqual(50);
      expect(summary).toMatch(/\.\.\.$/);
    });

    it('should handle empty eligible episodes', () => {
      const periodStart = new Date('2025-12-01T00:00:00.000Z');
      const periodEnd = new Date('2025-12-31T23:59:59.999Z');

      const summary = service.generateStubSummary(
        [],
        periodStart,
        periodEnd,
      );

      expect(summary).toContain('0 episodes summarized');
    });
  });

  describe('extractKeyDecisions', () => {
    it('should preserve key decisions verbatim', () => {
      const episodes = [decisionEpisode, eligibleFact];
      const decisions = service.extractKeyDecisions(episodes);

      expect(decisions).toEqual([decisionEpisode.content]);
    });

    it('should return empty array when no decisions', () => {
      const decisions = service.extractKeyDecisions([eligibleFact]);
      expect(decisions).toEqual([]);
    });
  });

  describe('extractKeyPatterns', () => {
    it('should preserve key patterns verbatim', () => {
      const episodes = [eligiblePattern, eligibleFact];
      const patterns = service.extractKeyPatterns(episodes);

      expect(patterns).toEqual([eligiblePattern.content]);
    });

    it('should return empty array when no patterns', () => {
      const patterns = service.extractKeyPatterns([eligibleFact]);
      expect(patterns).toEqual([]);
    });
  });

  // ─── Storage and Archival Tests ─────────────────────────────────────────────

  describe('summarizeProject', () => {
    it('should create MemorySummary node in Neo4j using MERGE', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([eligibleFact]);
      // storeSummary + archiveEpisodes queries
      mockNeo4jService.runQuery.mockResolvedValue(createMockResult([{ archivedCount: 1 }]));

      await service.summarizeProject('project-1', 'workspace-1');

      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (s:MemorySummary'),
        expect.objectContaining({
          id: 'test-summary-uuid',
          projectId: 'project-1',
          workspaceId: 'workspace-1',
          summarizationModel: 'stub',
        }),
      );
    });

    it('should archive original episodes via batch query setting archived=true', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([eligibleFact]);
      mockNeo4jService.runQuery.mockResolvedValue(createMockResult([{ archivedCount: 1 }]));

      await service.summarizeProject('project-1', 'workspace-1');

      // Batch archive query should contain UNWIND and SET archived = true
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET e.archived = true'),
        expect.objectContaining({
          summaryId: 'test-summary-uuid',
          episodeIds: ['ep-old-fact'],
        }),
      );
    });

    it('should create SUMMARIZES relationships between summary and episodes', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([eligibleFact]);
      mockNeo4jService.runQuery.mockResolvedValue(createMockResult([{ archivedCount: 1 }]));

      await service.summarizeProject('project-1', 'workspace-1');

      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (s)-[:SUMMARIZES]->(e)'),
        expect.objectContaining({
          summaryId: 'test-summary-uuid',
          episodeIds: ['ep-old-fact'],
        }),
      );
    });

    it('should NOT delete archived episodes (archive-not-delete strategy)', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([
        eligibleFact,
        eligibleProblem,
      ]);
      mockNeo4jService.runQuery.mockResolvedValue(createMockResult([{ archivedCount: 2 }]));

      await service.summarizeProject('project-1', 'workspace-1');

      // Batch archive via Neo4j (sets archived=true), not per-episode delete
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET e.archived = true'),
        expect.any(Object),
      );
      // deleteEpisode should never be called
      expect(mockGraphitiService.deleteEpisode).toBeUndefined();
    });

    it('should return count of archived episodes', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([
        eligibleFact,
        eligibleProblem,
      ]);
      mockNeo4jService.runQuery.mockResolvedValue(createMockResult([{ archivedCount: 2 }]));

      const result = await service.summarizeProject(
        'project-1',
        'workspace-1',
      );

      expect(result.episodesArchived).toBe(2);
    });

    it('should handle empty eligible episodes (returns zero summaries)', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([
        decisionEpisode,
        pinnedEpisode,
        recentEpisode,
      ]);

      const result = await service.summarizeProject(
        'project-1',
        'workspace-1',
      );

      expect(result.summariesCreated).toBe(0);
      expect(result.episodesArchived).toBe(0);
      expect(result.totalProcessed).toBe(0);
    });

    it('should create summaries for multiple months', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([
        eligibleFact,    // Dec 2025
        eligiblePreference, // Nov 2025
        janFact,          // Jan 2026
      ]);
      // storeSummary returns empty result, archiveEpisodes returns count for each batch
      mockNeo4jService.runQuery.mockResolvedValue(createMockResult([{ archivedCount: 1 }]));

      const result = await service.summarizeProject(
        'project-1',
        'workspace-1',
      );

      // 3 months = 3 summaries
      expect(result.summariesCreated).toBe(3);
      expect(result.episodesArchived).toBe(3);
    });
  });

  // ─── Event and Stats Tests ──────────────────────────────────────────────────

  describe('event emission', () => {
    it('should emit memory:summarization_completed event with SummarizationResult', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([eligibleFact]);
      mockNeo4jService.runQuery.mockResolvedValue(createMockResult([{ archivedCount: 1 }]));

      await service.summarizeProject('project-1', 'workspace-1');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'memory:summarization_completed',
        expect.objectContaining({
          summariesCreated: expect.any(Number),
          episodesArchived: expect.any(Number),
          totalProcessed: expect.any(Number),
          durationMs: expect.any(Number),
          skipped: false,
          errors: expect.any(Array),
        }),
      );
    });

    it('should emit event even with zero eligible episodes', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);

      await service.summarizeProject('project-1', 'workspace-1');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'memory:summarization_completed',
        expect.any(Object),
      );
    });
  });

  describe('getSummarizationStats', () => {
    it('should return correct episode counts and summary counts', async () => {
      mockNeo4jService.runQuery
        .mockResolvedValueOnce(
          createMockResult([
            { totalSummaries: 5, oldest: '2025-10-01', newest: '2025-12-01' },
          ]),
        )
        .mockResolvedValueOnce(
          createMockResult([{ archivedCount: 100 }]),
        )
        .mockResolvedValueOnce(
          createMockResult([{ activeCount: 500 }]),
        );

      const stats = await service.getSummarizationStats(
        'project-1',
        'workspace-1',
      );

      expect(stats.totalSummaries).toBe(5);
      expect(stats.totalArchivedEpisodes).toBe(100);
      expect(stats.activeEpisodes).toBe(500);
      expect(stats.oldestSummary).not.toBeNull();
      expect(stats.newestSummary).not.toBeNull();
    });
  });

  describe('getProjectSummaries', () => {
    it('should return all summaries for a project ordered by date', async () => {
      mockNeo4jService.runQuery.mockResolvedValue({
        records: [
          {
            get: jest.fn().mockReturnValue({
              properties: {
                id: 'summary-1',
                projectId: 'project-1',
                workspaceId: 'workspace-1',
                periodStart: '2025-12-01',
                periodEnd: '2025-12-31',
                originalEpisodeCount: 10,
                summary: 'December summary',
                keyDecisions: [],
                keyPatterns: [],
                archivedEpisodeIds: ['ep-1'],
                summarizationModel: 'stub',
                createdAt: '2026-01-15',
                metadata: '{}',
              },
            }),
          },
        ],
      });

      const summaries = await service.getProjectSummaries(
        'project-1',
        'workspace-1',
      );

      expect(summaries).toHaveLength(1);
      expect(summaries[0].id).toBe('summary-1');
      expect(summaries[0].projectId).toBe('project-1');
      expect(summaries[0].summary).toBe('December summary');
    });
  });

  describe('cost metadata tracking', () => {
    it('should track summarization cost metadata (episodes processed, duration, output size)', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([eligibleFact]);
      mockNeo4jService.runQuery.mockResolvedValue(createMockResult([{ archivedCount: 1 }]));

      const result = await service.summarizeProject(
        'project-1',
        'workspace-1',
      );

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.totalProcessed).toBe(1);
      expect(result.summariesCreated).toBe(1);

      // Verify metadata was passed to Neo4j with cost tracking info (now uses MERGE)
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('MERGE (s:MemorySummary'),
        expect.objectContaining({
          metadata: expect.stringContaining('episodesProcessed'),
        }),
      );
    });
  });

  // ─── Error Handling Tests ───────────────────────────────────────────────────

  describe('error handling', () => {
    it('should handle Neo4j errors gracefully (logs warning, returns partial result)', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([eligibleFact]);
      // storeSummary (first call) fails
      mockNeo4jService.runQuery.mockRejectedValue(new Error('Neo4j down'));

      const result = await service.summarizeProject(
        'project-1',
        'workspace-1',
      );

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Neo4j down');
    });

    it('should handle GraphitiService errors gracefully', async () => {
      mockGraphitiService.searchEpisodes.mockRejectedValue(
        new Error('Search failed'),
      );

      const result = await service.summarizeProject(
        'project-1',
        'workspace-1',
      );

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Search failed');
    });

    it('should return errors in SummarizationResult.errors array on failure', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([eligibleFact]);
      // storeSummary query fails
      mockNeo4jService.runQuery.mockRejectedValue(
        new Error('Connection refused'),
      );

      const result = await service.summarizeProject(
        'project-1',
        'workspace-1',
      );

      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Connection refused'),
        ]),
      );
      expect(result.skipped).toBe(false);
    });
  });
});
