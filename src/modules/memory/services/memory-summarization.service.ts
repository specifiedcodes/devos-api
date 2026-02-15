/**
 * MemorySummarizationService
 * Story 12.7: Memory Summarization (Cheap Models)
 *
 * Orchestrates memory episode summarization to reduce storage and retrieval overhead.
 * Uses threshold-based consolidation with monthly grouping.
 * Stub summarization (concatenation-based) for now - real LLM deferred to Epic 13.
 * Archive-not-delete strategy: original episodes are never deleted.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import { GraphitiService } from './graphiti.service';
import { Neo4jService } from './neo4j.service';
import {
  MemoryEpisode,
  MemorySummary,
  SummarizationResult,
  SummarizationStats,
} from '../interfaces/memory.interfaces';
import { toNumber, parseNeo4jTimestamp } from '../utils/neo4j.utils';

@Injectable()
export class MemorySummarizationService {
  private readonly logger = new Logger(MemorySummarizationService.name);

  constructor(
    private readonly graphitiService: GraphitiService,
    private readonly neo4jService: Neo4jService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Check if a project exceeds the episode threshold and summarize if needed.
   * Returns early with skipped=true if below threshold.
   */
  async checkAndSummarize(
    projectId: string,
    workspaceId: string,
  ): Promise<SummarizationResult> {
    const threshold = parseInt(
      this.configService.get<string>(
        'MEMORY_SUMMARIZATION_EPISODE_THRESHOLD',
        '1000',
      ),
      10,
    );

    // Story 12.7 fix: Count only non-archived episodes for threshold check.
    // getProjectEpisodeCount counts ALL episodes (including archived), which would
    // cause re-summarization triggers even after episodes have been archived.
    const activeCountResult = await this.neo4jService.runQuery(
      `
      MATCH (e:Episode {projectId: $projectId, workspaceId: $workspaceId})
      WHERE NOT coalesce(e.archived, false)
      RETURN count(e) as count
      `,
      { projectId, workspaceId },
    );
    const count = activeCountResult.records[0]
      ? toNumber(activeCountResult.records[0].get('count'))
      : 0;

    if (count < threshold) {
      return {
        summariesCreated: 0,
        episodesArchived: 0,
        totalProcessed: 0,
        durationMs: 0,
        skipped: true,
        errors: [],
      };
    }

    return this.summarizeProject(projectId, workspaceId);
  }

  /**
   * Force summarization for a project regardless of threshold.
   * Main summarization orchestration method.
   */
  async summarizeProject(
    projectId: string,
    workspaceId: string,
  ): Promise<SummarizationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let summariesCreated = 0;
    let episodesArchived = 0;
    let totalProcessed = 0;

    try {
      // Query all non-archived episodes for the project.
      // Max results is configurable to handle projects with varying episode counts.
      const maxEpisodes = parseInt(
        this.configService.get<string>(
          'MEMORY_SUMMARIZATION_MAX_EPISODES',
          '10000',
        ),
        10,
      );
      const episodes = await this.graphitiService.searchEpisodes({
        projectId,
        workspaceId,
        includeArchived: false,
        maxResults: maxEpisodes,
      });

      const now = new Date();

      // Filter eligible episodes (excludes decisions, pinned, high-confidence, young, archived)
      const eligible = episodes.filter((ep) =>
        this.isEligibleForSummarization(ep, now),
      );

      totalProcessed = eligible.length;

      if (eligible.length === 0) {
        const result: SummarizationResult = {
          summariesCreated: 0,
          episodesArchived: 0,
          totalProcessed: 0,
          durationMs: Date.now() - startTime,
          skipped: false,
          errors: [],
        };
        this.eventEmitter.emit('memory:summarization_completed', result);
        return result;
      }

      // Group eligible episodes by month for summarization
      const groups = this.groupByMonth(eligible);

      // Group ALL episodes by month for decision/pattern extraction
      // (decisions are excluded from eligible set but should be preserved in summaries)
      const allGroups = this.groupByMonth(episodes);

      // Process each monthly group
      for (const [monthKey, monthEpisodes] of groups) {
        try {
          const periodStart = new Date(`${monthKey}-01T00:00:00.000Z`);
          const periodEnd = this.getMonthEnd(periodStart);

          // Extract decisions and patterns from ALL episodes in the month
          // (not just eligible ones), since decisions are excluded from
          // the eligible set but their content should be preserved in summaries
          const allMonthEpisodes = allGroups.get(monthKey) ?? monthEpisodes;
          const keyDecisions = this.extractKeyDecisions(allMonthEpisodes);
          const keyPatterns = this.extractKeyPatterns(allMonthEpisodes);

          // Generate stub summary
          const summaryText = this.generateStubSummary(
            monthEpisodes,
            periodStart,
            periodEnd,
          );

          // Create summary ID
          const summaryId = uuidv4();

          // Store summary in Neo4j
          const summary: MemorySummary = {
            id: summaryId,
            projectId,
            workspaceId,
            periodStart,
            periodEnd,
            originalEpisodeCount: monthEpisodes.length,
            summary: summaryText,
            keyDecisions,
            keyPatterns,
            archivedEpisodeIds: monthEpisodes.map((ep) => ep.id),
            summarizationModel: this.configService.get<string>(
              'MEMORY_SUMMARIZATION_MODEL',
              'stub',
            ),
            createdAt: new Date(),
            metadata: {
              durationMs: Date.now() - startTime,
              episodesProcessed: monthEpisodes.length,
              outputSize: summaryText.length,
            },
          };

          await this.storeSummary(summary);
          summariesCreated++;

          // Archive episodes
          const archived = await this.archiveEpisodes(
            monthEpisodes.map((ep) => ep.id),
            summaryId,
          );
          episodesArchived += archived;
        } catch (error) {
          const msg = `Failed to summarize month ${monthKey}: ${error instanceof Error ? error.message : String(error)}`;
          this.logger.warn(msg);
          errors.push(msg);
        }
      }
    } catch (error) {
      const msg = `Summarization failed for project ${projectId}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.warn(msg);
      errors.push(msg);
    }

    const result: SummarizationResult = {
      summariesCreated,
      episodesArchived,
      totalProcessed,
      durationMs: Date.now() - startTime,
      skipped: false,
      errors,
    };

    this.eventEmitter.emit('memory:summarization_completed', result);
    return result;
  }

  /**
   * Get all summaries for a project, ordered by periodStart descending.
   */
  async getProjectSummaries(
    projectId: string,
    workspaceId: string,
  ): Promise<MemorySummary[]> {
    const cypher = `
      MATCH (s:MemorySummary {projectId: $projectId, workspaceId: $workspaceId})
      RETURN s
      ORDER BY s.periodStart DESC
    `;

    try {
      const result = await this.neo4jService.runQuery(cypher, {
        projectId,
        workspaceId,
      });

      return result.records.map((record) => {
        const node = record.get('s').properties;
        return this.mapNodeToSummary(node);
      });
    } catch (error) {
      this.logger.warn(
        `Failed to get summaries for project ${projectId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Get summarization statistics for a project.
   */
  async getSummarizationStats(
    projectId: string,
    workspaceId: string,
  ): Promise<SummarizationStats> {
    try {
      // Query total summaries and date range
      const summaryResult = await this.neo4jService.runQuery(
        `
        MATCH (s:MemorySummary {projectId: $projectId, workspaceId: $workspaceId})
        RETURN count(s) as totalSummaries, min(s.periodStart) as oldest, max(s.periodStart) as newest
      `,
        { projectId, workspaceId },
      );

      const summaryRecord = summaryResult.records[0];
      const totalSummaries = summaryRecord
        ? toNumber(summaryRecord.get('totalSummaries'))
        : 0;
      const oldest = summaryRecord?.get('oldest');
      const newest = summaryRecord?.get('newest');

      // Query archived episodes count
      const archivedResult = await this.neo4jService.runQuery(
        `
        MATCH (e:Episode {projectId: $projectId, workspaceId: $workspaceId})
        WHERE e.archived = true
        RETURN count(e) as archivedCount
      `,
        { projectId, workspaceId },
      );
      const totalArchivedEpisodes = archivedResult.records[0]
        ? toNumber(archivedResult.records[0].get('archivedCount'))
        : 0;

      // Query active episodes count
      const activeResult = await this.neo4jService.runQuery(
        `
        MATCH (e:Episode {projectId: $projectId, workspaceId: $workspaceId})
        WHERE NOT coalesce(e.archived, false)
        RETURN count(e) as activeCount
      `,
        { projectId, workspaceId },
      );
      const activeEpisodes = activeResult.records[0]
        ? toNumber(activeResult.records[0].get('activeCount'))
        : 0;

      return {
        totalSummaries,
        totalArchivedEpisodes,
        activeEpisodes,
        oldestSummary: oldest ? parseNeo4jTimestamp(oldest) : null,
        newestSummary: newest ? parseNeo4jTimestamp(newest) : null,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to get summarization stats for project ${projectId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        totalSummaries: 0,
        totalArchivedEpisodes: 0,
        activeEpisodes: 0,
        oldestSummary: null,
        newestSummary: null,
      };
    }
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  /**
   * Check if an episode is eligible for summarization.
   * Never summarize: decisions, pinned, high-confidence (>=0.95), young, already archived.
   */
  isEligibleForSummarization(episode: MemoryEpisode, now: Date): boolean {
    // Never summarize decision episodes
    if (episode.episodeType === 'decision') {
      return false;
    }

    // Never summarize pinned episodes
    if (episode.metadata?.pinned === true) {
      return false;
    }

    // Never summarize high-confidence episodes
    if (episode.confidence >= 0.95) {
      return false;
    }

    // Never summarize already-archived episodes
    if (episode.metadata?.archived === true) {
      return false;
    }

    // Check age threshold
    const ageDays = parseInt(
      this.configService.get<string>(
        'MEMORY_SUMMARIZATION_AGE_DAYS',
        '30',
      ),
      10,
    );
    const ageThresholdDate = new Date(
      now.getTime() - ageDays * 24 * 60 * 60 * 1000,
    );

    if (episode.timestamp > ageThresholdDate) {
      return false;
    }

    return true;
  }

  /**
   * Group episodes by calendar month (YYYY-MM format).
   * Returns groups sorted chronologically (oldest first).
   */
  groupByMonth(episodes: MemoryEpisode[]): Map<string, MemoryEpisode[]> {
    const groups = new Map<string, MemoryEpisode[]>();

    for (const episode of episodes) {
      const date = new Date(episode.timestamp);
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

      const existing = groups.get(key) || [];
      existing.push(episode);
      groups.set(key, existing);
    }

    // Sort by key (chronological)
    const sorted = new Map(
      [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)),
    );

    return sorted;
  }

  /**
   * Generate a stub summary by concatenating episode content grouped by type.
   * Real LLM summarization deferred to Epic 13.
   */
  generateStubSummary(
    episodes: MemoryEpisode[],
    periodStart: Date,
    periodEnd: Date,
  ): string {
    const maxLength = parseInt(
      this.configService.get<string>(
        'MEMORY_SUMMARIZATION_MAX_SUMMARY_LENGTH',
        '2000',
      ),
      10,
    );

    const startStr = periodStart.toISOString().split('T')[0];
    const endStr = periodEnd.toISOString().split('T')[0];

    const parts: string[] = [
      `Period ${startStr} to ${endStr}: ${episodes.length} episodes summarized.`,
    ];

    // Group by type
    const facts = episodes.filter((e) => e.episodeType === 'fact');
    const problems = episodes.filter((e) => e.episodeType === 'problem');
    const patterns = episodes.filter((e) => e.episodeType === 'pattern');
    const preferences = episodes.filter((e) => e.episodeType === 'preference');

    if (facts.length > 0) {
      const factContents = facts
        .map((e) => e.content)
        .slice(0, 10)
        .join(', ');
      parts.push(`Key facts: ${factContents}`);
    }

    if (problems.length > 0) {
      const problemContents = problems
        .map((e) => e.content)
        .slice(0, 10)
        .join(', ');
      parts.push(`Problems resolved: ${problemContents}`);
    }

    if (patterns.length > 0) {
      const patternContents = patterns
        .map((e) => e.content)
        .slice(0, 10)
        .join(', ');
      parts.push(`Patterns observed: ${patternContents}`);
    }

    if (preferences.length > 0) {
      const prefContents = preferences
        .map((e) => e.content)
        .slice(0, 10)
        .join(', ');
      parts.push(`Preferences: ${prefContents}`);
    }

    const fullText = parts.join(' ');

    // Truncate to max length
    if (fullText.length > maxLength) {
      return fullText.substring(0, maxLength - 3) + '...';
    }

    return fullText;
  }

  /**
   * Extract key decisions from episodes (preserved verbatim).
   * Decision-type episodes should not be in eligible set, but handle edge cases.
   */
  extractKeyDecisions(episodes: MemoryEpisode[]): string[] {
    return episodes
      .filter((e) => e.episodeType === 'decision')
      .map((e) => e.content);
  }

  /**
   * Extract key patterns from episodes (preserved verbatim).
   */
  extractKeyPatterns(episodes: MemoryEpisode[]): string[] {
    return episodes
      .filter((e) => e.episodeType === 'pattern')
      .map((e) => e.content);
  }

  /**
   * Store a MemorySummary node in Neo4j with project and workspace relationships.
   * Uses MERGE on (projectId, workspaceId, periodStart, periodEnd) to prevent
   * duplicate summaries for the same month if summarizeProject is called repeatedly.
   */
  private async storeSummary(summary: MemorySummary): Promise<string> {
    const cypher = `
      MERGE (s:MemorySummary {
        projectId: $projectId,
        workspaceId: $workspaceId,
        periodStart: datetime($periodStart),
        periodEnd: datetime($periodEnd)
      })
      ON CREATE SET
        s.id = $id,
        s.originalEpisodeCount = $originalEpisodeCount,
        s.summary = $summary,
        s.keyDecisions = $keyDecisions,
        s.keyPatterns = $keyPatterns,
        s.archivedEpisodeIds = $archivedEpisodeIds,
        s.summarizationModel = $summarizationModel,
        s.createdAt = datetime($createdAt),
        s.metadata = $metadata
      ON MATCH SET
        s.originalEpisodeCount = s.originalEpisodeCount + $originalEpisodeCount,
        s.summary = $summary,
        s.archivedEpisodeIds = s.archivedEpisodeIds + $archivedEpisodeIds,
        s.metadata = $metadata
      MERGE (p:ProjectNode {projectId: $projectId})
      MERGE (w:WorkspaceNode {workspaceId: $workspaceId})
      MERGE (s)-[:BELONGS_TO]->(p)
      MERGE (s)-[:IN_WORKSPACE]->(w)
      RETURN s.id as id
    `;

    await this.neo4jService.runQuery(cypher, {
      id: summary.id,
      projectId: summary.projectId,
      workspaceId: summary.workspaceId,
      periodStart: summary.periodStart.toISOString(),
      periodEnd: summary.periodEnd.toISOString(),
      originalEpisodeCount: summary.originalEpisodeCount,
      summary: summary.summary,
      keyDecisions: summary.keyDecisions,
      keyPatterns: summary.keyPatterns,
      archivedEpisodeIds: summary.archivedEpisodeIds,
      summarizationModel: summary.summarizationModel,
      createdAt: summary.createdAt.toISOString(),
      metadata: JSON.stringify(summary.metadata),
    });

    return summary.id;
  }

  /**
   * Archive episodes and create SUMMARIZES relationships in a single batch query.
   * Returns the number of successfully archived episodes.
   */
  private async archiveEpisodes(
    episodeIds: string[],
    summaryId: string,
  ): Promise<number> {
    if (episodeIds.length === 0) {
      return 0;
    }

    try {
      // Batch archive + relationship creation in a single Cypher query
      // to avoid N+1 sequential queries per episode.
      const result = await this.neo4jService.runQuery(
        `
        MATCH (s:MemorySummary {id: $summaryId})
        UNWIND $episodeIds AS episodeId
        MATCH (e:Episode {id: episodeId})
        SET e.archived = true, e.archivedAt = datetime(), e.summaryId = $summaryId
        CREATE (s)-[:SUMMARIZES]->(e)
        RETURN count(e) as archivedCount
        `,
        { summaryId, episodeIds },
      );

      const archivedCount = result.records[0]
        ? toNumber(result.records[0].get('archivedCount'))
        : 0;
      return archivedCount;
    } catch (error) {
      this.logger.warn(
        `Failed to batch archive ${episodeIds.length} episodes for summary ${summaryId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }

  /**
   * Get the last day of the month for a given date.
   */
  private getMonthEnd(date: Date): Date {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  }

  /**
   * Map a Neo4j node to a MemorySummary interface.
   */
  private mapNodeToSummary(
    node: Record<string, unknown>,
  ): MemorySummary {
    const metadata =
      typeof node.metadata === 'string'
        ? (() => {
            try {
              return JSON.parse(node.metadata as string);
            } catch {
              return {};
            }
          })()
        : (node.metadata as Record<string, unknown>) ?? {};

    return {
      id: node.id as string,
      projectId: node.projectId as string,
      workspaceId: node.workspaceId as string,
      periodStart: parseNeo4jTimestamp(node.periodStart),
      periodEnd: parseNeo4jTimestamp(node.periodEnd),
      originalEpisodeCount: toNumber(node.originalEpisodeCount),
      summary: node.summary as string,
      keyDecisions: (node.keyDecisions as string[]) ?? [],
      keyPatterns: (node.keyPatterns as string[]) ?? [],
      archivedEpisodeIds: (node.archivedEpisodeIds as string[]) ?? [],
      summarizationModel: node.summarizationModel as string,
      createdAt: parseNeo4jTimestamp(node.createdAt),
      metadata,
    };
  }
}
