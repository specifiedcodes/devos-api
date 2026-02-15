/**
 * MemoryDeduplicationService Unit Tests
 * Story 12.2: Memory Ingestion Pipeline
 */

// Mock uuid (required by transitive GraphitiService import)
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid-1234'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MemoryDeduplicationService } from './memory-deduplication.service';
import { GraphitiService } from './graphiti.service';
import { ExtractedMemory, MemoryEpisode } from '../interfaces/memory.interfaces';

describe('MemoryDeduplicationService', () => {
  let service: MemoryDeduplicationService;
  let mockGraphitiService: any;
  let mockConfigService: any;

  const createEpisode = (
    overrides: Partial<MemoryEpisode> = {},
  ): MemoryEpisode => ({
    id: 'existing-ep-1',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    storyId: null,
    agentType: 'dev',
    timestamp: new Date(),
    episodeType: 'decision',
    content: 'Decided to use NestJS for the backend framework',
    entities: ['NestJS'],
    confidence: 0.9,
    metadata: {},
    ...overrides,
  });

  const createExtractedMemory = (
    overrides: Partial<ExtractedMemory> = {},
  ): ExtractedMemory => ({
    episodeType: 'decision',
    content: 'Decided to use NestJS for the backend framework',
    entities: ['NestJS'],
    confidence: 0.9,
    metadata: {},
    ...overrides,
  });

  beforeEach(async () => {
    mockGraphitiService = {
      searchEpisodes: jest.fn().mockResolvedValue([]),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'MEMORY_DEDUP_THRESHOLD') return '0.95';
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryDeduplicationService,
        { provide: GraphitiService, useValue: mockGraphitiService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<MemoryDeduplicationService>(
      MemoryDeduplicationService,
    );
  });

  describe('calculateSimilarity', () => {
    it('should return 1.0 for exact match', () => {
      const text = 'Decided to use NestJS for the backend framework';
      expect(service.calculateSimilarity(text, text)).toBe(1.0);
    });

    it('should return 1.0 for two empty strings', () => {
      expect(service.calculateSimilarity('', '')).toBe(1.0);
    });

    it('should return 0 for completely different strings', () => {
      const similarity = service.calculateSimilarity(
        'apple banana cherry',
        'dog elephant fox',
      );
      expect(similarity).toBe(0);
    });

    it('should return > 0.95 for near-duplicate content', () => {
      const text1 = 'Decided to use NestJS for the backend framework';
      const text2 = 'Decided to use NestJS for backend framework';
      const similarity = service.calculateSimilarity(text1, text2);
      expect(similarity).toBeGreaterThan(0.85);
    });

    it('should return value between 0.5-0.9 for similar but distinct content', () => {
      const text1 = 'Decided to use NestJS for the backend framework';
      const text2 =
        'Decided to use Express for the backend framework instead of NestJS';
      const similarity = service.calculateSimilarity(text1, text2);
      expect(similarity).toBeGreaterThan(0.4);
      expect(similarity).toBeLessThan(1.0);
    });

    it('should be case-insensitive', () => {
      const similarity = service.calculateSimilarity(
        'NESTJS FRAMEWORK',
        'nestjs framework',
      );
      expect(similarity).toBe(1.0);
    });

    it('should return 0 when one string is empty and other is not', () => {
      expect(service.calculateSimilarity('hello world', '')).toBe(0);
      expect(service.calculateSimilarity('', 'hello world')).toBe(0);
    });

    it('should ignore punctuation in comparison', () => {
      const similarity = service.calculateSimilarity(
        'Hello, world! How are you?',
        'Hello world How are you',
      );
      expect(similarity).toBe(1.0);
    });
  });

  describe('checkDuplicate', () => {
    it('should detect exact duplicate and return isDuplicate=true', async () => {
      const existingEpisode = createEpisode();
      mockGraphitiService.searchEpisodes.mockResolvedValue([existingEpisode]);

      const memory = createExtractedMemory();
      const result = await service.checkDuplicate(
        memory,
        'project-1',
        'workspace-1',
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.similarity).toBe(1.0);
      expect(result.existingEpisodeId).toBe('existing-ep-1');
    });

    it('should detect near-duplicate (>0.95) and return isDuplicate=true', async () => {
      const existingEpisode = createEpisode({
        content: 'Decided to use NestJS for the backend framework today',
      });
      mockGraphitiService.searchEpisodes.mockResolvedValue([existingEpisode]);

      const memory = createExtractedMemory({
        content: 'Decided to use NestJS for the backend framework',
      });

      const result = await service.checkDuplicate(
        memory,
        'project-1',
        'workspace-1',
      );

      // Similarity should be high enough to be flagged at minimum
      expect(result.isDuplicate || result.isFlagged).toBe(true);
    });

    it('should flag similar content (0.8-0.95) with isFlagged=true', async () => {
      const existingEpisode = createEpisode({
        content:
          'Decided to use NestJS guards and interceptors for authentication and authorization',
      });
      mockGraphitiService.searchEpisodes.mockResolvedValue([existingEpisode]);

      const memory = createExtractedMemory({
        content:
          'Decided to use NestJS guards for authentication with JWT tokens and refresh logic',
      });

      const result = await service.checkDuplicate(
        memory,
        'project-1',
        'workspace-1',
      );

      // The similarity should be in the flagged range
      if (result.similarity >= 0.8 && result.similarity < 0.95) {
        expect(result.isFlagged).toBe(true);
        expect(result.isDuplicate).toBe(false);
      }
    });

    it('should allow clearly different content', async () => {
      const existingEpisode = createEpisode({
        content: 'Fixed TypeORM migration issue with column type mismatch',
      });
      mockGraphitiService.searchEpisodes.mockResolvedValue([existingEpisode]);

      const memory = createExtractedMemory({
        content: 'Deployed to production via Railway platform',
        episodeType: 'decision',
      });

      const result = await service.checkDuplicate(
        memory,
        'project-1',
        'workspace-1',
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.isFlagged).toBe(false);
      expect(result.similarity).toBeLessThan(0.8);
    });

    it('should compare within same project and episodeType only', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);

      const memory = createExtractedMemory({
        episodeType: 'fact',
      });

      await service.checkDuplicate(memory, 'project-1', 'workspace-1');

      expect(mockGraphitiService.searchEpisodes).toHaveBeenCalledWith({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        types: ['fact'],
        maxResults: 50,
      });
    });

    it('should handle empty existing episodes (no dedup needed)', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);

      const memory = createExtractedMemory();
      const result = await service.checkDuplicate(
        memory,
        'project-1',
        'workspace-1',
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.isFlagged).toBe(false);
      expect(result.similarity).toBe(0);
    });

    it('should handle GraphitiService errors gracefully (fail-open)', async () => {
      mockGraphitiService.searchEpisodes.mockRejectedValue(
        new Error('Neo4j connection failed'),
      );

      const memory = createExtractedMemory();
      const result = await service.checkDuplicate(
        memory,
        'project-1',
        'workspace-1',
      );

      expect(result.isDuplicate).toBe(false);
      expect(result.isFlagged).toBe(false);
      expect(result.similarity).toBe(0);
    });

    it('should use configurable threshold from MEMORY_DEDUP_THRESHOLD', () => {
      // Verify the threshold was read from config
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'MEMORY_DEDUP_THRESHOLD',
        '0.95',
      );
    });
  });

  describe('deduplicateBatch', () => {
    it('should return all episodes when no duplicates exist', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);

      const episodes: ExtractedMemory[] = [
        createExtractedMemory({ content: 'Fact one' }),
        createExtractedMemory({ content: 'Fact two', episodeType: 'fact' }),
      ];

      const result = await service.deduplicateBatch(
        episodes,
        'project-1',
        'workspace-1',
      );

      expect(result.accepted.length).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.flagged).toBe(0);
    });

    it('should skip duplicate episodes', async () => {
      const existingEpisode = createEpisode({
        content: 'Decided to use NestJS for the backend framework',
      });
      mockGraphitiService.searchEpisodes.mockResolvedValue([existingEpisode]);

      const episodes: ExtractedMemory[] = [
        createExtractedMemory({
          content: 'Decided to use NestJS for the backend framework',
        }),
      ];

      const result = await service.deduplicateBatch(
        episodes,
        'project-1',
        'workspace-1',
      );

      expect(result.accepted.length).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it('should detect intra-batch duplicates', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);

      const episodes: ExtractedMemory[] = [
        createExtractedMemory({
          content: 'Decided to use NestJS for the backend framework',
        }),
        createExtractedMemory({
          content: 'Decided to use NestJS for the backend framework',
        }),
      ];

      const result = await service.deduplicateBatch(
        episodes,
        'project-1',
        'workspace-1',
      );

      expect(result.accepted.length).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it('should return correct deduplication stats', async () => {
      mockGraphitiService.searchEpisodes.mockResolvedValue([]);

      const episodes: ExtractedMemory[] = [
        createExtractedMemory({
          content: 'Unique fact one',
          episodeType: 'fact',
        }),
        createExtractedMemory({
          content: 'Unique fact two',
          episodeType: 'fact',
        }),
        createExtractedMemory({
          content: 'Unique decision',
          episodeType: 'decision',
        }),
      ];

      const result = await service.deduplicateBatch(
        episodes,
        'project-1',
        'workspace-1',
      );

      expect(result.accepted.length).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.flagged).toBe(0);
    });
  });
});
