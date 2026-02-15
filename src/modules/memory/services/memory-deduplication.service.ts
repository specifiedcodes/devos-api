/**
 * MemoryDeduplicationService
 * Story 12.2: Memory Ingestion Pipeline
 *
 * Prevents duplicate memory episodes from being stored in the knowledge graph.
 * Uses Jaccard similarity on word tokens for content comparison.
 * Configurable threshold via MEMORY_DEDUP_THRESHOLD environment variable.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphitiService } from './graphiti.service';
import {
  ExtractedMemory,
  DeduplicationResult,
  DeduplicationBatchResult,
  MemoryEpisodeType,
} from '../interfaces/memory.interfaces';

@Injectable()
export class MemoryDeduplicationService {
  private readonly logger = new Logger(MemoryDeduplicationService.name);
  private readonly dedupThreshold: number;

  constructor(
    private readonly graphitiService: GraphitiService,
    private readonly configService: ConfigService,
  ) {
    this.dedupThreshold = parseFloat(
      this.configService.get<string>('MEMORY_DEDUP_THRESHOLD', '0.95'),
    );
  }

  /**
   * Calculate Jaccard similarity between two text strings.
   * Normalizes both strings (lowercase, trim, remove punctuation)
   * and computes token overlap ratio.
   *
   * @returns similarity score between 0 and 1
   */
  calculateSimilarity(text1: string, text2: string): number {
    const normalize = (text: string): Set<string> => {
      const cleaned = text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .trim();
      const tokens = cleaned.split(/\s+/).filter(Boolean);
      return new Set(tokens);
    };

    const tokens1 = normalize(text1);
    const tokens2 = normalize(text2);

    // Both empty strings are considered identical
    if (tokens1.size === 0 && tokens2.size === 0) {
      return 1.0;
    }

    // One empty, one not = no similarity
    if (tokens1.size === 0 || tokens2.size === 0) {
      return 0.0;
    }

    const intersection = new Set([...tokens1].filter((t) => tokens2.has(t)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }

  /**
   * Check if a single extracted memory is a duplicate of existing episodes.
   * Queries existing episodes with the same episodeType in the same project.
   */
  async checkDuplicate(
    episode: ExtractedMemory,
    projectId: string,
    workspaceId: string,
  ): Promise<DeduplicationResult> {
    try {
      const existing = await this.graphitiService.searchEpisodes({
        projectId,
        workspaceId,
        types: [episode.episodeType],
        maxResults: 50,
      });

      let highestSimilarity = 0;
      let matchedEpisodeId: string | undefined;

      for (const existingEpisode of existing) {
        const similarity = this.calculateSimilarity(
          episode.content,
          existingEpisode.content,
        );

        if (similarity > highestSimilarity) {
          highestSimilarity = similarity;
          matchedEpisodeId = existingEpisode.id;
        }
      }

      const isDuplicate = highestSimilarity >= this.dedupThreshold;
      const isFlagged =
        !isDuplicate && highestSimilarity >= 0.8 && highestSimilarity < this.dedupThreshold;

      return {
        isDuplicate,
        isFlagged,
        existingEpisodeId: isDuplicate || isFlagged ? matchedEpisodeId : undefined,
        similarity: highestSimilarity,
      };
    } catch (error) {
      this.logger.warn(
        `Deduplication check failed, allowing episode: ${error instanceof Error ? error.message : String(error)}`,
      );
      // On error, allow the episode to be stored (fail-open)
      return {
        isDuplicate: false,
        isFlagged: false,
        similarity: 0,
      };
    }
  }

  /**
   * Deduplicate a batch of extracted memories.
   * Pre-fetches existing episodes grouped by type to reduce Neo4j queries,
   * then checks each episode against existing and intra-batch duplicates.
   */
  async deduplicateBatch(
    episodes: ExtractedMemory[],
    projectId: string,
    workspaceId: string,
  ): Promise<DeduplicationBatchResult> {
    const accepted: ExtractedMemory[] = [];
    let skipped = 0;
    let flagged = 0;

    // Pre-fetch existing episodes grouped by type to reduce Neo4j queries
    const uniqueTypes = [...new Set(episodes.map((e) => e.episodeType))];
    const existingByType = new Map<MemoryEpisodeType, { id: string; content: string }[]>();

    for (const type of uniqueTypes) {
      try {
        const existing = await this.graphitiService.searchEpisodes({
          projectId,
          workspaceId,
          types: [type],
          maxResults: 100,
        });
        existingByType.set(
          type,
          existing.map((e) => ({ id: e.id, content: e.content })),
        );
      } catch (error) {
        this.logger.warn(
          `Failed to fetch existing episodes for type ${type}: ${error instanceof Error ? error.message : String(error)}`,
        );
        existingByType.set(type, []);
      }
    }

    for (const episode of episodes) {
      // Check against pre-fetched existing episodes in graph
      const existingEpisodes = existingByType.get(episode.episodeType) || [];
      let highestSimilarity = 0;
      let matchedEpisodeId: string | undefined;

      for (const existing of existingEpisodes) {
        const similarity = this.calculateSimilarity(
          episode.content,
          existing.content,
        );
        if (similarity > highestSimilarity) {
          highestSimilarity = similarity;
          matchedEpisodeId = existing.id;
        }
      }

      const isDuplicate = highestSimilarity >= this.dedupThreshold;
      const isFlagged =
        !isDuplicate && highestSimilarity >= 0.8 && highestSimilarity < this.dedupThreshold;

      if (isDuplicate) {
        this.logger.debug(
          `Skipping duplicate episode (similarity=${highestSimilarity.toFixed(3)}): ${episode.content.substring(0, 80)}`,
        );
        skipped++;
        continue;
      }

      // Check against already accepted episodes in this batch (intra-batch dedup)
      let intraBatchDuplicate = false;
      for (const acceptedEpisode of accepted) {
        if (acceptedEpisode.episodeType !== episode.episodeType) {
          continue;
        }
        const similarity = this.calculateSimilarity(
          episode.content,
          acceptedEpisode.content,
        );
        if (similarity >= this.dedupThreshold) {
          this.logger.debug(
            `Skipping intra-batch duplicate (similarity=${similarity.toFixed(3)}): ${episode.content.substring(0, 80)}`,
          );
          skipped++;
          intraBatchDuplicate = true;
          break;
        }
      }

      if (intraBatchDuplicate) {
        continue;
      }

      if (isFlagged) {
        // Flag as potential duplicate but still store
        episode.metadata = {
          ...episode.metadata,
          potentialDuplicate: true,
          similarEpisodeId: matchedEpisodeId,
          similarityScore: highestSimilarity,
        };
        flagged++;
      }

      accepted.push(episode);
    }

    return { accepted, skipped, flagged };
  }
}
