/**
 * MemoryQueryService
 * Story 12.3: Memory Query Service
 *
 * Provides a high-level query interface on top of GraphitiService.
 * Combines multiple search strategies for comprehensive results:
 * - Direct filter search via GraphitiService.searchEpisodes
 * - Keyword-based relevance scoring
 * - Time-weighted scoring (exponential decay)
 * - Type-priority scoring
 * - Feedback bonus scoring
 *
 * Also provides agent-focused context assembly and relevance feedback recording.
 */
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphitiService } from './graphiti.service';
import { Neo4jService } from './neo4j.service';
import {
  MemoryEpisode,
  MemoryEpisodeType,
  MemoryQueryInput,
  MemoryQueryResult,
  FormattedMemoryContext,
  PatternRecommendation,
} from '../interfaces/memory.interfaces';

/**
 * Stop words to filter from natural language queries.
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'because', 'but', 'and', 'or', 'if', 'while', 'about',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'it', 'its', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'you',
  'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
]);

/**
 * Type priority map for scoring episodes by type importance.
 */
const TYPE_PRIORITY: Record<MemoryEpisodeType, number> = {
  decision: 1.0,
  problem: 0.9,
  fact: 0.7,
  pattern: 0.6,
  preference: 0.5,
};

/**
 * Agent-type-specific type filters for context queries.
 */
const AGENT_TYPE_FILTERS: Record<string, MemoryEpisodeType[]> = {
  dev: ['decision', 'problem', 'fact'],
  qa: ['pattern', 'problem', 'fact'],
  planner: ['decision', 'pattern'],
  devops: ['fact', 'problem', 'pattern'],
};

/**
 * Section headers for formatted context output, in priority order.
 */
const SECTION_HEADERS: Record<MemoryEpisodeType, string> = {
  decision: 'Decisions',
  problem: 'Problems Solved',
  fact: 'Facts',
  pattern: 'Patterns',
  preference: 'Preferences',
};

/**
 * Display order for sections in formatted context.
 */
const SECTION_ORDER: MemoryEpisodeType[] = [
  'decision',
  'problem',
  'fact',
  'pattern',
  'preference',
];

@Injectable()
export class MemoryQueryService {
  private readonly logger = new Logger(MemoryQueryService.name);

  // Story 12.6: Optional CrossProjectLearningService injection
  // Using @Optional() + @Inject() with string token to prevent circular dependency
  private crossProjectLearningService: any;

  constructor(
    private readonly graphitiService: GraphitiService,
    private readonly neo4jService: Neo4jService,
    private readonly configService: ConfigService,
    @Optional() @Inject('CrossProjectLearningService') crossProjectLearning?: any,
  ) {
    this.crossProjectLearningService = crossProjectLearning ?? null;
  }

  /**
   * Main query method. Retrieves and scores memories based on multiple factors.
   */
  async query(input: MemoryQueryInput): Promise<MemoryQueryResult> {
    const startTime = Date.now();

    try {
      const maxResults = input.filters?.maxResults ?? this.getDefaultMaxResults();
      const candidateMultiplier = this.getCandidateMultiplier();
      const candidateCount = maxResults <= 10 ? maxResults * candidateMultiplier : maxResults;

      // Search for candidate episodes
      const candidates = await this.graphitiService.searchEpisodes({
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        types: input.filters?.types as MemoryEpisodeType[] | undefined,
        entityNames: input.filters?.entityIds,
        since: input.filters?.since,
        maxResults: candidateCount,
      });

      if (candidates.length === 0) {
        return {
          memories: [],
          totalCount: 0,
          relevanceScores: [],
          queryDurationMs: Date.now() - startTime,
        };
      }

      // Score and rank candidates
      const now = new Date();
      const scored = candidates.map((episode) => ({
        episode,
        score: this.scoreEpisode(episode, input.query, now),
      }));

      // Sort by score descending
      scored.sort((a, b) => b.score - a.score);

      // Take top results
      const topResults = scored.slice(0, maxResults);

      return {
        memories: topResults.map((r) => r.episode),
        totalCount: candidates.length,
        relevanceScores: topResults.map((r) => r.score),
        queryDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      this.logger.error(
        `Memory query failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        memories: [],
        totalCount: 0,
        relevanceScores: [],
        queryDurationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Agent-focused query that returns formatted context string.
   * Queries relevant memories based on task description and formats
   * them as a structured context section grouped by type.
   */
  async queryForAgentContext(
    projectId: string,
    workspaceId: string,
    taskDescription: string,
    agentType: string,
    maxTokens?: number,
  ): Promise<FormattedMemoryContext> {
    const tokenBudget = maxTokens ?? this.getDefaultTokenBudget();
    const typeFilters = AGENT_TYPE_FILTERS[agentType] ?? Object.keys(TYPE_PRIORITY) as MemoryEpisodeType[];

    const result = await this.query({
      projectId,
      workspaceId,
      query: taskDescription,
      filters: {
        types: typeFilters,
        maxResults: 50, // Fetch more for context assembly
      },
    });

    if (result.memories.length === 0 && !this.crossProjectLearningService) {
      return { contextString: '', memoryCount: 0 };
    }

    // Group memories by type
    const grouped: Record<string, MemoryEpisode[]> = {};
    for (const memory of result.memories) {
      if (!grouped[memory.episodeType]) {
        grouped[memory.episodeType] = [];
      }
      grouped[memory.episodeType].push(memory);
    }

    // Build formatted sections in priority order
    const sections: string[] = [];
    let totalTokens = 0;
    const headerTokens = this.estimateTokens('## Relevant Project Memory\n\n');
    totalTokens += headerTokens;
    let memoryCount = 0;

    for (const type of SECTION_ORDER) {
      const memories = grouped[type];
      if (!memories || memories.length === 0) continue;

      const header = `### ${SECTION_HEADERS[type]}`;
      const headerSize = this.estimateTokens(header + '\n');

      if (totalTokens + headerSize > tokenBudget) break;

      const lines: string[] = [];
      let sectionBodyTokens = 0;
      for (const memory of memories) {
        const dateStr = memory.timestamp instanceof Date
          ? memory.timestamp.toISOString().split('T')[0]
          : String(memory.timestamp).split('T')[0];
        const line = `- [${dateStr}] ${memory.content} (confidence: ${memory.confidence})`;
        const lineTokens = this.estimateTokens(line + '\n');

        if (totalTokens + headerSize + sectionBodyTokens + lineTokens > tokenBudget) {
          break;
        }

        lines.push(line);
        sectionBodyTokens += lineTokens;
        memoryCount++;
      }

      if (lines.length > 0) {
        totalTokens += headerSize + sectionBodyTokens;
        sections.push(`${header}\n${lines.join('\n')}`);
      }
    }

    if (sections.length === 0 && !this.crossProjectLearningService) {
      return { contextString: '', memoryCount: 0 };
    }

    // Story 12.6: Add workspace patterns section
    let patternsSection = '';
    if (this.crossProjectLearningService) {
      try {
        patternsSection = await this.buildWorkspacePatternsSection(
          workspaceId,
          projectId,
          taskDescription,
          tokenBudget - totalTokens,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to fetch workspace patterns: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (sections.length === 0 && !patternsSection) {
      return { contextString: '', memoryCount: 0 };
    }

    let contextString = '';
    if (sections.length > 0) {
      contextString = `## Relevant Project Memory\n\n${sections.join('\n\n')}`;
    }
    if (patternsSection) {
      contextString = contextString
        ? `${contextString}\n\n${patternsSection}`
        : patternsSection;
    }

    return { contextString, memoryCount };
  }

  /**
   * Record whether a memory episode was useful for a task.
   * Updates usefulCount/notUsefulCount in episode metadata.
   */
  async recordRelevanceFeedback(
    episodeId: string,
    wasUseful: boolean,
  ): Promise<boolean> {
    try {
      const episode = await this.graphitiService.getEpisode(episodeId);

      if (!episode) {
        this.logger.warn(
          `Cannot record feedback: episode ${episodeId} not found`,
        );
        return false;
      }

      const metadata = { ...episode.metadata };
      const usefulCount = (metadata.usefulCount as number) ?? 0;
      const notUsefulCount = (metadata.notUsefulCount as number) ?? 0;

      if (wasUseful) {
        metadata.usefulCount = usefulCount + 1;
      } else {
        metadata.notUsefulCount = notUsefulCount + 1;
      }

      const cypher = `
        MATCH (e:Episode {id: $episodeId})
        SET e.metadata = $updatedMetadata
        RETURN e.id as id
      `;

      await this.neo4jService.runQuery(cypher, {
        episodeId,
        updatedMetadata: JSON.stringify(metadata),
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to record feedback for episode ${episodeId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  // ─── Workspace Patterns (Story 12.6) ─────────────────────────────────────────

  /**
   * Build a "Workspace Patterns" section for agent context.
   * Retrieves cross-project pattern recommendations and formats them
   * with confidence labels ([AUTO-APPLY], [RECOMMENDED], [SUGGESTION]).
   */
  private async buildWorkspacePatternsSection(
    workspaceId: string,
    projectId: string,
    taskDescription: string,
    remainingBudget: number,
  ): Promise<string> {
    const patternBudget = Math.min(
      remainingBudget,
      this.getPatternContextBudget(),
    );

    if (patternBudget <= 0) return '';

    const recommendations: PatternRecommendation[] =
      await this.crossProjectLearningService.getPatternRecommendations(
        workspaceId,
        projectId,
        taskDescription,
      );

    if (!recommendations || recommendations.length === 0) return '';

    const header = '### Workspace Patterns';
    let totalTokens = this.estimateTokens(header + '\n\n');
    const lines: string[] = [];

    for (const rec of recommendations) {
      const line = `- ${rec.confidenceLabel} ${rec.pattern.content} (observed in ${rec.pattern.occurrenceCount} projects, confidence: ${rec.pattern.confidence})`;
      const lineTokens = this.estimateTokens(line + '\n');

      if (totalTokens + lineTokens > patternBudget) break;

      lines.push(line);
      totalTokens += lineTokens;
    }

    if (lines.length === 0) return '';

    return `${header}\n\n${lines.join('\n')}`;
  }

  // ─── Scoring Methods ──────────────────────────────────────────────────────────

  /**
   * Combined scoring of an episode against a query.
   * Weights: keyword=0.5, time=0.2, type=0.2, feedback=0.1
   */
  scoreEpisode(episode: MemoryEpisode, query: string, now: Date): number {
    const keywordScore = this.calculateKeywordRelevance(query, episode.content);
    const timeScore = this.calculateTimeRecency(episode.timestamp, now);
    const typeScore = this.calculateTypePriority(episode.episodeType);
    const feedbackScore = this.calculateFeedbackBonus(episode.metadata);

    const combined =
      keywordScore * 0.5 +
      timeScore * 0.2 +
      typeScore * 0.2 +
      feedbackScore * 0.1;

    return Math.max(0, Math.min(1, combined));
  }

  /**
   * Extract keywords from a natural language query.
   * Tokenizes, lowercases, removes stop words, deduplicates.
   */
  extractKeywords(query: string): string[] {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const words = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 0);

    const keywords = words.filter((word) => !STOP_WORDS.has(word));
    return [...new Set(keywords)];
  }

  /**
   * Calculate keyword relevance using Jaccard similarity.
   * Returns 0-1 score based on overlap between query keywords and content words.
   */
  calculateKeywordRelevance(query: string, episodeContent: string): number {
    const queryKeywords = this.extractKeywords(query);
    const contentWords = this.extractKeywords(episodeContent);

    if (queryKeywords.length === 0 || contentWords.length === 0) {
      return 0;
    }

    const querySet = new Set(queryKeywords);
    const contentSet = new Set(contentWords);
    const intersection = [...querySet].filter((k) => contentSet.has(k));
    const union = new Set([...querySet, ...contentSet]);

    return union.size > 0 ? intersection.length / union.size : 0;
  }

  /**
   * Calculate time recency score using exponential decay.
   * Returns 1.0 for brand new episodes, ~0.5 at half-life, approaches 0 for old.
   */
  calculateTimeRecency(episodeTimestamp: Date, now: Date): number {
    const halfLifeDays = this.getTimeDecayHalfLife();
    const daysDiff =
      (now.getTime() - episodeTimestamp.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff < 0) return 1.0;

    return Math.exp((-0.693 * daysDiff) / halfLifeDays);
  }

  /**
   * Calculate type priority score.
   * decisions=1.0, problems=0.9, facts=0.7, patterns=0.6, preferences=0.5
   */
  calculateTypePriority(episodeType: MemoryEpisodeType): number {
    return TYPE_PRIORITY[episodeType] ?? 0.5;
  }

  /**
   * Calculate feedback bonus based on episode metadata.
   * +0.1 for episodes marked useful, -0.05 for not useful, 0 otherwise.
   */
  calculateFeedbackBonus(metadata: Record<string, unknown>): number {
    const usefulCount = (metadata?.usefulCount as number) ?? 0;
    const notUsefulCount = (metadata?.notUsefulCount as number) ?? 0;

    if (usefulCount > notUsefulCount) return 0.1;
    if (notUsefulCount > usefulCount) return -0.05;
    return 0;
  }

  // ─── Configuration Helpers ─────────────────────────────────────────────────────

  private getDefaultMaxResults(): number {
    const value = parseInt(
      this.configService.get<string>('MEMORY_QUERY_MAX_RESULTS', '10'),
      10,
    );
    return isNaN(value) ? 10 : value;
  }

  private getCandidateMultiplier(): number {
    const value = parseInt(
      this.configService.get<string>('MEMORY_QUERY_CANDIDATE_MULTIPLIER', '3'),
      10,
    );
    return isNaN(value) ? 3 : value;
  }

  private getDefaultTokenBudget(): number {
    const value = parseInt(
      this.configService.get<string>('MEMORY_QUERY_DEFAULT_TOKEN_BUDGET', '4000'),
      10,
    );
    return isNaN(value) ? 4000 : value;
  }

  private getPatternContextBudget(): number {
    const value = parseInt(
      this.configService.get<string>('CROSS_PROJECT_PATTERN_CONTEXT_BUDGET', '2000'),
      10,
    );
    return isNaN(value) ? 2000 : value;
  }

  private getTimeDecayHalfLife(): number {
    const value = parseInt(
      this.configService.get<string>(
        'MEMORY_QUERY_TIME_DECAY_HALF_LIFE_DAYS',
        '30',
      ),
      10,
    );
    return isNaN(value) ? 30 : value;
  }

  /**
   * Estimate token count for a string (~4 chars per token).
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
