/**
 * MemoryIngestionService
 * Story 12.2: Memory Ingestion Pipeline
 *
 * Orchestrates the memory ingestion pipeline:
 * 1. Listens for pipeline:state_changed events (agent task completions)
 * 2. Extracts knowledge from task outputs via MemoryExtractionService
 * 3. Deduplicates via MemoryDeduplicationService
 * 4. Stores episodes via GraphitiService
 * 5. Emits memory:ingestion_completed events
 *
 * Runs asynchronously to never block pipeline execution.
 * Handles errors gracefully (log and continue).
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { GraphitiService } from './graphiti.service';
import { MemoryExtractionService } from './memory-extraction.service';
import { MemoryDeduplicationService } from './memory-deduplication.service';
import {
  ExtractedMemory,
  IngestionInput,
  IngestionResult,
  IngestionStats,
} from '../interfaces/memory.interfaces';
import { PipelineStateEvent } from '../../orchestrator/interfaces/pipeline.interfaces';

/** Active phases whose completion triggers memory ingestion */
const ACTIVE_PHASES = ['implementing', 'qa', 'planning', 'deploying'];

@Injectable()
export class MemoryIngestionService {
  private readonly logger = new Logger(MemoryIngestionService.name);
  private readonly ingestionEnabled: boolean;
  private readonly maxRetries: number;

  constructor(
    private readonly graphitiService: GraphitiService,
    private readonly extractionService: MemoryExtractionService,
    private readonly deduplicationService: MemoryDeduplicationService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    const enabled = this.configService.get<string>(
      'MEMORY_INGESTION_ENABLED',
      'true',
    );
    this.ingestionEnabled = enabled === 'true' || enabled === '1';
    this.maxRetries = parseInt(
      this.configService.get<string>('MEMORY_INGESTION_MAX_RETRIES', '3'),
      10,
    );
  }

  /**
   * Event listener for pipeline state changes.
   * Filters events to only process completions of active phases.
   * Runs asynchronously to not block the pipeline.
   */
  @OnEvent('pipeline:state_changed', { async: true })
  async handlePipelineStateChanged(
    event: PipelineStateEvent,
  ): Promise<void> {
    // Only process when transitioning FROM an active phase
    if (!ACTIVE_PHASES.includes(event.previousState)) {
      return;
    }

    // Skip if ingestion is disabled
    if (!this.ingestionEnabled) {
      this.logger.debug('Memory ingestion is disabled, skipping');
      return;
    }

    try {
      const input = this.buildIngestionInput(event);
      // Fire and forget - do not await to avoid blocking pipeline
      this.ingest(input).catch((error) => {
        const errorMsg = `Memory ingestion failed for project ${event.projectId}: ${error instanceof Error ? error.message : String(error)}`;
        this.logger.warn(errorMsg);
        // Emit completion event with error so consumers are notified
        this.emitCompletionEvent({
          episodesCreated: 0,
          episodeIds: [],
          extractionDurationMs: 0,
          errors: [errorMsg],
        });
      });
    } catch (error) {
      const errorMsg = `Failed to build ingestion input: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.warn(errorMsg);
      // Emit completion event with error so consumers are notified
      this.emitCompletionEvent({
        episodesCreated: 0,
        episodeIds: [],
        extractionDurationMs: 0,
        errors: [errorMsg],
      });
    }
  }

  /**
   * Run the ingestion pipeline for a given input.
   * Extracts memories, deduplicates, stores in graph, and emits completion event.
   */
  async ingest(input: IngestionInput): Promise<IngestionResult> {
    if (!this.ingestionEnabled) {
      return {
        episodesCreated: 0,
        episodeIds: [],
        extractionDurationMs: 0,
        errors: ['Memory ingestion is disabled'],
      };
    }

    const startTime = Date.now();
    const errors: string[] = [];
    const episodeIds: string[] = [];

    try {
      // Step 1: Extract memories from task output
      const extractedMemories = this.extractionService.extract(input);

      if (extractedMemories.length === 0) {
        const result: IngestionResult = {
          episodesCreated: 0,
          episodeIds: [],
          extractionDurationMs: Date.now() - startTime,
          errors: [],
        };
        this.emitCompletionEvent(result);
        return result;
      }

      // Step 2: Deduplicate
      const dedupResult = await this.deduplicationService.deduplicateBatch(
        extractedMemories,
        input.projectId,
        input.workspaceId,
      );

      if (dedupResult.skipped > 0) {
        this.logger.debug(
          `Deduplication: ${dedupResult.skipped} skipped, ${dedupResult.flagged} flagged, ${dedupResult.accepted.length} accepted`,
        );
      }

      // Step 3: Store accepted episodes with retry logic
      for (const memory of dedupResult.accepted) {
        try {
          const episode = await this.storeWithRetry(memory, input);
          if (episode) {
            episodeIds.push(episode);
          }
        } catch (error) {
          const errorMsg = `Failed to store episode: ${error instanceof Error ? error.message : String(error)}`;
          this.logger.warn(errorMsg);
          errors.push(errorMsg);
        }
      }

      const result: IngestionResult = {
        episodesCreated: episodeIds.length,
        episodeIds,
        extractionDurationMs: Date.now() - startTime,
        errors,
      };

      this.emitCompletionEvent(result);
      return result;
    } catch (error) {
      const errorMsg = `Ingestion pipeline error: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      errors.push(errorMsg);

      const result: IngestionResult = {
        episodesCreated: episodeIds.length,
        episodeIds,
        extractionDurationMs: Date.now() - startTime,
        errors,
      };

      this.emitCompletionEvent(result);
      return result;
    }
  }

  /**
   * Get ingestion statistics for a project.
   */
  async getIngestionStats(
    projectId: string,
    workspaceId: string,
    since?: Date,
  ): Promise<IngestionStats> {
    try {
      let totalEpisodes: number;

      if (since) {
        // When a since date is provided, count episodes created after that date
        // by searching with the since filter and counting results
        const recentEpisodes = await this.graphitiService.searchEpisodes({
          projectId,
          workspaceId,
          since,
          maxResults: 10000, // High limit to count all episodes since date
        });
        totalEpisodes = recentEpisodes.length;
      } else {
        totalEpisodes = await this.graphitiService.getProjectEpisodeCount(
          projectId,
          workspaceId,
        );
      }

      return {
        totalIngestions: 0, // Would track in separate counter in production
        totalEpisodes,
        deduplicationsSkipped: 0, // Would track in separate counter
        errors: 0, // Would track in separate counter
      };
    } catch (error) {
      this.logger.warn(
        `Failed to get ingestion stats: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        totalIngestions: 0,
        totalEpisodes: 0,
        deduplicationsSkipped: 0,
        errors: 0,
      };
    }
  }

  /**
   * Store a single memory episode with retry logic and exponential backoff.
   */
  private async storeWithRetry(
    memory: ExtractedMemory,
    input: IngestionInput,
  ): Promise<string | null> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const episode = await this.graphitiService.addEpisode({
          projectId: input.projectId,
          workspaceId: input.workspaceId,
          storyId: input.storyId ?? undefined,
          agentType: input.agentType,
          episodeType: memory.episodeType,
          content: memory.content,
          entities: memory.entities,
          confidence: memory.confidence,
          metadata: {
            ...memory.metadata,
            sessionId: input.sessionId,
            branch: input.branch,
            commitHash: input.commitHash,
          },
        });

        return episode.id;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `Store attempt ${attempt + 1}/${this.maxRetries} failed: ${lastError.message}`,
        );

        if (attempt < this.maxRetries - 1) {
          // Exponential backoff: 100ms, 200ms, 400ms
          const delay = 100 * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Max retries reached');
  }

  /**
   * Build IngestionInput from a PipelineStateEvent.
   */
  /**
   * Map pipeline states to agent types for fallback when metadata is missing.
   */
  private static readonly STATE_TO_AGENT_TYPE: Record<string, string> = {
    planning: 'planner',
    implementing: 'dev',
    qa: 'qa',
    deploying: 'devops',
  };

  private buildIngestionInput(event: PipelineStateEvent): IngestionInput {
    const metadata = event.metadata || {};
    const agentTypeFallback =
      MemoryIngestionService.STATE_TO_AGENT_TYPE[event.previousState] ||
      'unknown';

    return {
      projectId: event.projectId,
      workspaceId: event.workspaceId,
      storyId: event.storyId,
      agentType: metadata.agentType || agentTypeFallback,
      sessionId: metadata.sessionId || '',
      branch: metadata.branch || null,
      commitHash: metadata.commitHash || null,
      exitCode: metadata.exitCode ?? null,
      durationMs: metadata.durationMs || 0,
      outputSummary: metadata.outputSummary || null,
      filesChanged: metadata.filesChanged || [],
      commitMessages: metadata.commitMessages || [],
      testResults: metadata.testResults || null,
      prUrl: metadata.prUrl || null,
      deploymentUrl: metadata.deploymentUrl || null,
      errorMessage: metadata.error || null,
      pipelineMetadata: metadata,
    };
  }

  /**
   * Emit the memory:ingestion_completed event.
   */
  private emitCompletionEvent(result: IngestionResult): void {
    try {
      this.eventEmitter.emit('memory:ingestion_completed', result);
    } catch (error) {
      this.logger.warn(
        `Failed to emit ingestion_completed event: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Sleep utility for exponential backoff.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
