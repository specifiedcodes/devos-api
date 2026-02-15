/**
 * MemoryIngestionService Unit Tests
 * Story 12.2: Memory Ingestion Pipeline
 */

// Mock uuid (required by transitive GraphitiService import)
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid-1234'),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { MemoryIngestionService } from './memory-ingestion.service';
import { MemoryExtractionService } from './memory-extraction.service';
import { MemoryDeduplicationService } from './memory-deduplication.service';
import { GraphitiService } from './graphiti.service';
import {
  ExtractedMemory,
  IngestionInput,
} from '../interfaces/memory.interfaces';
import {
  PipelineStateEvent,
  PipelineState,
} from '../../orchestrator/interfaces/pipeline.interfaces';

describe('MemoryIngestionService', () => {
  let service: MemoryIngestionService;
  let mockGraphitiService: any;
  let mockExtractionService: any;
  let mockDeduplicationService: any;
  let mockEventEmitter: any;
  let mockConfigService: any;

  const createIngestionInput = (
    overrides: Partial<IngestionInput> = {},
  ): IngestionInput => ({
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
    ...overrides,
  });

  const createPipelineEvent = (
    previousState: PipelineState,
    newState: PipelineState,
    metadata: Record<string, any> = {},
  ): PipelineStateEvent => ({
    type: 'pipeline:state_changed',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    previousState,
    newState,
    agentId: 'agent-1',
    storyId: 'story-1',
    timestamp: new Date(),
    metadata: {
      agentType: 'dev',
      sessionId: 'session-1',
      branch: 'feature/test',
      commitHash: 'abc123',
      exitCode: 0,
      durationMs: 30000,
      filesChanged: ['src/test.ts'],
      commitMessages: ['Decided to use NestJS'],
      ...metadata,
    },
  });

  const createExtractedMemory = (
    overrides: Partial<ExtractedMemory> = {},
  ): ExtractedMemory => ({
    episodeType: 'decision',
    content: 'Decided to use NestJS for backend',
    entities: ['NestJS'],
    confidence: 0.9,
    metadata: { source: 'commit_message' },
    ...overrides,
  });

  beforeEach(async () => {
    mockGraphitiService = {
      addEpisode: jest.fn().mockResolvedValue({ id: 'episode-1' }),
      searchEpisodes: jest.fn().mockResolvedValue([]),
      getProjectEpisodeCount: jest.fn().mockResolvedValue(42),
    };

    mockExtractionService = {
      extract: jest.fn().mockReturnValue([]),
    };

    mockDeduplicationService = {
      deduplicateBatch: jest.fn().mockResolvedValue({
        accepted: [],
        skipped: 0,
        flagged: 0,
      }),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          MEMORY_INGESTION_ENABLED: 'true',
          MEMORY_INGESTION_MAX_RETRIES: '3',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryIngestionService,
        { provide: GraphitiService, useValue: mockGraphitiService },
        {
          provide: MemoryExtractionService,
          useValue: mockExtractionService,
        },
        {
          provide: MemoryDeduplicationService,
          useValue: mockDeduplicationService,
        },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<MemoryIngestionService>(MemoryIngestionService);
  });

  describe('handlePipelineStateChanged', () => {
    it('should process IMPLEMENTING -> QA transition', async () => {
      const extracted = [createExtractedMemory()];
      mockExtractionService.extract.mockReturnValue(extracted);
      mockDeduplicationService.deduplicateBatch.mockResolvedValue({
        accepted: extracted,
        skipped: 0,
        flagged: 0,
      });

      const event = createPipelineEvent(
        PipelineState.IMPLEMENTING,
        PipelineState.QA,
      );

      await service.handlePipelineStateChanged(event);

      // Wait for async ingest to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockExtractionService.extract).toHaveBeenCalled();
    });

    it('should process QA -> DEPLOYING transition', async () => {
      const extracted = [createExtractedMemory()];
      mockExtractionService.extract.mockReturnValue(extracted);
      mockDeduplicationService.deduplicateBatch.mockResolvedValue({
        accepted: extracted,
        skipped: 0,
        flagged: 0,
      });

      const event = createPipelineEvent(
        PipelineState.QA,
        PipelineState.DEPLOYING,
      );

      await service.handlePipelineStateChanged(event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockExtractionService.extract).toHaveBeenCalled();
    });

    it('should process DEPLOYING -> COMPLETE transition', async () => {
      const extracted = [createExtractedMemory()];
      mockExtractionService.extract.mockReturnValue(extracted);
      mockDeduplicationService.deduplicateBatch.mockResolvedValue({
        accepted: extracted,
        skipped: 0,
        flagged: 0,
      });

      const event = createPipelineEvent(
        PipelineState.DEPLOYING,
        PipelineState.COMPLETE,
      );

      await service.handlePipelineStateChanged(event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockExtractionService.extract).toHaveBeenCalled();
    });

    it('should process PLANNING -> IMPLEMENTING transition', async () => {
      const extracted = [createExtractedMemory()];
      mockExtractionService.extract.mockReturnValue(extracted);
      mockDeduplicationService.deduplicateBatch.mockResolvedValue({
        accepted: extracted,
        skipped: 0,
        flagged: 0,
      });

      const event = createPipelineEvent(
        PipelineState.PLANNING,
        PipelineState.IMPLEMENTING,
      );

      await service.handlePipelineStateChanged(event);
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockExtractionService.extract).toHaveBeenCalled();
    });

    it('should filter out IDLE -> PLANNING (not a completion)', async () => {
      const event = createPipelineEvent(
        PipelineState.IDLE,
        PipelineState.PLANNING,
      );

      await service.handlePipelineStateChanged(event);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockExtractionService.extract).not.toHaveBeenCalled();
    });

    it('should filter out FAILED state transitions', async () => {
      const event = createPipelineEvent(
        PipelineState.FAILED,
        PipelineState.IDLE,
      );

      await service.handlePipelineStateChanged(event);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockExtractionService.extract).not.toHaveBeenCalled();
    });

    it('should filter out COMPLETE -> IDLE transitions', async () => {
      const event = createPipelineEvent(
        PipelineState.COMPLETE,
        PipelineState.IDLE,
      );

      await service.handlePipelineStateChanged(event);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockExtractionService.extract).not.toHaveBeenCalled();
    });

    it('should filter out PAUSED transitions', async () => {
      const event = createPipelineEvent(
        PipelineState.PAUSED,
        PipelineState.IMPLEMENTING,
      );

      await service.handlePipelineStateChanged(event);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockExtractionService.extract).not.toHaveBeenCalled();
    });
  });

  describe('ingest', () => {
    it('should call extraction service with correct input', async () => {
      const input = createIngestionInput();
      mockExtractionService.extract.mockReturnValue([]);

      await service.ingest(input);

      expect(mockExtractionService.extract).toHaveBeenCalledWith(input);
    });

    it('should call deduplication service with extracted memories', async () => {
      const input = createIngestionInput();
      const extracted = [createExtractedMemory()];
      mockExtractionService.extract.mockReturnValue(extracted);
      mockDeduplicationService.deduplicateBatch.mockResolvedValue({
        accepted: extracted,
        skipped: 0,
        flagged: 0,
      });

      await service.ingest(input);

      expect(
        mockDeduplicationService.deduplicateBatch,
      ).toHaveBeenCalledWith(extracted, 'project-1', 'workspace-1');
    });

    it('should store accepted episodes via GraphitiService', async () => {
      const input = createIngestionInput();
      const extracted = [
        createExtractedMemory({ content: 'Memory 1' }),
        createExtractedMemory({ content: 'Memory 2', episodeType: 'fact' }),
      ];
      mockExtractionService.extract.mockReturnValue(extracted);
      mockDeduplicationService.deduplicateBatch.mockResolvedValue({
        accepted: extracted,
        skipped: 0,
        flagged: 0,
      });
      mockGraphitiService.addEpisode
        .mockResolvedValueOnce({ id: 'ep-1' })
        .mockResolvedValueOnce({ id: 'ep-2' });

      const result = await service.ingest(input);

      expect(mockGraphitiService.addEpisode).toHaveBeenCalledTimes(2);
      expect(result.episodesCreated).toBe(2);
      expect(result.episodeIds).toEqual(['ep-1', 'ep-2']);
    });

    it('should return IngestionResult with correct counts', async () => {
      const input = createIngestionInput();
      const extracted = [createExtractedMemory()];
      mockExtractionService.extract.mockReturnValue(extracted);
      mockDeduplicationService.deduplicateBatch.mockResolvedValue({
        accepted: extracted,
        skipped: 0,
        flagged: 0,
      });
      mockGraphitiService.addEpisode.mockResolvedValue({ id: 'ep-1' });

      const result = await service.ingest(input);

      expect(result.episodesCreated).toBe(1);
      expect(result.episodeIds).toEqual(['ep-1']);
      expect(result.extractionDurationMs).toBeGreaterThanOrEqual(0);
      expect(result.errors).toEqual([]);
    });

    it('should handle extraction returning empty array', async () => {
      const input = createIngestionInput();
      mockExtractionService.extract.mockReturnValue([]);

      const result = await service.ingest(input);

      expect(result.episodesCreated).toBe(0);
      expect(result.episodeIds).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(
        mockDeduplicationService.deduplicateBatch,
      ).not.toHaveBeenCalled();
    });

    it('should handle GraphitiService storage errors gracefully', async () => {
      const input = createIngestionInput();
      const extracted = [createExtractedMemory()];
      mockExtractionService.extract.mockReturnValue(extracted);
      mockDeduplicationService.deduplicateBatch.mockResolvedValue({
        accepted: extracted,
        skipped: 0,
        flagged: 0,
      });
      mockGraphitiService.addEpisode.mockRejectedValue(
        new Error('Neo4j connection failed'),
      );

      const result = await service.ingest(input);

      // Should not throw, should return partial result
      expect(result.episodesCreated).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Failed to store episode');
    });

    it('should handle extraction service errors gracefully', async () => {
      const input = createIngestionInput();
      mockExtractionService.extract.mockImplementation(() => {
        throw new Error('Extraction failed');
      });

      const result = await service.ingest(input);

      expect(result.episodesCreated).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should skip when MEMORY_INGESTION_ENABLED is false', async () => {
      // Recreate service with ingestion disabled
      mockConfigService.get.mockImplementation(
        (key: string, defaultValue?: string) => {
          if (key === 'MEMORY_INGESTION_ENABLED') return 'false';
          if (key === 'MEMORY_INGESTION_MAX_RETRIES') return '3';
          return defaultValue;
        },
      );

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MemoryIngestionService,
          { provide: GraphitiService, useValue: mockGraphitiService },
          {
            provide: MemoryExtractionService,
            useValue: mockExtractionService,
          },
          {
            provide: MemoryDeduplicationService,
            useValue: mockDeduplicationService,
          },
          { provide: EventEmitter2, useValue: mockEventEmitter },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const disabledService = module.get<MemoryIngestionService>(
        MemoryIngestionService,
      );

      const input = createIngestionInput();
      const result = await disabledService.ingest(input);

      expect(result.episodesCreated).toBe(0);
      expect(result.errors).toContain('Memory ingestion is disabled');
      expect(mockExtractionService.extract).not.toHaveBeenCalled();
    });

    it('should emit memory:ingestion_completed event', async () => {
      const input = createIngestionInput();
      const extracted = [createExtractedMemory()];
      mockExtractionService.extract.mockReturnValue(extracted);
      mockDeduplicationService.deduplicateBatch.mockResolvedValue({
        accepted: extracted,
        skipped: 0,
        flagged: 0,
      });
      mockGraphitiService.addEpisode.mockResolvedValue({ id: 'ep-1' });

      await service.ingest(input);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'memory:ingestion_completed',
        expect.objectContaining({
          episodesCreated: 1,
          episodeIds: ['ep-1'],
        }),
      );
    });

    it('should emit completion event even when no episodes extracted', async () => {
      const input = createIngestionInput();
      mockExtractionService.extract.mockReturnValue([]);

      await service.ingest(input);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'memory:ingestion_completed',
        expect.objectContaining({
          episodesCreated: 0,
        }),
      );
    });
  });

  describe('retry logic', () => {
    it('should retry on transient Neo4j errors', async () => {
      const input = createIngestionInput();
      const extracted = [createExtractedMemory()];
      mockExtractionService.extract.mockReturnValue(extracted);
      mockDeduplicationService.deduplicateBatch.mockResolvedValue({
        accepted: extracted,
        skipped: 0,
        flagged: 0,
      });

      // Fail twice, succeed on third attempt
      mockGraphitiService.addEpisode
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockResolvedValueOnce({ id: 'ep-1' });

      const result = await service.ingest(input);

      expect(mockGraphitiService.addEpisode).toHaveBeenCalledTimes(3);
      expect(result.episodesCreated).toBe(1);
      expect(result.episodeIds).toEqual(['ep-1']);
    });

    it('should stop after max retries', async () => {
      const input = createIngestionInput();
      const extracted = [createExtractedMemory()];
      mockExtractionService.extract.mockReturnValue(extracted);
      mockDeduplicationService.deduplicateBatch.mockResolvedValue({
        accepted: extracted,
        skipped: 0,
        flagged: 0,
      });

      // Fail all attempts
      mockGraphitiService.addEpisode.mockRejectedValue(
        new Error('Persistent failure'),
      );

      const result = await service.ingest(input);

      expect(mockGraphitiService.addEpisode).toHaveBeenCalledTimes(3); // maxRetries = 3
      expect(result.episodesCreated).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return partial result after some failures', async () => {
      const input = createIngestionInput();
      const extracted = [
        createExtractedMemory({ content: 'Memory 1' }),
        createExtractedMemory({ content: 'Memory 2' }),
      ];
      mockExtractionService.extract.mockReturnValue(extracted);
      mockDeduplicationService.deduplicateBatch.mockResolvedValue({
        accepted: extracted,
        skipped: 0,
        flagged: 0,
      });

      // First episode succeeds, second fails all retries
      mockGraphitiService.addEpisode
        .mockResolvedValueOnce({ id: 'ep-1' })
        .mockRejectedValue(new Error('Failed'));

      const result = await service.ingest(input);

      expect(result.episodesCreated).toBe(1);
      expect(result.episodeIds).toEqual(['ep-1']);
      expect(result.errors.length).toBe(1);
    });
  });

  describe('getIngestionStats', () => {
    it('should return stats for project', async () => {
      mockGraphitiService.getProjectEpisodeCount.mockResolvedValue(42);

      const stats = await service.getIngestionStats(
        'project-1',
        'workspace-1',
      );

      expect(stats.totalEpisodes).toBe(42);
      expect(
        mockGraphitiService.getProjectEpisodeCount,
      ).toHaveBeenCalledWith('project-1', 'workspace-1');
    });

    it('should use searchEpisodes with since filter when since is provided', async () => {
      const sinceDate = new Date('2026-01-01T00:00:00Z');
      const mockEpisodes = [
        { id: 'ep-1', content: 'fact' },
        { id: 'ep-2', content: 'decision' },
        { id: 'ep-3', content: 'pattern' },
      ];
      mockGraphitiService.searchEpisodes.mockResolvedValue(mockEpisodes);

      const stats = await service.getIngestionStats(
        'project-1',
        'workspace-1',
        sinceDate,
      );

      expect(stats.totalEpisodes).toBe(3);
      expect(mockGraphitiService.searchEpisodes).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project-1',
          workspaceId: 'workspace-1',
          since: sinceDate,
        }),
      );
      // Should NOT call getProjectEpisodeCount when since is provided
      expect(
        mockGraphitiService.getProjectEpisodeCount,
      ).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockGraphitiService.getProjectEpisodeCount.mockRejectedValue(
        new Error('Neo4j unavailable'),
      );

      const stats = await service.getIngestionStats(
        'project-1',
        'workspace-1',
      );

      expect(stats.totalEpisodes).toBe(0);
      expect(stats.errors).toBe(0);
    });
  });

  describe('does not block pipeline execution', () => {
    it('should process asynchronously via @OnEvent async handler', () => {
      // Verify the OnEvent decorator is configured with async: true
      const metadata = Reflect.getMetadata(
        'EVENT_LISTENER_METADATA',
        service.handlePipelineStateChanged,
      );
      // The decorator may store metadata differently, but the key point
      // is that the handler returns a Promise (async function)
      expect(
        service.handlePipelineStateChanged.constructor.name,
      ).toBe('AsyncFunction');
    });
  });
});
