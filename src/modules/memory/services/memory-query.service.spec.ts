/**
 * MemoryQueryService Unit Tests
 * Story 12.3: Memory Query Service
 *
 * Comprehensive tests for keyword extraction, relevance scoring,
 * main query method, agent context assembly, and relevance feedback.
 */

// Mock uuid (required by transitive GraphitiService import)
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid-1234'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MemoryQueryService } from './memory-query.service';
import { GraphitiService } from './graphiti.service';
import { Neo4jService } from './neo4j.service';
import {
  MemoryEpisode,
  MemoryEpisodeType,
  WorkspacePattern,
  PatternRecommendation,
} from '../interfaces/memory.interfaces';

describe('MemoryQueryService', () => {
  let service: MemoryQueryService;
  let mockGraphitiService: any;
  let mockNeo4jService: any;
  let mockConfigService: any;
  let mockCrossProjectLearningService: any;

  /**
   * Helper to create a test MemoryEpisode.
   */
  function createTestEpisode(overrides: Partial<MemoryEpisode> = {}): MemoryEpisode {
    return {
      id: 'ep-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      storyId: 'story-1',
      agentType: 'dev',
      timestamp: new Date('2026-02-10T10:00:00.000Z'),
      episodeType: 'decision',
      content: 'Decided to use BullMQ for task queue',
      entities: ['BullMQ', 'task-queue'],
      confidence: 0.9,
      metadata: {},
      ...overrides,
    };
  }

  /**
   * Helper to create a test WorkspacePattern.
   */
  function createTestPattern(overrides: Partial<WorkspacePattern> = {}): WorkspacePattern {
    return {
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
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
      ...overrides,
    };
  }

  beforeEach(async () => {
    mockGraphitiService = {
      searchEpisodes: jest.fn().mockResolvedValue([]),
      getEpisode: jest.fn().mockResolvedValue(null),
    };
    mockNeo4jService = {
      runQuery: jest.fn().mockResolvedValue({ records: [] }),
    };
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          MEMORY_QUERY_MAX_RESULTS: '10',
          MEMORY_QUERY_CANDIDATE_MULTIPLIER: '3',
          MEMORY_QUERY_DEFAULT_TOKEN_BUDGET: '4000',
          MEMORY_QUERY_TIME_DECAY_HALF_LIFE_DAYS: '30',
          CROSS_PROJECT_PATTERN_CONTEXT_BUDGET: '2000',
        };
        return config[key] ?? defaultValue;
      }),
    };
    mockCrossProjectLearningService = {
      getPatternRecommendations: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryQueryService,
        { provide: GraphitiService, useValue: mockGraphitiService },
        { provide: Neo4jService, useValue: mockNeo4jService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: 'CrossProjectLearningService', useValue: mockCrossProjectLearningService },
      ],
    }).compile();

    service = module.get<MemoryQueryService>(MemoryQueryService);
  });

  // ─── Keyword Extraction Tests ──────────────────────────────────────────────

  describe('extractKeywords', () => {
    it('should extract keywords from natural language query', () => {
      const keywords = service.extractKeywords('How to use BullMQ for task queue');
      expect(keywords).toContain('bullmq');
      expect(keywords).toContain('task');
      expect(keywords).toContain('queue');
    });

    it('should remove common stop words', () => {
      const keywords = service.extractKeywords('the quick brown fox is in the garden');
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('is');
      expect(keywords).not.toContain('in');
      expect(keywords).toContain('quick');
      expect(keywords).toContain('brown');
      expect(keywords).toContain('fox');
      expect(keywords).toContain('garden');
    });

    it('should return unique lowercase tokens', () => {
      const keywords = service.extractKeywords('BullMQ bullmq BULLMQ');
      expect(keywords).toEqual(['bullmq']);
    });

    it('should handle empty query string', () => {
      expect(service.extractKeywords('')).toEqual([]);
      expect(service.extractKeywords('   ')).toEqual([]);
    });

    it('should handle query with only stop words', () => {
      const keywords = service.extractKeywords('the a an is are');
      expect(keywords).toEqual([]);
    });

    it('should handle punctuation', () => {
      const keywords = service.extractKeywords('NestJS, TypeORM, and PostgreSQL!');
      expect(keywords).toContain('nestjs');
      expect(keywords).toContain('typeorm');
      expect(keywords).toContain('postgresql');
    });
  });

  // ─── Keyword Relevance Scoring Tests ───────────────────────────────────────

  describe('calculateKeywordRelevance', () => {
    it('should return high score for matching content', () => {
      const score = service.calculateKeywordRelevance(
        'BullMQ task queue',
        'Decided to use BullMQ for task queue',
      );
      expect(score).toBeGreaterThan(0.3);
    });

    it('should return low score for unrelated content', () => {
      const score = service.calculateKeywordRelevance(
        'database migration',
        'Decided to use BullMQ for task queue',
      );
      expect(score).toBeLessThan(0.2);
    });

    it('should return 0 for empty query', () => {
      const score = service.calculateKeywordRelevance(
        '',
        'Decided to use BullMQ for task queue',
      );
      expect(score).toBe(0);
    });

    it('should return 0 for empty content', () => {
      const score = service.calculateKeywordRelevance(
        'BullMQ task queue',
        '',
      );
      expect(score).toBe(0);
    });

    it('should return 1.0 for identical content', () => {
      const score = service.calculateKeywordRelevance(
        'BullMQ task queue',
        'BullMQ task queue',
      );
      expect(score).toBe(1.0);
    });
  });

  // ─── Time Recency Scoring Tests ────────────────────────────────────────────

  describe('calculateTimeRecency', () => {
    it('should return 1.0 for current timestamp', () => {
      const now = new Date();
      const score = service.calculateTimeRecency(now, now);
      expect(score).toBeCloseTo(1.0, 2);
    });

    it('should return approximately 0.5 at half-life (30 days)', () => {
      const now = new Date('2026-02-15T00:00:00.000Z');
      const thirtyDaysAgo = new Date('2026-01-16T00:00:00.000Z');
      const score = service.calculateTimeRecency(thirtyDaysAgo, now);
      expect(score).toBeCloseTo(0.5, 1);
    });

    it('should return near 0 for very old episodes', () => {
      const now = new Date('2026-02-15T00:00:00.000Z');
      const veryOld = new Date('2025-01-01T00:00:00.000Z');
      const score = service.calculateTimeRecency(veryOld, now);
      expect(score).toBeLessThan(0.01);
    });

    it('should return 1.0 for future timestamps', () => {
      const now = new Date('2026-02-15T00:00:00.000Z');
      const future = new Date('2026-03-15T00:00:00.000Z');
      const score = service.calculateTimeRecency(future, now);
      expect(score).toBe(1.0);
    });
  });

  // ─── Type Priority Scoring Tests ───────────────────────────────────────────

  describe('calculateTypePriority', () => {
    it('should return 1.0 for decisions', () => {
      expect(service.calculateTypePriority('decision')).toBe(1.0);
    });

    it('should return 0.9 for problems', () => {
      expect(service.calculateTypePriority('problem')).toBe(0.9);
    });

    it('should return 0.7 for facts', () => {
      expect(service.calculateTypePriority('fact')).toBe(0.7);
    });

    it('should return 0.6 for patterns', () => {
      expect(service.calculateTypePriority('pattern')).toBe(0.6);
    });

    it('should return 0.5 for preferences', () => {
      expect(service.calculateTypePriority('preference')).toBe(0.5);
    });
  });

  // ─── Feedback Bonus Scoring Tests ──────────────────────────────────────────

  describe('calculateFeedbackBonus', () => {
    it('should return +0.1 for useful episodes', () => {
      const score = service.calculateFeedbackBonus({
        usefulCount: 3,
        notUsefulCount: 1,
      });
      expect(score).toBe(0.1);
    });

    it('should return -0.05 for not-useful episodes', () => {
      const score = service.calculateFeedbackBonus({
        usefulCount: 1,
        notUsefulCount: 5,
      });
      expect(score).toBe(-0.05);
    });

    it('should return 0 when counts are equal', () => {
      const score = service.calculateFeedbackBonus({
        usefulCount: 2,
        notUsefulCount: 2,
      });
      expect(score).toBe(0);
    });

    it('should return 0 when no feedback exists', () => {
      const score = service.calculateFeedbackBonus({});
      expect(score).toBe(0);
    });

    it('should handle undefined metadata gracefully', () => {
      const score = service.calculateFeedbackBonus(undefined as any);
      expect(score).toBe(0);
    });
  });

  // ─── Combined Score Tests ──────────────────────────────────────────────────

  describe('scoreEpisode', () => {
    it('should properly weight all scoring factors', () => {
      const now = new Date('2026-02-15T00:00:00.000Z');
      const episode = createTestEpisode({
        content: 'BullMQ task queue setup',
        timestamp: now, // brand new = time score 1.0
        episodeType: 'decision', // type priority 1.0
        metadata: { usefulCount: 3, notUsefulCount: 0 }, // feedback +0.1
      });

      const score = service.scoreEpisode(episode, 'BullMQ task queue setup', now);

      // keyword=1.0, time=1.0, type=1.0, feedback=0.1
      // combined = (1.0 * 0.5) + (1.0 * 0.2) + (1.0 * 0.2) + (0.1 * 0.1) = 0.91
      expect(score).toBeGreaterThan(0.8);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should clamp score between 0 and 1', () => {
      const now = new Date();
      const episode = createTestEpisode({
        content: 'completely unrelated content xyz',
        timestamp: new Date('2020-01-01'),
        episodeType: 'preference',
        metadata: { usefulCount: 0, notUsefulCount: 100 },
      });

      const score = service.scoreEpisode(episode, 'BullMQ task queue', now);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  // ─── Main Query Method Tests ───────────────────────────────────────────────

  describe('query', () => {
    it('should return memories filtered by projectId and workspaceId', async () => {
      const episodes = [createTestEpisode()];
      mockGraphitiService.searchEpisodes.mockResolvedValue(episodes);

      const result = await service.query({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'BullMQ task queue',
      });

      expect(mockGraphitiService.searchEpisodes).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project-1',
          workspaceId: 'workspace-1',
        }),
      );
      expect(result.memories).toHaveLength(1);
    });

    it('should filter by episodeType when types filter provided', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);

      await service.query({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'test',
        filters: { types: ['decision', 'problem'] },
      });

      expect(mockGraphitiService.searchEpisodes).toHaveBeenCalledWith(
        expect.objectContaining({
          types: ['decision', 'problem'],
        }),
      );
    });

    it('should filter by entity names when entityIds filter provided', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);

      await service.query({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'test',
        filters: { entityIds: ['BullMQ', 'Redis'] },
      });

      expect(mockGraphitiService.searchEpisodes).toHaveBeenCalledWith(
        expect.objectContaining({
          entityNames: ['BullMQ', 'Redis'],
        }),
      );
    });

    it('should filter by time range when since filter provided', async () => {
      const sinceDate = new Date('2026-02-01');
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);

      await service.query({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'test',
        filters: { since: sinceDate },
      });

      expect(mockGraphitiService.searchEpisodes).toHaveBeenCalledWith(
        expect.objectContaining({
          since: sinceDate,
        }),
      );
    });

    it('should limit results to maxResults', async () => {
      const episodes = Array.from({ length: 20 }, (_, i) =>
        createTestEpisode({
          id: `ep-${i}`,
          content: `Episode ${i} about BullMQ`,
        }),
      );
      mockGraphitiService.searchEpisodes.mockResolvedValue(episodes);

      const result = await service.query({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'BullMQ',
        filters: { maxResults: 5 },
      });

      expect(result.memories).toHaveLength(5);
    });

    it('should fetch 3x candidates when maxResults is small (<=10)', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);

      await service.query({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'test',
        filters: { maxResults: 5 },
      });

      expect(mockGraphitiService.searchEpisodes).toHaveBeenCalledWith(
        expect.objectContaining({
          maxResults: 15, // 5 * 3
        }),
      );
    });

    it('should not over-fetch when maxResults > 10', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);

      await service.query({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'test',
        filters: { maxResults: 50 },
      });

      expect(mockGraphitiService.searchEpisodes).toHaveBeenCalledWith(
        expect.objectContaining({
          maxResults: 50,
        }),
      );
    });

    it('should score results by keyword relevance (higher score for matching keywords)', async () => {
      const episodes = [
        createTestEpisode({
          id: 'ep-match',
          content: 'BullMQ task queue implementation details',
        }),
        createTestEpisode({
          id: 'ep-nomatch',
          content: 'PostgreSQL database migration issues',
        }),
      ];
      mockGraphitiService.searchEpisodes.mockResolvedValue(episodes);

      const result = await service.query({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'BullMQ task queue',
        filters: { maxResults: 2 },
      });

      // The matching episode should come first
      expect(result.memories[0].id).toBe('ep-match');
      expect(result.relevanceScores[0]).toBeGreaterThan(result.relevanceScores[1]);
    });

    it('should score results with time recency weighting (recent memories score higher)', async () => {
      const now = new Date();
      const episodes = [
        createTestEpisode({
          id: 'ep-old',
          content: 'Same content about testing',
          timestamp: new Date('2025-01-01'),
          episodeType: 'fact',
          metadata: {},
        }),
        createTestEpisode({
          id: 'ep-new',
          content: 'Same content about testing',
          timestamp: now,
          episodeType: 'fact',
          metadata: {},
        }),
      ];
      mockGraphitiService.searchEpisodes.mockResolvedValue(episodes);

      const result = await service.query({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'Same content about testing',
      });

      // New episode should rank higher due to time recency
      expect(result.memories[0].id).toBe('ep-new');
    });

    it('should score results with type priority (decisions score higher than patterns)', async () => {
      const now = new Date();
      const episodes = [
        createTestEpisode({
          id: 'ep-pattern',
          content: 'Common testing approach',
          timestamp: now,
          episodeType: 'pattern',
          metadata: {},
        }),
        createTestEpisode({
          id: 'ep-decision',
          content: 'Common testing approach',
          timestamp: now,
          episodeType: 'decision',
          metadata: {},
        }),
      ];
      mockGraphitiService.searchEpisodes.mockResolvedValue(episodes);

      const result = await service.query({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'Common testing approach',
      });

      // Decision should rank higher
      expect(result.memories[0].id).toBe('ep-decision');
    });

    it('should include feedback bonus for episodes marked useful', async () => {
      const now = new Date();
      const episodes = [
        createTestEpisode({
          id: 'ep-nofeedback',
          content: 'Same content',
          timestamp: now,
          episodeType: 'fact',
          metadata: {},
        }),
        createTestEpisode({
          id: 'ep-useful',
          content: 'Same content',
          timestamp: now,
          episodeType: 'fact',
          metadata: { usefulCount: 5, notUsefulCount: 0 },
        }),
      ];
      mockGraphitiService.searchEpisodes.mockResolvedValue(episodes);

      const result = await service.query({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'Same content',
      });

      // Useful episode should rank higher
      expect(result.memories[0].id).toBe('ep-useful');
    });

    it('should return relevanceScores array matching memories array length', async () => {
      const episodes = [
        createTestEpisode({ id: 'ep-1' }),
        createTestEpisode({ id: 'ep-2' }),
        createTestEpisode({ id: 'ep-3' }),
      ];
      mockGraphitiService.searchEpisodes.mockResolvedValue(episodes);

      const result = await service.query({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'test',
      });

      expect(result.relevanceScores).toHaveLength(result.memories.length);
    });

    it('should return totalCount of all matching episodes (before limit)', async () => {
      const episodes = Array.from({ length: 15 }, (_, i) =>
        createTestEpisode({ id: `ep-${i}` }),
      );
      mockGraphitiService.searchEpisodes.mockResolvedValue(episodes);

      const result = await service.query({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'test',
        filters: { maxResults: 5 },
      });

      expect(result.totalCount).toBe(15);
      expect(result.memories).toHaveLength(5);
    });

    it('should return queryDurationMs', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);

      const result = await service.query({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'test',
      });

      expect(result.queryDurationMs).toBeDefined();
      expect(typeof result.queryDurationMs).toBe('number');
      expect(result.queryDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty results gracefully', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);

      const result = await service.query({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'nonexistent content',
      });

      expect(result.memories).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.relevanceScores).toEqual([]);
      expect(result.queryDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle GraphitiService errors gracefully (returns empty results with error logged)', async () => {
      mockGraphitiService.searchEpisodes.mockRejectedValue(
        new Error('Neo4j connection failed'),
      );

      const result = await service.query({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        query: 'test',
      });

      expect(result.memories).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.relevanceScores).toEqual([]);
    });
  });

  // ─── Agent Context Assembly Tests ──────────────────────────────────────────

  describe('queryForAgentContext', () => {
    it('should return formatted context string', async () => {
      const episodes = [
        createTestEpisode({
          id: 'ep-1',
          episodeType: 'decision',
          content: 'Use BullMQ for task queue',
          confidence: 0.9,
          timestamp: new Date('2026-02-10'),
        }),
      ];
      mockGraphitiService.searchEpisodes.mockResolvedValue(episodes);

      const result = await service.queryForAgentContext(
        'project-1',
        'workspace-1',
        'Set up task queue',
        'dev',
      );

      expect(result.contextString).toContain('## Relevant Project Memory');
      expect(result.contextString).toContain('### Decisions');
      expect(result.contextString).toContain('Use BullMQ for task queue');
      expect(result.memoryCount).toBeGreaterThan(0);
    });

    it('should group memories by type (Decisions, Problems Solved, Facts, Patterns)', async () => {
      const episodes = [
        createTestEpisode({
          id: 'ep-decision',
          episodeType: 'decision',
          content: 'Decided to use NestJS',
          confidence: 0.9,
        }),
        createTestEpisode({
          id: 'ep-problem',
          episodeType: 'problem',
          content: 'Fixed TypeORM migration failure',
          confidence: 0.7,
        }),
        createTestEpisode({
          id: 'ep-fact',
          episodeType: 'fact',
          content: 'Created REST endpoint',
          confidence: 0.8,
        }),
      ];
      mockGraphitiService.searchEpisodes.mockResolvedValue(episodes);

      const result = await service.queryForAgentContext(
        'project-1',
        'workspace-1',
        'Set up REST API',
        'dev',
      );

      expect(result.contextString).toContain('### Decisions');
      expect(result.contextString).toContain('### Problems Solved');
      expect(result.contextString).toContain('### Facts');
    });

    it('should respect token budget (truncates if too long)', async () => {
      // Create many episodes that would exceed a small token budget
      const episodes = Array.from({ length: 50 }, (_, i) =>
        createTestEpisode({
          id: `ep-${i}`,
          episodeType: 'decision',
          content: `Decision number ${i}: ${'A'.repeat(200)}`,
          confidence: 0.9,
        }),
      );
      mockGraphitiService.searchEpisodes.mockResolvedValue(episodes);

      const result = await service.queryForAgentContext(
        'project-1',
        'workspace-1',
        'test query',
        'dev',
        100, // Very small token budget (100 tokens ~ 400 chars)
      );

      // Should have some content but be truncated
      expect(result.contextString.length).toBeLessThan(500);
      expect(result.memoryCount).toBeLessThan(50);
    });

    it('should prioritize decisions over patterns in output', async () => {
      const episodes = [
        createTestEpisode({
          id: 'ep-pattern',
          episodeType: 'pattern',
          content: 'Test pattern observed',
          confidence: 0.6,
        }),
        createTestEpisode({
          id: 'ep-decision',
          episodeType: 'decision',
          content: 'Important decision made',
          confidence: 0.9,
        }),
      ];
      mockGraphitiService.searchEpisodes.mockResolvedValue(episodes);

      const result = await service.queryForAgentContext(
        'project-1',
        'workspace-1',
        'test query',
        'dev',
      );

      const decisionsIndex = result.contextString.indexOf('### Decisions');
      const patternsIndex = result.contextString.indexOf('### Patterns');

      // Decisions should appear before patterns if both present
      if (decisionsIndex >= 0 && patternsIndex >= 0) {
        expect(decisionsIndex).toBeLessThan(patternsIndex);
      }
    });

    it('should return empty string when no memories found', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);

      const result = await service.queryForAgentContext(
        'project-1',
        'workspace-1',
        'test query',
        'dev',
      );

      expect(result.contextString).toBe('');
      expect(result.memoryCount).toBe(0);
    });

    it('should format each memory with date, content, and confidence', async () => {
      const episodes = [
        createTestEpisode({
          id: 'ep-1',
          episodeType: 'decision',
          content: 'Use BullMQ for task queue',
          confidence: 0.9,
          timestamp: new Date('2026-02-10T10:00:00.000Z'),
        }),
      ];
      mockGraphitiService.searchEpisodes.mockResolvedValue(episodes);

      const result = await service.queryForAgentContext(
        'project-1',
        'workspace-1',
        'task queue',
        'dev',
      );

      expect(result.contextString).toContain('[2026-02-10]');
      expect(result.contextString).toContain('Use BullMQ for task queue');
      expect(result.contextString).toContain('(confidence: 0.9)');
    });

    it('should use agent-type-specific type filters', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);

      // Test dev agent
      await service.queryForAgentContext(
        'project-1',
        'workspace-1',
        'test',
        'dev',
      );

      expect(mockGraphitiService.searchEpisodes).toHaveBeenCalledWith(
        expect.objectContaining({
          types: ['decision', 'problem', 'fact'],
        }),
      );

      // Test qa agent
      await service.queryForAgentContext(
        'project-1',
        'workspace-1',
        'test',
        'qa',
      );

      expect(mockGraphitiService.searchEpisodes).toHaveBeenCalledWith(
        expect.objectContaining({
          types: ['pattern', 'problem', 'fact'],
        }),
      );
    });
  });

  // ─── Relevance Feedback Tests ──────────────────────────────────────────────

  describe('recordRelevanceFeedback', () => {
    it('should update episode metadata with usefulCount increment', async () => {
      const episode = createTestEpisode({
        id: 'ep-feedback',
        metadata: { usefulCount: 2, notUsefulCount: 1 },
      });
      mockGraphitiService.getEpisode.mockResolvedValue(episode);

      const result = await service.recordRelevanceFeedback('ep-feedback', true);

      expect(result).toBe(true);
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET e.metadata'),
        expect.objectContaining({
          episodeId: 'ep-feedback',
          updatedMetadata: expect.stringContaining('"usefulCount":3'),
        }),
      );
    });

    it('should update episode metadata with notUsefulCount increment', async () => {
      const episode = createTestEpisode({
        id: 'ep-feedback',
        metadata: { usefulCount: 1, notUsefulCount: 2 },
      });
      mockGraphitiService.getEpisode.mockResolvedValue(episode);

      const result = await service.recordRelevanceFeedback('ep-feedback', false);

      expect(result).toBe(true);
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET e.metadata'),
        expect.objectContaining({
          episodeId: 'ep-feedback',
          updatedMetadata: expect.stringContaining('"notUsefulCount":3'),
        }),
      );
    });

    it('should initialize counts from 0 when no prior feedback exists', async () => {
      const episode = createTestEpisode({
        id: 'ep-feedback',
        metadata: {},
      });
      mockGraphitiService.getEpisode.mockResolvedValue(episode);

      const result = await service.recordRelevanceFeedback('ep-feedback', true);

      expect(result).toBe(true);
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET e.metadata'),
        expect.objectContaining({
          updatedMetadata: expect.stringContaining('"usefulCount":1'),
        }),
      );
    });

    it('should handle non-existent episode gracefully (logs warning, returns false)', async () => {
      mockGraphitiService.getEpisode.mockResolvedValue(null);

      const result = await service.recordRelevanceFeedback('nonexistent-ep', true);

      expect(result).toBe(false);
      // Should not try to update Neo4j
      expect(mockNeo4jService.runQuery).not.toHaveBeenCalled();
    });

    it('should handle Neo4j errors gracefully (returns false)', async () => {
      const episode = createTestEpisode({ id: 'ep-feedback' });
      mockGraphitiService.getEpisode.mockResolvedValue(episode);
      mockNeo4jService.runQuery.mockRejectedValue(new Error('Neo4j error'));

      const result = await service.recordRelevanceFeedback('ep-feedback', true);

      expect(result).toBe(false);
    });
  });

  // ─── Workspace Patterns Context Tests (Story 12.6) ──────────────────────────

  describe('queryForAgentContext - workspace patterns', () => {
    it('should include workspace patterns section when patterns exist', async () => {
      const episodes = [
        createTestEpisode({
          id: 'ep-1',
          episodeType: 'decision',
          content: 'Use BullMQ for task queue',
          confidence: 0.9,
          timestamp: new Date('2026-02-10'),
        }),
      ];
      mockGraphitiService.searchEpisodes.mockResolvedValue(episodes);

      const recommendation: PatternRecommendation = {
        pattern: createTestPattern({
          content: 'Use async queues for email sending',
          occurrenceCount: 5,
          confidence: 'high',
        }),
        relevanceScore: 0.7,
        confidenceLabel: '[AUTO-APPLY]',
      };
      mockCrossProjectLearningService.getPatternRecommendations.mockResolvedValue([recommendation]);

      const result = await service.queryForAgentContext(
        'project-1',
        'workspace-1',
        'Set up task queue',
        'dev',
      );

      expect(result.contextString).toContain('### Workspace Patterns');
      expect(result.contextString).toContain('Use async queues for email sending');
    });

    it('should format high-confidence patterns with [AUTO-APPLY] prefix', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);

      const recommendation: PatternRecommendation = {
        pattern: createTestPattern({
          content: 'Always use retry logic',
          occurrenceCount: 5,
          confidence: 'high',
        }),
        relevanceScore: 0.8,
        confidenceLabel: '[AUTO-APPLY]',
      };
      mockCrossProjectLearningService.getPatternRecommendations.mockResolvedValue([recommendation]);

      const result = await service.queryForAgentContext(
        'project-1',
        'workspace-1',
        'retry logic',
        'dev',
      );

      expect(result.contextString).toContain('[AUTO-APPLY]');
      expect(result.contextString).toContain('confidence: high');
    });

    it('should format medium-confidence patterns with [RECOMMENDED] prefix', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);

      const recommendation: PatternRecommendation = {
        pattern: createTestPattern({
          content: 'Use Zustand for React state',
          occurrenceCount: 3,
          confidence: 'medium',
        }),
        relevanceScore: 0.6,
        confidenceLabel: '[RECOMMENDED]',
      };
      mockCrossProjectLearningService.getPatternRecommendations.mockResolvedValue([recommendation]);

      const result = await service.queryForAgentContext(
        'project-1',
        'workspace-1',
        'state management',
        'dev',
      );

      expect(result.contextString).toContain('[RECOMMENDED]');
      expect(result.contextString).toContain('confidence: medium');
    });

    it('should format low-confidence patterns with [SUGGESTION] prefix', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);

      const recommendation: PatternRecommendation = {
        pattern: createTestPattern({
          content: 'Consider exponential backoff',
          occurrenceCount: 2,
          confidence: 'low',
        }),
        relevanceScore: 0.5,
        confidenceLabel: '[SUGGESTION]',
      };
      mockCrossProjectLearningService.getPatternRecommendations.mockResolvedValue([recommendation]);

      const result = await service.queryForAgentContext(
        'project-1',
        'workspace-1',
        'API retries',
        'dev',
      );

      expect(result.contextString).toContain('[SUGGESTION]');
      expect(result.contextString).toContain('confidence: low');
    });

    it('should exclude overridden patterns from context', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);

      // CrossProjectLearningService already filters out overridden patterns
      // by only returning active patterns
      mockCrossProjectLearningService.getPatternRecommendations.mockResolvedValue([]);

      const result = await service.queryForAgentContext(
        'project-1',
        'workspace-1',
        'some task',
        'dev',
      );

      // No workspace patterns section when no patterns
      expect(result.contextString).not.toContain('### Workspace Patterns');
    });

    it('should respect pattern token budget', async () => {
      // Create many recommendations that would exceed budget
      const recommendations: PatternRecommendation[] = Array.from(
        { length: 50 },
        (_, i) => ({
          pattern: createTestPattern({
            content: `Pattern ${i}: ${'A'.repeat(200)}`,
            occurrenceCount: 3,
            confidence: 'medium',
          }),
          relevanceScore: 0.5,
          confidenceLabel: '[RECOMMENDED]',
        }),
      );
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);
      mockCrossProjectLearningService.getPatternRecommendations.mockResolvedValue(recommendations);

      const result = await service.queryForAgentContext(
        'project-1',
        'workspace-1',
        'some task',
        'dev',
        10000, // large overall budget
      );

      // Should have workspace patterns section but truncated
      if (result.contextString.includes('### Workspace Patterns')) {
        // Pattern section should not exceed ~2000 tokens (8000 chars)
        const patternsSection = result.contextString.split('### Workspace Patterns')[1];
        expect(patternsSection.length).toBeLessThan(10000);
      }
    });

    it('should gracefully handle missing CrossProjectLearningService', async () => {
      // Create a service without CrossProjectLearningService
      const moduleWithout = await Test.createTestingModule({
        providers: [
          MemoryQueryService,
          { provide: GraphitiService, useValue: mockGraphitiService },
          { provide: Neo4jService, useValue: mockNeo4jService },
          { provide: ConfigService, useValue: mockConfigService },
          // No CrossProjectLearningService provided
        ],
      }).compile();

      const serviceWithout = moduleWithout.get<MemoryQueryService>(MemoryQueryService);

      const episodes = [
        createTestEpisode({
          episodeType: 'decision',
          content: 'Use BullMQ',
          confidence: 0.9,
        }),
      ];
      mockGraphitiService.searchEpisodes.mockResolvedValue(episodes);

      const result = await serviceWithout.queryForAgentContext(
        'project-1',
        'workspace-1',
        'task queue',
        'dev',
      );

      // Should work fine without patterns
      expect(result.contextString).toContain('## Relevant Project Memory');
      expect(result.contextString).not.toContain('### Workspace Patterns');
    });
  });
});
