/**
 * CrossProjectLearningService
 * Story 12.6: Cross-Project Learning
 *
 * Provides cross-project pattern detection, storage, and retrieval.
 * Identifies recurring patterns across projects within a workspace
 * and makes them available as workspace-level learning for agent context.
 *
 * Depends on GraphitiService for episode queries across projects,
 * Neo4jService for pattern node CRUD, and MemoryQueryService for
 * keyword similarity scoring.
 */
import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { GraphitiService } from './graphiti.service';
import { Neo4jService } from './neo4j.service';
import { MemoryQueryService } from './memory-query.service';
import {
  WorkspacePattern,
  PatternType,
  PatternConfidence,
  PatternStatus,
  PatternFilters,
  PatternDetectionResult,
  PatternRecommendation,
  PatternAdoptionStats,
  MemoryEpisode,
} from '../interfaces/memory.interfaces';
import { toNumber, safeJsonParse, parseNeo4jTimestamp } from '../utils/neo4j.utils';

@Injectable()
export class CrossProjectLearningService {
  private readonly logger = new Logger(CrossProjectLearningService.name);

  constructor(
    private readonly graphitiService: GraphitiService,
    private readonly neo4jService: Neo4jService,
    @Inject(forwardRef(() => MemoryQueryService))
    private readonly memoryQueryService: MemoryQueryService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Pattern Detection ──────────────────────────────────────────────────────

  /**
   * Scan workspace episodes to identify recurring patterns across projects.
   * Compares episodes from different projects using keyword similarity.
   */
  async detectPatterns(workspaceId: string): Promise<PatternDetectionResult> {
    const startTime = Date.now();
    let newPatterns = 0;
    let updatedPatterns = 0;

    try {
      // Get all distinct project IDs in the workspace
      const projectIds = await this.getWorkspaceProjectIds(workspaceId);

      if (projectIds.length < 2) {
        this.logger.log(
          `Workspace ${workspaceId} has fewer than 2 projects. No cross-project detection possible.`,
        );
        const totalPatterns = await this.countWorkspacePatterns(workspaceId);
        return {
          newPatterns: 0,
          updatedPatterns: 0,
          totalPatterns,
          detectionDurationMs: Date.now() - startTime,
        };
      }

      const maxPatternsPerWorkspace = this.getMaxPatternsPerWorkspace();
      const currentPatternCount = await this.countWorkspacePatterns(workspaceId);

      // Retrieve episodes for each project
      const batchSize = this.getDetectionBatchSize();
      const projectEpisodes: Map<string, MemoryEpisode[]> = new Map();

      for (const projectId of projectIds) {
        const episodes = await this.graphitiService.searchEpisodes({
          projectId,
          workspaceId,
          maxResults: batchSize,
        });
        if (episodes.length > 0) {
          projectEpisodes.set(projectId, episodes);
        }
      }

      // Compare episodes across project pairs
      const projectIdList = [...projectEpisodes.keys()];
      const candidateGroups: Map<string, {
        episodes: MemoryEpisode[];
        projectIds: Set<string>;
      }> = new Map();

      const similarityThreshold = this.getSimilarityThreshold();
      const minEpisodes = this.getMinEpisodes();
      const maxComparisons = this.getMaxComparisons();
      let comparisonCount = 0;

      for (let i = 0; i < projectIdList.length; i++) {
        for (let j = i + 1; j < projectIdList.length; j++) {
          const episodesA = projectEpisodes.get(projectIdList[i]) ?? [];
          const episodesB = projectEpisodes.get(projectIdList[j]) ?? [];

          for (const epA of episodesA) {
            for (const epB of episodesB) {
              comparisonCount++;
              if (comparisonCount > maxComparisons) {
                this.logger.warn(
                  `Workspace ${workspaceId}: comparison limit (${maxComparisons}) reached. Stopping detection early.`,
                );
                break;
              }

              const similarity = this.memoryQueryService.calculateKeywordRelevance(
                epA.content,
                epB.content,
              );

              if (similarity >= similarityThreshold) {
                // Try to add to existing candidate group
                let addedToGroup = false;
                for (const [, group] of candidateGroups) {
                  const groupSimilarity = this.memoryQueryService.calculateKeywordRelevance(
                    group.episodes[0].content,
                    epA.content,
                  );
                  if (groupSimilarity >= similarityThreshold) {
                    // Deduplicate: only add episodes not already in the group
                    const existingIds = new Set(group.episodes.map((ep) => ep.id));
                    if (!existingIds.has(epA.id)) group.episodes.push(epA);
                    if (!existingIds.has(epB.id)) group.episodes.push(epB);
                    group.projectIds.add(epA.projectId);
                    group.projectIds.add(epB.projectId);
                    addedToGroup = true;
                    break;
                  }
                }

                if (!addedToGroup) {
                  const groupId = uuidv4();
                  candidateGroups.set(groupId, {
                    episodes: [epA, epB],
                    projectIds: new Set([epA.projectId, epB.projectId]),
                  });
                }
              }
            }
            if (comparisonCount > maxComparisons) break;
          }
          if (comparisonCount > maxComparisons) break;
        }
        if (comparisonCount > maxComparisons) break;
      }

      // Get existing patterns for deduplication
      const existingPatterns = await this.getWorkspacePatterns(workspaceId, {
        limit: maxPatternsPerWorkspace,
      });

      const dedupThreshold = this.getDedupThreshold();

      // Process candidate groups
      for (const [, group] of candidateGroups) {
        if (group.episodes.length < minEpisodes) continue;

        // Use the first episode's content as representative
        const representativeContent = group.episodes[0].content;
        const projectCount = group.projectIds.size;
        const confidence = this.determineConfidence(projectCount);
        const patternType = this.determinePatternType(group.episodes);

        // Deduplicate against existing patterns
        let existingMatch: WorkspacePattern | null = null;
        for (const existing of existingPatterns) {
          const dedupSimilarity = this.memoryQueryService.calculateKeywordRelevance(
            representativeContent,
            existing.content,
          );
          if (dedupSimilarity >= dedupThreshold) {
            existingMatch = existing;
            break;
          }
        }

        if (existingMatch) {
          // Update existing pattern
          const newProjectIds = [...new Set([
            ...existingMatch.sourceProjectIds,
            ...group.projectIds,
          ])];
          const newEpisodeIds = [...new Set([
            ...existingMatch.sourceEpisodeIds,
            ...group.episodes.map((ep) => ep.id),
          ])];
          const newProjectCount = newProjectIds.length;

          await this.updatePatternNode(existingMatch.id, {
            sourceProjectIds: newProjectIds,
            sourceEpisodeIds: newEpisodeIds,
            occurrenceCount: newProjectCount,
            confidence: this.determineConfidence(newProjectCount),
          });
          updatedPatterns++;
        } else {
          // Check limit before creating
          if (currentPatternCount + newPatterns >= maxPatternsPerWorkspace) {
            this.logger.warn(
              `Workspace ${workspaceId} reached max pattern limit (${maxPatternsPerWorkspace}). Skipping new patterns.`,
            );
            break;
          }

          // Create new pattern
          const sourceEpisodeIds = [...new Set(group.episodes.map((ep) => ep.id))];
          const sourceProjectIds = [...group.projectIds];

          await this.createPatternNode({
            workspaceId,
            patternType,
            content: representativeContent,
            sourceProjectIds,
            sourceEpisodeIds,
            occurrenceCount: projectCount,
            confidence,
            status: 'active' as PatternStatus,
            overriddenBy: null,
            overrideReason: null,
            metadata: {},
          });
          newPatterns++;
        }
      }

      const totalPatterns = await this.countWorkspacePatterns(workspaceId);

      return {
        newPatterns,
        updatedPatterns,
        totalPatterns,
        detectionDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      this.logger.error(
        `Pattern detection failed for workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      this.logger.warn(
        `Pattern detection partial result for workspace ${workspaceId}: ${newPatterns} new, ${updatedPatterns} updated before failure.`,
      );

      const totalPatterns = await this.countWorkspacePatterns(workspaceId).catch(() => 0);
      return {
        newPatterns,
        updatedPatterns,
        totalPatterns,
        detectionDurationMs: Date.now() - startTime,
      };
    }
  }

  // ─── Pattern Retrieval ──────────────────────────────────────────────────────

  /**
   * Retrieve active patterns for a workspace with optional filters.
   */
  async getWorkspacePatterns(
    workspaceId: string,
    filters?: PatternFilters,
  ): Promise<WorkspacePattern[]> {
    const conditions: string[] = ['wp.workspaceId = $workspaceId'];
    const params: Record<string, unknown> = { workspaceId };

    // Default to active status if not explicitly specified
    const status = filters?.status ?? 'active';
    conditions.push('wp.status = $status');
    params.status = status;

    if (filters?.patternType) {
      conditions.push('wp.patternType = $patternType');
      params.patternType = filters.patternType;
    }

    if (filters?.confidence) {
      conditions.push('wp.confidence = $confidence');
      params.confidence = filters.confidence;
    }

    const limit = filters?.limit ?? 50;
    params.limit = limit;

    const cypher = `
      MATCH (wp:WorkspacePattern)
      WHERE ${conditions.join(' AND ')}
      RETURN wp
      ORDER BY wp.occurrenceCount DESC, wp.updatedAt DESC
      LIMIT $limit
    `;

    const result = await this.neo4jService.runQuery(cypher, params);

    return result.records.map((record) => {
      const node = record.get('wp').properties;
      return this.mapNodeToPattern(node);
    });
  }

  // ─── Pattern Recommendations ────────────────────────────────────────────────

  /**
   * Get relevant pattern recommendations for a task in a project.
   * Scores patterns by keyword relevance to the task description.
   */
  async getPatternRecommendations(
    workspaceId: string,
    projectId: string,
    taskDescription: string,
  ): Promise<PatternRecommendation[]> {
    // Retrieve only active patterns
    const patterns = await this.getWorkspacePatterns(workspaceId, {
      status: 'active',
      limit: this.getMaxPatternsPerWorkspace(),
    });

    if (patterns.length === 0) {
      return [];
    }

    // Score and filter patterns
    const recommendations: PatternRecommendation[] = [];

    for (const pattern of patterns) {
      const relevanceScore = this.memoryQueryService.calculateKeywordRelevance(
        taskDescription,
        pattern.content,
      );

      if (relevanceScore > 0) {
        recommendations.push({
          pattern,
          relevanceScore,
          confidenceLabel: this.getConfidenceLabel(pattern.confidence),
        });
      }
    }

    // Sort by confidence level (high > medium > low), then by relevance score
    const confidenceOrder: Record<PatternConfidence, number> = {
      high: 3,
      medium: 2,
      low: 1,
    };

    recommendations.sort((a, b) => {
      const confDiff =
        confidenceOrder[b.pattern.confidence] -
        confidenceOrder[a.pattern.confidence];
      if (confDiff !== 0) return confDiff;
      return b.relevanceScore - a.relevanceScore;
    });

    // Limit results
    return recommendations.slice(0, 20);
  }

  // ─── Pattern Override / Restore ─────────────────────────────────────────────

  /**
   * Mark a pattern as overridden by a user.
   */
  async overridePattern(
    patternId: string,
    userId: string,
    reason: string,
  ): Promise<WorkspacePattern> {
    const existing = await this.getPatternById(patternId);
    if (!existing) {
      throw new NotFoundException(`Pattern ${patternId} not found`);
    }

    return this.updatePatternNode(patternId, {
      status: 'overridden' as PatternStatus,
      overriddenBy: userId,
      overrideReason: reason,
    });
  }

  /**
   * Restore an overridden pattern to active status.
   */
  async restorePattern(patternId: string): Promise<WorkspacePattern> {
    const existing = await this.getPatternById(patternId);
    if (!existing) {
      throw new NotFoundException(`Pattern ${patternId} not found`);
    }

    return this.updatePatternNode(patternId, {
      status: 'active' as PatternStatus,
      overriddenBy: null,
      overrideReason: null,
    });
  }

  // ─── Adoption Stats ─────────────────────────────────────────────────────────

  /**
   * Get adoption statistics for workspace patterns.
   */
  async getPatternAdoptionStats(
    workspaceId: string,
  ): Promise<PatternAdoptionStats> {
    const cypher = `
      MATCH (wp:WorkspacePattern {workspaceId: $workspaceId})
      RETURN wp.confidence as confidence,
             wp.patternType as patternType,
             wp.status as status,
             wp.occurrenceCount as occurrenceCount,
             wp.id as id
    `;

    const result = await this.neo4jService.runQuery(cypher, { workspaceId });

    if (result.records.length === 0) {
      return {
        totalPatterns: 0,
        byConfidence: { low: 0, medium: 0, high: 0 },
        byType: {
          architecture: 0,
          error: 0,
          testing: 0,
          deployment: 0,
          security: 0,
        },
        overrideRate: 0,
        averageOccurrenceCount: 0,
        topPatterns: [],
      };
    }

    const byConfidence = { low: 0, medium: 0, high: 0 };
    const byType: Record<PatternType, number> = {
      architecture: 0,
      error: 0,
      testing: 0,
      deployment: 0,
      security: 0,
    };
    let activeCount = 0;
    let overriddenCount = 0;
    let totalOccurrence = 0;

    for (const record of result.records) {
      const confidence = record.get('confidence') as PatternConfidence;
      const patternType = record.get('patternType') as PatternType;
      const status = record.get('status') as PatternStatus;
      const occurrenceCount = toNumber(record.get('occurrenceCount'));

      if (confidence in byConfidence) {
        byConfidence[confidence]++;
      }
      if (patternType in byType) {
        byType[patternType]++;
      }
      if (status === 'active') activeCount++;
      if (status === 'overridden') overriddenCount++;
      totalOccurrence += occurrenceCount;
    }

    const totalPatterns = result.records.length;
    const overrideRate =
      activeCount + overriddenCount > 0
        ? overriddenCount / (activeCount + overriddenCount)
        : 0;
    const averageOccurrenceCount =
      totalPatterns > 0 ? totalOccurrence / totalPatterns : 0;

    // Get top 5 patterns by occurrence count
    const topPatterns = await this.getWorkspacePatterns(workspaceId, {
      limit: 5,
    });

    return {
      totalPatterns,
      byConfidence,
      byType,
      overrideRate,
      averageOccurrenceCount,
      topPatterns,
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Create a WorkspacePattern node in Neo4j.
   */
  private async createPatternNode(
    pattern: Omit<WorkspacePattern, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<WorkspacePattern> {
    const id = uuidv4();
    const now = new Date();

    const cypher = `
      CREATE (wp:WorkspacePattern {
        id: $id,
        workspaceId: $workspaceId,
        patternType: $patternType,
        content: $content,
        sourceProjectIds: $sourceProjectIds,
        sourceEpisodeIds: $sourceEpisodeIds,
        occurrenceCount: $occurrenceCount,
        confidence: $confidence,
        status: $status,
        overriddenBy: $overriddenBy,
        overrideReason: $overrideReason,
        createdAt: datetime($createdAt),
        updatedAt: datetime($updatedAt),
        metadata: $metadata
      })
      MERGE (w:WorkspaceNode {workspaceId: $workspaceId})
      ON CREATE SET w.createdAt = datetime($createdAt)
      CREATE (wp)-[:IN_WORKSPACE]->(w)
      RETURN wp
    `;

    await this.neo4jService.runQuery(cypher, {
      id,
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
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      metadata: JSON.stringify(pattern.metadata),
    });

    return {
      id,
      ...pattern,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Update a WorkspacePattern node's properties.
   */
  private async updatePatternNode(
    patternId: string,
    updates: Partial<WorkspacePattern>,
  ): Promise<WorkspacePattern> {
    const now = new Date();
    const setClauses: string[] = ['wp.updatedAt = datetime($updatedAt)'];
    const params: Record<string, unknown> = {
      patternId,
      updatedAt: now.toISOString(),
    };

    if (updates.status !== undefined) {
      setClauses.push('wp.status = $status');
      params.status = updates.status;
    }
    if (updates.overriddenBy !== undefined) {
      setClauses.push('wp.overriddenBy = $overriddenBy');
      params.overriddenBy = updates.overriddenBy;
    }
    if (updates.overrideReason !== undefined) {
      setClauses.push('wp.overrideReason = $overrideReason');
      params.overrideReason = updates.overrideReason;
    }
    if (updates.sourceProjectIds !== undefined) {
      setClauses.push('wp.sourceProjectIds = $sourceProjectIds');
      params.sourceProjectIds = updates.sourceProjectIds;
    }
    if (updates.sourceEpisodeIds !== undefined) {
      setClauses.push('wp.sourceEpisodeIds = $sourceEpisodeIds');
      params.sourceEpisodeIds = updates.sourceEpisodeIds;
    }
    if (updates.occurrenceCount !== undefined) {
      setClauses.push('wp.occurrenceCount = $occurrenceCount');
      params.occurrenceCount = updates.occurrenceCount;
    }
    if (updates.confidence !== undefined) {
      setClauses.push('wp.confidence = $confidence');
      params.confidence = updates.confidence;
    }

    const cypher = `
      MATCH (wp:WorkspacePattern {id: $patternId})
      SET ${setClauses.join(', ')}
      RETURN wp
    `;

    const result = await this.neo4jService.runQuery(cypher, params);

    if (result.records.length === 0) {
      throw new NotFoundException(`Pattern ${patternId} not found`);
    }

    const node = result.records[0].get('wp').properties;
    return this.mapNodeToPattern(node);
  }

  /**
   * Get a pattern by its ID.
   */
  private async getPatternById(patternId: string): Promise<WorkspacePattern | null> {
    const cypher = `
      MATCH (wp:WorkspacePattern {id: $patternId})
      RETURN wp
    `;

    const result = await this.neo4jService.runQuery(cypher, { patternId });

    if (result.records.length === 0) {
      return null;
    }

    const node = result.records[0].get('wp').properties;
    return this.mapNodeToPattern(node);
  }

  /**
   * Get all distinct project IDs in a workspace from Episode nodes.
   */
  private async getWorkspaceProjectIds(workspaceId: string): Promise<string[]> {
    const cypher = `
      MATCH (e:Episode {workspaceId: $workspaceId})
      RETURN DISTINCT e.projectId as projectId
    `;

    const result = await this.neo4jService.runQuery(cypher, { workspaceId });
    return result.records.map((record) => record.get('projectId') as string);
  }

  /**
   * Count total workspace patterns.
   */
  private async countWorkspacePatterns(workspaceId: string): Promise<number> {
    const cypher = `
      MATCH (wp:WorkspacePattern {workspaceId: $workspaceId})
      RETURN count(wp) as count
    `;

    const result = await this.neo4jService.runQuery(cypher, { workspaceId });
    const count = result.records[0]?.get('count');
    return count !== undefined ? toNumber(count) : 0;
  }

  /**
   * Map a Neo4j node to a WorkspacePattern interface.
   */
  private mapNodeToPattern(node: Record<string, unknown>): WorkspacePattern {
    return {
      id: node.id as string,
      workspaceId: node.workspaceId as string,
      patternType: node.patternType as PatternType,
      content: node.content as string,
      sourceProjectIds: (node.sourceProjectIds as string[]) ?? [],
      sourceEpisodeIds: (node.sourceEpisodeIds as string[]) ?? [],
      occurrenceCount: node.occurrenceCount != null ? toNumber(node.occurrenceCount) : 0,
      confidence: node.confidence as PatternConfidence,
      status: node.status as PatternStatus,
      overriddenBy: (node.overriddenBy as string) ?? null,
      overrideReason: (node.overrideReason as string) ?? null,
      createdAt: parseNeo4jTimestamp(node.createdAt),
      updatedAt: parseNeo4jTimestamp(node.updatedAt),
      metadata: safeJsonParse(node.metadata as string),
    };
  }

  /**
   * Determine pattern type from a group of episodes.
   * Uses keyword analysis on episode content.
   */
  private determinePatternType(episodes: MemoryEpisode[]): PatternType {
    const allContent = episodes.map((ep) => ep.content.toLowerCase()).join(' ');

    // Keyword-based classification
    const testingKeywords = ['test', 'spec', 'mock', 'assert', 'jest', 'coverage'];
    const deploymentKeywords = ['deploy', 'ci', 'cd', 'pipeline', 'docker', 'kubernetes', 'build'];
    const securityKeywords = ['auth', 'encrypt', 'secret', 'token', 'permission', 'credential', 'vault'];
    const architectureKeywords = ['architecture', 'state', 'component', 'pattern', 'framework', 'design', 'module'];
    const errorKeywords = ['error', 'bug', 'fix', 'retry', 'failure', 'exception', 'crash'];

    const scores: Record<PatternType, number> = {
      testing: this.countKeywordMatches(allContent, testingKeywords),
      deployment: this.countKeywordMatches(allContent, deploymentKeywords),
      security: this.countKeywordMatches(allContent, securityKeywords),
      architecture: this.countKeywordMatches(allContent, architectureKeywords),
      error: this.countKeywordMatches(allContent, errorKeywords),
    };

    // Find highest scoring type
    let bestType: PatternType = 'architecture'; // default
    let bestScore = 0;
    for (const [type, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type as PatternType;
      }
    }

    // Also consider episodeType mapping as fallback
    if (bestScore === 0) {
      const typeCounts: Record<string, number> = {};
      for (const ep of episodes) {
        typeCounts[ep.episodeType] = (typeCounts[ep.episodeType] ?? 0) + 1;
      }

      const dominantType = Object.entries(typeCounts).sort(
        (a, b) => b[1] - a[1],
      )[0]?.[0];

      const typeMapping: Record<string, PatternType> = {
        decision: 'architecture',
        problem: 'error',
        pattern: 'architecture',
        fact: 'architecture',
        preference: 'architecture',
      };

      bestType = typeMapping[dominantType] ?? 'architecture';
    }

    return bestType;
  }

  /**
   * Count keyword matches in text.
   */
  private countKeywordMatches(text: string, keywords: string[]): number {
    return keywords.reduce((count, keyword) => {
      return count + (text.includes(keyword) ? 1 : 0);
    }, 0);
  }

  /**
   * Determine confidence level based on the number of projects where pattern was observed.
   */
  /**
   * Determine confidence level based on project count.
   * Exposed for testing only via (service as any).determineConfidence().
   */
  private determineConfidence(projectCount: number): PatternConfidence {
    const lowThreshold = this.getLowConfidenceThreshold();
    const mediumThreshold = this.getMediumConfidenceThreshold();

    if (projectCount <= lowThreshold) return 'low';
    if (projectCount <= mediumThreshold) return 'medium';
    return 'high';
  }

  /**
   * Get confidence label prefix for pattern recommendations.
   */
  private getConfidenceLabel(confidence: PatternConfidence): string {
    switch (confidence) {
      case 'high':
        return '[AUTO-APPLY]';
      case 'medium':
        return '[RECOMMENDED]';
      case 'low':
        return '[SUGGESTION]';
      default:
        return '[SUGGESTION]';
    }
  }

  // ─── Configuration Helpers ──────────────────────────────────────────────────

  private getSimilarityThreshold(): number {
    const value = parseFloat(
      this.configService.get<string>('CROSS_PROJECT_SIMILARITY_THRESHOLD', '0.7'),
    );
    return isNaN(value) ? 0.7 : value;
  }

  private getDedupThreshold(): number {
    const value = parseFloat(
      this.configService.get<string>('CROSS_PROJECT_DEDUP_THRESHOLD', '0.85'),
    );
    return isNaN(value) ? 0.85 : value;
  }

  private getMinEpisodes(): number {
    const value = parseInt(
      this.configService.get<string>('CROSS_PROJECT_MIN_EPISODES', '2'),
      10,
    );
    return isNaN(value) ? 2 : value;
  }

  private getLowConfidenceThreshold(): number {
    const value = parseInt(
      this.configService.get<string>('CROSS_PROJECT_LOW_CONFIDENCE_PROJECTS', '2'),
      10,
    );
    return isNaN(value) ? 2 : value;
  }

  private getMediumConfidenceThreshold(): number {
    const value = parseInt(
      this.configService.get<string>('CROSS_PROJECT_MEDIUM_CONFIDENCE_PROJECTS', '4'),
      10,
    );
    return isNaN(value) ? 4 : value;
  }

  private getDetectionBatchSize(): number {
    const value = parseInt(
      this.configService.get<string>('CROSS_PROJECT_DETECTION_BATCH_SIZE', '100'),
      10,
    );
    return isNaN(value) ? 100 : value;
  }

  private getMaxComparisons(): number {
    const value = parseInt(
      this.configService.get<string>('CROSS_PROJECT_MAX_COMPARISONS', '50000'),
      10,
    );
    return isNaN(value) ? 50000 : value;
  }

  private getMaxPatternsPerWorkspace(): number {
    const value = parseInt(
      this.configService.get<string>('CROSS_PROJECT_MAX_PATTERNS_PER_WORKSPACE', '500'),
      10,
    );
    return isNaN(value) ? 500 : value;
  }
}
