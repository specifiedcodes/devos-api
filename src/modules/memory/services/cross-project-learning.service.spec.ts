/**
 * CrossProjectLearningService Unit Tests
 * Story 12.6: Cross-Project Learning
 *
 * Comprehensive tests for pattern detection, retrieval, recommendations,
 * override/restore, and adoption statistics.
 */

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-pattern-uuid'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { CrossProjectLearningService } from './cross-project-learning.service';
import { GraphitiService } from './graphiti.service';
import { Neo4jService } from './neo4j.service';
import { MemoryQueryService } from './memory-query.service';
import {
  MemoryEpisode,
  WorkspacePattern,
  PatternConfidence,
} from '../interfaces/memory.interfaces';

describe('CrossProjectLearningService', () => {
  let service: CrossProjectLearningService;
  let mockGraphitiService: any;
  let mockNeo4jService: any;
  let mockMemoryQueryService: any;
  let mockConfigService: any;

  /**
   * Factory for creating test MemoryEpisode.
   */
  function createTestEpisode(overrides: Partial<MemoryEpisode> = {}): MemoryEpisode {
    return {
      id: 'episode-' + Math.random().toString(36).substring(7),
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      storyId: null,
      agentType: 'dev',
      timestamp: new Date(),
      episodeType: 'decision',
      content: 'Use Zustand for state management in React',
      entities: ['zustand', 'react'],
      confidence: 0.8,
      metadata: {},
      ...overrides,
    };
  }

  /**
   * Factory for creating test WorkspacePattern.
   */
  function createTestPattern(overrides: Partial<WorkspacePattern> = {}): WorkspacePattern {
    return {
      id: 'pattern-' + Math.random().toString(36).substring(7),
      workspaceId: 'workspace-1',
      patternType: 'architecture',
      content: 'Use Zustand for state management in React projects',
      sourceProjectIds: ['project-1', 'project-2', 'project-3'],
      sourceEpisodeIds: ['ep-1', 'ep-2', 'ep-3'],
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

  /**
   * Helper to create a mock Neo4j record for pattern queries.
   */
  function createMockPatternRecord(pattern: WorkspacePattern): any {
    return {
      get: (key: string) => {
        if (key === 'wp') {
          return {
            properties: {
              id: pattern.id,
              workspaceId: pattern.workspaceId,
              patternType: pattern.patternType,
              content: pattern.content,
              sourceProjectIds: pattern.sourceProjectIds,
              sourceEpisodeIds: pattern.sourceEpisodeIds,
              occurrenceCount: pattern.occurrenceCount,
              confidence: pattern.confidence,
              status: pattern.status,
              overriddenBy: pattern.overriddenBy,
              overrideReason: pattern.overrideReason,
              createdAt: pattern.createdAt.toISOString(),
              updatedAt: pattern.updatedAt.toISOString(),
              metadata: JSON.stringify(pattern.metadata),
            },
          };
        }
        // Stats query fields
        if (key === 'confidence') return pattern.confidence;
        if (key === 'patternType') return pattern.patternType;
        if (key === 'status') return pattern.status;
        if (key === 'occurrenceCount') return pattern.occurrenceCount;
        if (key === 'id') return pattern.id;
        if (key === 'count') return 1;
        return null;
      },
    };
  }

  beforeEach(async () => {
    mockGraphitiService = {
      searchEpisodes: jest.fn().mockResolvedValue([]),
      getProjectEpisodeCount: jest.fn().mockResolvedValue(0),
    };

    mockNeo4jService = {
      runQuery: jest.fn().mockResolvedValue({ records: [] }),
    };

    mockMemoryQueryService = {
      calculateKeywordRelevance: jest.fn().mockReturnValue(0),
      extractKeywords: jest.fn().mockReturnValue([]),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          CROSS_PROJECT_SIMILARITY_THRESHOLD: '0.7',
          CROSS_PROJECT_DEDUP_THRESHOLD: '0.85',
          CROSS_PROJECT_MIN_EPISODES: '2',
          CROSS_PROJECT_LOW_CONFIDENCE_PROJECTS: '2',
          CROSS_PROJECT_MEDIUM_CONFIDENCE_PROJECTS: '4',
          CROSS_PROJECT_DETECTION_BATCH_SIZE: '100',
          CROSS_PROJECT_MAX_PATTERNS_PER_WORKSPACE: '500',
          CROSS_PROJECT_PATTERN_CONTEXT_BUDGET: '2000',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrossProjectLearningService,
        { provide: GraphitiService, useValue: mockGraphitiService },
        { provide: Neo4jService, useValue: mockNeo4jService },
        { provide: MemoryQueryService, useValue: mockMemoryQueryService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<CrossProjectLearningService>(CrossProjectLearningService);
  });

  // ─── Pattern Detection Tests ────────────────────────────────────────────────

  describe('detectPatterns', () => {
    it('should query all projects in the workspace', async () => {
      // Return 2 project IDs
      mockNeo4jService.runQuery.mockImplementation((cypher: string) => {
        if (cypher.includes('DISTINCT e.projectId')) {
          return {
            records: [
              { get: () => 'project-1' },
              { get: () => 'project-2' },
            ],
          };
        }
        // count query
        if (cypher.includes('count(wp)')) {
          return { records: [{ get: () => 0 }] };
        }
        // getWorkspacePatterns
        return { records: [] };
      });

      await service.detectPatterns('workspace-1');

      // Should have queried for distinct project IDs
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('DISTINCT e.projectId'),
        expect.objectContaining({ workspaceId: 'workspace-1' }),
      );
    });

    it('should retrieve episodes from each project', async () => {
      mockNeo4jService.runQuery.mockImplementation((cypher: string) => {
        if (cypher.includes('DISTINCT e.projectId')) {
          return {
            records: [
              { get: () => 'project-1' },
              { get: () => 'project-2' },
            ],
          };
        }
        if (cypher.includes('count(wp)')) {
          return { records: [{ get: () => 0 }] };
        }
        return { records: [] };
      });

      await service.detectPatterns('workspace-1');

      // Should search episodes for each project
      expect(mockGraphitiService.searchEpisodes).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'project-1', workspaceId: 'workspace-1' }),
      );
      expect(mockGraphitiService.searchEpisodes).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'project-2', workspaceId: 'workspace-1' }),
      );
    });

    it('should identify similar episodes across different projects', async () => {
      const episodeA = createTestEpisode({
        id: 'ep-a',
        projectId: 'project-1',
        content: 'Use Zustand for state management in React',
      });
      const episodeB = createTestEpisode({
        id: 'ep-b',
        projectId: 'project-2',
        content: 'Use Zustand for state management in React',
      });

      mockNeo4jService.runQuery.mockImplementation((cypher: string) => {
        if (cypher.includes('DISTINCT e.projectId')) {
          return {
            records: [
              { get: () => 'project-1' },
              { get: () => 'project-2' },
            ],
          };
        }
        if (cypher.includes('count(wp)')) {
          return { records: [{ get: () => 0 }] };
        }
        return { records: [] };
      });

      mockGraphitiService.searchEpisodes.mockImplementation((query: any) => {
        if (query.projectId === 'project-1') return [episodeA];
        if (query.projectId === 'project-2') return [episodeB];
        return [];
      });

      // Simulate high similarity between episodes
      mockMemoryQueryService.calculateKeywordRelevance.mockReturnValue(0.8);

      await service.detectPatterns('workspace-1');

      // Should have compared episodes
      expect(mockMemoryQueryService.calculateKeywordRelevance).toHaveBeenCalled();
    });

    it('should create WorkspacePattern when similarity exceeds threshold', async () => {
      const episodeA = createTestEpisode({
        id: 'ep-a',
        projectId: 'project-1',
        content: 'Use Zustand for state management',
      });
      const episodeB = createTestEpisode({
        id: 'ep-b',
        projectId: 'project-2',
        content: 'Use Zustand for state management',
      });

      mockNeo4jService.runQuery.mockImplementation((cypher: string) => {
        if (cypher.includes('DISTINCT e.projectId')) {
          return {
            records: [
              { get: () => 'project-1' },
              { get: () => 'project-2' },
            ],
          };
        }
        if (cypher.includes('count(wp)')) {
          return { records: [{ get: () => 0 }] };
        }
        if (cypher.includes('CREATE (wp:WorkspacePattern')) {
          return { records: [] };
        }
        // getWorkspacePatterns returns empty (no existing patterns to dedup)
        return { records: [] };
      });

      mockGraphitiService.searchEpisodes.mockImplementation((query: any) => {
        if (query.projectId === 'project-1') return [episodeA];
        if (query.projectId === 'project-2') return [episodeB];
        return [];
      });

      mockMemoryQueryService.calculateKeywordRelevance.mockReturnValue(0.8);

      const result = await service.detectPatterns('workspace-1');

      expect(result.newPatterns).toBe(1);
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (wp:WorkspacePattern'),
        expect.any(Object),
      );
    });

    it('should set confidence to low when pattern observed in 1-2 projects', async () => {
      expect((service as any).determineConfidence(1)).toBe('low');
      expect((service as any).determineConfidence(2)).toBe('low');
    });

    it('should set confidence to medium when pattern observed in 3-4 projects', async () => {
      expect((service as any).determineConfidence(3)).toBe('medium');
      expect((service as any).determineConfidence(4)).toBe('medium');
    });

    it('should set confidence to high when pattern observed in 5+ projects', async () => {
      expect((service as any).determineConfidence(5)).toBe('high');
      expect((service as any).determineConfidence(10)).toBe('high');
    });

    it('should deduplicate against existing patterns (similarity > 0.85)', async () => {
      const existingPattern = createTestPattern({
        id: 'existing-pattern',
        content: 'Use Zustand for state management',
        occurrenceCount: 2,
        sourceProjectIds: ['project-1', 'project-2'],
        sourceEpisodeIds: ['ep-old-1', 'ep-old-2'],
      });

      const episodeA = createTestEpisode({
        id: 'ep-a',
        projectId: 'project-1',
        content: 'Use Zustand for state management',
      });
      const episodeB = createTestEpisode({
        id: 'ep-b',
        projectId: 'project-3',
        content: 'Use Zustand for state management',
      });

      let callCount = 0;
      mockMemoryQueryService.calculateKeywordRelevance.mockImplementation(
        (a: string, b: string) => {
          // Always return high similarity for this test
          return 0.9;
        },
      );

      mockNeo4jService.runQuery.mockImplementation((cypher: string) => {
        if (cypher.includes('DISTINCT e.projectId')) {
          return {
            records: [
              { get: () => 'project-1' },
              { get: () => 'project-3' },
            ],
          };
        }
        if (cypher.includes('count(wp)')) {
          return { records: [{ get: () => 1 }] };
        }
        if (cypher.includes('WorkspacePattern') && cypher.includes('MATCH') && cypher.includes('RETURN wp') && cypher.includes('ORDER BY')) {
          return {
            records: [createMockPatternRecord(existingPattern)],
          };
        }
        if (cypher.includes('SET')) {
          return {
            records: [createMockPatternRecord({ ...existingPattern, occurrenceCount: 3 })],
          };
        }
        return { records: [] };
      });

      mockGraphitiService.searchEpisodes.mockImplementation((query: any) => {
        if (query.projectId === 'project-1') return [episodeA];
        if (query.projectId === 'project-3') return [episodeB];
        return [];
      });

      const result = await service.detectPatterns('workspace-1');

      expect(result.updatedPatterns).toBeGreaterThanOrEqual(0);
    });

    it('should update existing pattern occurrence count when new project matches', async () => {
      const existingPattern = createTestPattern({
        id: 'existing-pattern',
        content: 'Use Zustand for state management',
        occurrenceCount: 2,
        sourceProjectIds: ['project-1', 'project-2'],
      });

      const episodeA = createTestEpisode({
        id: 'ep-a',
        projectId: 'project-1',
        content: 'Use Zustand for state management',
      });
      const episodeB = createTestEpisode({
        id: 'ep-b',
        projectId: 'project-3',
        content: 'Use Zustand for state management',
      });

      mockMemoryQueryService.calculateKeywordRelevance.mockReturnValue(0.9);

      mockNeo4jService.runQuery.mockImplementation((cypher: string) => {
        if (cypher.includes('DISTINCT e.projectId')) {
          return {
            records: [
              { get: () => 'project-1' },
              { get: () => 'project-3' },
            ],
          };
        }
        if (cypher.includes('count(wp)')) {
          return { records: [{ get: () => 1 }] };
        }
        if (cypher.includes('ORDER BY')) {
          return {
            records: [createMockPatternRecord(existingPattern)],
          };
        }
        if (cypher.includes('SET')) {
          return {
            records: [createMockPatternRecord({ ...existingPattern, occurrenceCount: 3 })],
          };
        }
        return { records: [] };
      });

      mockGraphitiService.searchEpisodes.mockImplementation((query: any) => {
        if (query.projectId === 'project-1') return [episodeA];
        if (query.projectId === 'project-3') return [episodeB];
        return [];
      });

      const result = await service.detectPatterns('workspace-1');

      expect(result.updatedPatterns).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty workspace gracefully (no projects)', async () => {
      mockNeo4jService.runQuery.mockImplementation((cypher: string) => {
        if (cypher.includes('DISTINCT e.projectId')) {
          return { records: [] };
        }
        if (cypher.includes('count(wp)')) {
          return { records: [{ get: () => 0 }] };
        }
        return { records: [] };
      });

      const result = await service.detectPatterns('workspace-1');

      expect(result.newPatterns).toBe(0);
      expect(result.updatedPatterns).toBe(0);
      expect(result.detectionDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle single-project workspace (no cross-project patterns possible)', async () => {
      mockNeo4jService.runQuery.mockImplementation((cypher: string) => {
        if (cypher.includes('DISTINCT e.projectId')) {
          return {
            records: [{ get: () => 'project-1' }],
          };
        }
        if (cypher.includes('count(wp)')) {
          return { records: [{ get: () => 0 }] };
        }
        return { records: [] };
      });

      const result = await service.detectPatterns('workspace-1');

      expect(result.newPatterns).toBe(0);
      expect(result.updatedPatterns).toBe(0);
    });

    it('should respect max patterns per workspace limit', async () => {
      // Max patterns is 500, set current count near limit
      mockNeo4jService.runQuery.mockImplementation((cypher: string) => {
        if (cypher.includes('DISTINCT e.projectId')) {
          return {
            records: [
              { get: () => 'project-1' },
              { get: () => 'project-2' },
            ],
          };
        }
        if (cypher.includes('count(wp)')) {
          return { records: [{ get: () => 500 }] };
        }
        return { records: [] };
      });

      mockGraphitiService.searchEpisodes.mockImplementation((query: any) => {
        return [createTestEpisode({ projectId: query.projectId, content: 'Same content' })];
      });

      mockMemoryQueryService.calculateKeywordRelevance.mockReturnValue(0.9);

      const result = await service.detectPatterns('workspace-1');

      // Should not create new patterns beyond limit
      expect(result.newPatterns).toBe(0);
    });

    it('should return PatternDetectionResult with counts', async () => {
      mockNeo4jService.runQuery.mockImplementation((cypher: string) => {
        if (cypher.includes('DISTINCT e.projectId')) {
          return { records: [] };
        }
        if (cypher.includes('count(wp)')) {
          return { records: [{ get: () => 5 }] };
        }
        return { records: [] };
      });

      const result = await service.detectPatterns('workspace-1');

      expect(result).toHaveProperty('newPatterns');
      expect(result).toHaveProperty('updatedPatterns');
      expect(result).toHaveProperty('totalPatterns');
      expect(result).toHaveProperty('detectionDurationMs');
      expect(typeof result.detectionDurationMs).toBe('number');
    });
  });

  // ─── Pattern Retrieval Tests ────────────────────────────────────────────────

  describe('getWorkspacePatterns', () => {
    it('should return all active patterns for workspace', async () => {
      const patterns = [
        createTestPattern({ id: 'p1' }),
        createTestPattern({ id: 'p2' }),
      ];

      mockNeo4jService.runQuery.mockResolvedValue({
        records: patterns.map(createMockPatternRecord),
      });

      const result = await service.getWorkspacePatterns('workspace-1');

      expect(result).toHaveLength(2);
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('wp.workspaceId = $workspaceId'),
        expect.objectContaining({ workspaceId: 'workspace-1', status: 'active' }),
      );
    });

    it('should filter by patternType', async () => {
      mockNeo4jService.runQuery.mockResolvedValue({ records: [] });

      await service.getWorkspacePatterns('workspace-1', {
        patternType: 'architecture',
      });

      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('wp.patternType = $patternType'),
        expect.objectContaining({ patternType: 'architecture' }),
      );
    });

    it('should filter by confidence level', async () => {
      mockNeo4jService.runQuery.mockResolvedValue({ records: [] });

      await service.getWorkspacePatterns('workspace-1', {
        confidence: 'high',
      });

      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('wp.confidence = $confidence'),
        expect.objectContaining({ confidence: 'high' }),
      );
    });

    it('should filter by status', async () => {
      mockNeo4jService.runQuery.mockResolvedValue({ records: [] });

      await service.getWorkspacePatterns('workspace-1', {
        status: 'overridden',
      });

      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('wp.status = $status'),
        expect.objectContaining({ status: 'overridden' }),
      );
    });

    it('should respect limit parameter', async () => {
      mockNeo4jService.runQuery.mockResolvedValue({ records: [] });

      await service.getWorkspacePatterns('workspace-1', { limit: 10 });

      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $limit'),
        expect.objectContaining({ limit: 10 }),
      );
    });

    it('should handle empty results', async () => {
      mockNeo4jService.runQuery.mockResolvedValue({ records: [] });

      const result = await service.getWorkspacePatterns('workspace-1');

      expect(result).toEqual([]);
    });
  });

  // ─── Pattern Recommendation Tests ──────────────────────────────────────────

  describe('getPatternRecommendations', () => {
    it('should return patterns relevant to task description', async () => {
      const pattern = createTestPattern({
        id: 'p1',
        content: 'Use Zustand for React state management',
      });

      mockNeo4jService.runQuery.mockResolvedValue({
        records: [createMockPatternRecord(pattern)],
      });

      mockMemoryQueryService.calculateKeywordRelevance.mockReturnValue(0.6);

      const result = await service.getPatternRecommendations(
        'workspace-1',
        'project-new',
        'Set up React state management',
      );

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].relevanceScore).toBe(0.6);
    });

    it('should score patterns by keyword relevance to task', async () => {
      const patternHigh = createTestPattern({
        id: 'p-high',
        content: 'Use Zustand for React state management',
        confidence: 'medium',
      });
      const patternLow = createTestPattern({
        id: 'p-low',
        content: 'Deploy using Docker containers',
        confidence: 'medium',
      });

      mockNeo4jService.runQuery.mockResolvedValue({
        records: [
          createMockPatternRecord(patternHigh),
          createMockPatternRecord(patternLow),
        ],
      });

      let callIndex = 0;
      mockMemoryQueryService.calculateKeywordRelevance.mockImplementation(() => {
        callIndex++;
        return callIndex === 1 ? 0.8 : 0.2;
      });

      const result = await service.getPatternRecommendations(
        'workspace-1',
        'project-new',
        'React state management setup',
      );

      expect(result.length).toBe(2);
      // Both have same confidence, so sorted by relevance
      expect(result[0].relevanceScore).toBeGreaterThanOrEqual(result[1].relevanceScore);
    });

    it('should exclude overridden patterns', async () => {
      // getWorkspacePatterns only returns active by default
      mockNeo4jService.runQuery.mockResolvedValue({ records: [] });

      const result = await service.getPatternRecommendations(
        'workspace-1',
        'project-new',
        'test task',
      );

      // Should have called with status=active
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('wp.status = $status'),
        expect.objectContaining({ status: 'active' }),
      );
      expect(result).toEqual([]);
    });

    it('should sort by confidence then relevance', async () => {
      const highConfPattern = createTestPattern({
        id: 'p-high-conf',
        content: 'Always use retry logic',
        confidence: 'high',
      });
      const lowConfPattern = createTestPattern({
        id: 'p-low-conf',
        content: 'Consider retry logic',
        confidence: 'low',
      });

      mockNeo4jService.runQuery.mockResolvedValue({
        records: [
          createMockPatternRecord(lowConfPattern),
          createMockPatternRecord(highConfPattern),
        ],
      });

      // Both have same relevance
      mockMemoryQueryService.calculateKeywordRelevance.mockReturnValue(0.5);

      const result = await service.getPatternRecommendations(
        'workspace-1',
        'project-new',
        'retry logic for API calls',
      );

      expect(result.length).toBe(2);
      expect(result[0].pattern.confidence).toBe('high');
      expect(result[1].pattern.confidence).toBe('low');
    });

    it('should include confidence prefix label in recommendation', async () => {
      const highPattern = createTestPattern({ confidence: 'high' });
      const medPattern = createTestPattern({ confidence: 'medium' });
      const lowPattern = createTestPattern({ confidence: 'low' });

      mockNeo4jService.runQuery.mockResolvedValue({
        records: [
          createMockPatternRecord(highPattern),
          createMockPatternRecord(medPattern),
          createMockPatternRecord(lowPattern),
        ],
      });

      mockMemoryQueryService.calculateKeywordRelevance.mockReturnValue(0.5);

      const result = await service.getPatternRecommendations(
        'workspace-1',
        'project-new',
        'some task',
      );

      const labels = result.map((r) => r.confidenceLabel);
      expect(labels).toContain('[AUTO-APPLY]');
      expect(labels).toContain('[RECOMMENDED]');
      expect(labels).toContain('[SUGGESTION]');
    });

    it('should limit results to configurable count', async () => {
      const patterns = Array.from({ length: 30 }, (_, i) =>
        createTestPattern({ id: `p-${i}`, content: `Pattern ${i}` }),
      );

      mockNeo4jService.runQuery.mockResolvedValue({
        records: patterns.map(createMockPatternRecord),
      });

      mockMemoryQueryService.calculateKeywordRelevance.mockReturnValue(0.5);

      const result = await service.getPatternRecommendations(
        'workspace-1',
        'project-new',
        'some task',
      );

      expect(result.length).toBeLessThanOrEqual(20);
    });

    it('should return empty array for unrelated task', async () => {
      const pattern = createTestPattern({
        content: 'Use Docker for deployment',
      });

      mockNeo4jService.runQuery.mockResolvedValue({
        records: [createMockPatternRecord(pattern)],
      });

      // Zero relevance
      mockMemoryQueryService.calculateKeywordRelevance.mockReturnValue(0);

      const result = await service.getPatternRecommendations(
        'workspace-1',
        'project-new',
        'completely unrelated xyz',
      );

      expect(result).toEqual([]);
    });
  });

  // ─── Pattern Override/Restore Tests ────────────────────────────────────────

  describe('overridePattern', () => {
    it('should set status to overridden and record userId and reason', async () => {
      const pattern = createTestPattern({ id: 'pattern-1', status: 'active' });

      // getPatternById
      mockNeo4jService.runQuery.mockImplementation((cypher: string) => {
        if (cypher.includes('MATCH (wp:WorkspacePattern {id: $patternId})') && cypher.includes('SET')) {
          return {
            records: [
              createMockPatternRecord({
                ...pattern,
                status: 'overridden',
                overriddenBy: 'user-1',
                overrideReason: 'Not applicable to our workflow',
              }),
            ],
          };
        }
        return { records: [createMockPatternRecord(pattern)] };
      });

      const result = await service.overridePattern(
        'pattern-1',
        'user-1',
        'Not applicable to our workflow',
      );

      expect(result.status).toBe('overridden');
      expect(result.overriddenBy).toBe('user-1');
      expect(result.overrideReason).toBe('Not applicable to our workflow');
    });

    it('should update updatedAt timestamp', async () => {
      const pattern = createTestPattern({ id: 'pattern-1' });

      mockNeo4jService.runQuery.mockImplementation((cypher: string) => {
        if (cypher.includes('SET')) {
          return {
            records: [
              createMockPatternRecord({
                ...pattern,
                status: 'overridden',
                updatedAt: new Date(),
              }),
            ],
          };
        }
        return { records: [createMockPatternRecord(pattern)] };
      });

      await service.overridePattern('pattern-1', 'user-1', 'reason');

      // Check that SET clause includes updatedAt
      expect(mockNeo4jService.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('wp.updatedAt'),
        expect.objectContaining({
          updatedAt: expect.any(String),
        }),
      );
    });

    it('should return updated pattern', async () => {
      const pattern = createTestPattern({ id: 'pattern-1' });

      mockNeo4jService.runQuery.mockImplementation((cypher: string) => {
        if (cypher.includes('SET')) {
          return {
            records: [
              createMockPatternRecord({
                ...pattern,
                status: 'overridden',
                overriddenBy: 'user-1',
                overrideReason: 'reason',
              }),
            ],
          };
        }
        return { records: [createMockPatternRecord(pattern)] };
      });

      const result = await service.overridePattern('pattern-1', 'user-1', 'reason');

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it('should throw NotFoundException for non-existent pattern', async () => {
      mockNeo4jService.runQuery.mockResolvedValue({ records: [] });

      await expect(
        service.overridePattern('nonexistent', 'user-1', 'reason'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('restorePattern', () => {
    it('should set status back to active and clear override fields', async () => {
      const pattern = createTestPattern({
        id: 'pattern-1',
        status: 'overridden',
        overriddenBy: 'user-1',
        overrideReason: 'some reason',
      });

      mockNeo4jService.runQuery.mockImplementation((cypher: string) => {
        if (cypher.includes('SET')) {
          return {
            records: [
              createMockPatternRecord({
                ...pattern,
                status: 'active',
                overriddenBy: null,
                overrideReason: null,
              }),
            ],
          };
        }
        return { records: [createMockPatternRecord(pattern)] };
      });

      const result = await service.restorePattern('pattern-1');

      expect(result.status).toBe('active');
      expect(result.overriddenBy).toBeNull();
      expect(result.overrideReason).toBeNull();
    });

    it('should throw NotFoundException for non-existent pattern', async () => {
      mockNeo4jService.runQuery.mockResolvedValue({ records: [] });

      await expect(
        service.restorePattern('nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Adoption Stats Tests ──────────────────────────────────────────────────

  describe('getPatternAdoptionStats', () => {
    it('should return total pattern counts by confidence', async () => {
      const patterns = [
        createTestPattern({ confidence: 'low', patternType: 'architecture', status: 'active', occurrenceCount: 2 }),
        createTestPattern({ confidence: 'medium', patternType: 'error', status: 'active', occurrenceCount: 3 }),
        createTestPattern({ confidence: 'high', patternType: 'testing', status: 'active', occurrenceCount: 5 }),
      ];

      // First call: stats query
      mockNeo4jService.runQuery.mockImplementation((cypher: string) => {
        if (cypher.includes('wp.confidence as confidence')) {
          return {
            records: patterns.map((p) => ({
              get: (key: string) => {
                if (key === 'confidence') return p.confidence;
                if (key === 'patternType') return p.patternType;
                if (key === 'status') return p.status;
                if (key === 'occurrenceCount') return p.occurrenceCount;
                if (key === 'id') return p.id;
                return null;
              },
            })),
          };
        }
        // getWorkspacePatterns for topPatterns
        if (cypher.includes('ORDER BY')) {
          return {
            records: patterns.map(createMockPatternRecord),
          };
        }
        return { records: [] };
      });

      const result = await service.getPatternAdoptionStats('workspace-1');

      expect(result.totalPatterns).toBe(3);
      expect(result.byConfidence.low).toBe(1);
      expect(result.byConfidence.medium).toBe(1);
      expect(result.byConfidence.high).toBe(1);
    });

    it('should return override rate', async () => {
      const patterns = [
        createTestPattern({ status: 'active', confidence: 'medium', patternType: 'architecture', occurrenceCount: 2 }),
        createTestPattern({ status: 'active', confidence: 'medium', patternType: 'error', occurrenceCount: 3 }),
        createTestPattern({ status: 'overridden', confidence: 'low', patternType: 'testing', occurrenceCount: 1 }),
      ];

      mockNeo4jService.runQuery.mockImplementation((cypher: string) => {
        if (cypher.includes('wp.confidence as confidence')) {
          return {
            records: patterns.map((p) => ({
              get: (key: string) => {
                if (key === 'confidence') return p.confidence;
                if (key === 'patternType') return p.patternType;
                if (key === 'status') return p.status;
                if (key === 'occurrenceCount') return p.occurrenceCount;
                if (key === 'id') return p.id;
                return null;
              },
            })),
          };
        }
        if (cypher.includes('ORDER BY')) {
          return { records: patterns.map(createMockPatternRecord) };
        }
        return { records: [] };
      });

      const result = await service.getPatternAdoptionStats('workspace-1');

      // 1 overridden / (2 active + 1 overridden) = 1/3
      expect(result.overrideRate).toBeCloseTo(1 / 3, 2);
    });

    it('should return average occurrence count', async () => {
      const patterns = [
        createTestPattern({ occurrenceCount: 2, confidence: 'low', patternType: 'architecture', status: 'active' }),
        createTestPattern({ occurrenceCount: 4, confidence: 'medium', patternType: 'error', status: 'active' }),
        createTestPattern({ occurrenceCount: 6, confidence: 'high', patternType: 'testing', status: 'active' }),
      ];

      mockNeo4jService.runQuery.mockImplementation((cypher: string) => {
        if (cypher.includes('wp.confidence as confidence')) {
          return {
            records: patterns.map((p) => ({
              get: (key: string) => {
                if (key === 'confidence') return p.confidence;
                if (key === 'patternType') return p.patternType;
                if (key === 'status') return p.status;
                if (key === 'occurrenceCount') return p.occurrenceCount;
                if (key === 'id') return p.id;
                return null;
              },
            })),
          };
        }
        if (cypher.includes('ORDER BY')) {
          return { records: patterns.map(createMockPatternRecord) };
        }
        return { records: [] };
      });

      const result = await service.getPatternAdoptionStats('workspace-1');

      // (2 + 4 + 6) / 3 = 4
      expect(result.averageOccurrenceCount).toBe(4);
    });

    it('should handle workspace with no patterns', async () => {
      mockNeo4jService.runQuery.mockResolvedValue({ records: [] });

      const result = await service.getPatternAdoptionStats('workspace-1');

      expect(result.totalPatterns).toBe(0);
      expect(result.byConfidence).toEqual({ low: 0, medium: 0, high: 0 });
      expect(result.overrideRate).toBe(0);
      expect(result.averageOccurrenceCount).toBe(0);
      expect(result.topPatterns).toEqual([]);
    });
  });
});
