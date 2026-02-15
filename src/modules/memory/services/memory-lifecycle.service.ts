/**
 * MemoryLifecycleService
 * Story 12.9: Memory Lifecycle Management
 *
 * Automated memory lifecycle management for the knowledge graph.
 * Handles pruning of stale memories, consolidation of redundant memories,
 * archival of old memories, project memory cap enforcement,
 * workspace-configurable policies, and pin/unpin/delete operations.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import { GraphitiService } from './graphiti.service';
import { Neo4jService } from './neo4j.service';
import {
  MemoryLifecyclePolicy,
  LifecycleResult,
  PruneResult,
  ConsolidationResult,
  ArchiveResult,
  CapEnforcementResult,
  LifecycleReport,
  MemoryEpisode,
} from '../interfaces/memory.interfaces';
import { toNumber, safeJsonParse, parseNeo4jTimestamp } from '../utils/neo4j.utils';

/**
 * Common English stopwords to exclude from keyword similarity calculations.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'it', 'its', 'this',
  'that', 'these', 'those', 'i', 'me', 'my', 'we', 'us', 'our', 'you',
  'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
  'not', 'no', 'nor', 'so', 'as', 'if', 'then', 'than', 'too', 'very',
]);

@Injectable()
export class MemoryLifecycleService {
  private readonly logger = new Logger(MemoryLifecycleService.name);

  constructor(
    private readonly graphitiService: GraphitiService,
    private readonly neo4jService: Neo4jService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Policy Management ──────────────────────────────────────────────────────

  /**
   * Get lifecycle policy for a workspace.
   * Returns stored policy from Neo4j, or defaults from environment/hardcoded values.
   */
  async getLifecyclePolicy(workspaceId: string): Promise<MemoryLifecyclePolicy> {
    try {
      const cypher = `
        MATCH (p:LifecyclePolicy {workspaceId: $workspaceId})
        RETURN p
      `;
      const result = await this.neo4jService.runQuery(cypher, { workspaceId });

      if (result.records.length > 0) {
        const node = result.records[0].get('p').properties;
        return {
          workspaceId: node.workspaceId as string,
          pruneAfterDays: toNumber(node.pruneAfterDays),
          consolidateThreshold: toNumber(node.consolidateThreshold),
          archiveAfterDays: toNumber(node.archiveAfterDays),
          maxMemoriesPerProject: toNumber(node.maxMemoriesPerProject),
          retainDecisionsForever: node.retainDecisionsForever as boolean,
          retainPatternsForever: node.retainPatternsForever as boolean,
          createdAt: parseNeo4jTimestamp(node.createdAt),
          updatedAt: parseNeo4jTimestamp(node.updatedAt),
        };
      }
    } catch (error) {
      this.logger.warn(
        `Failed to fetch lifecycle policy for workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Return defaults
    return this.getDefaultPolicy(workspaceId);
  }

  /**
   * Update lifecycle policy for a workspace.
   * Creates if it does not exist, merges provided fields if it does.
   */
  async updateLifecyclePolicy(
    workspaceId: string,
    updates: Partial<MemoryLifecyclePolicy>,
  ): Promise<MemoryLifecyclePolicy> {
    const currentPolicy = await this.getLifecyclePolicy(workspaceId);

    const merged = {
      pruneAfterDays: updates.pruneAfterDays ?? currentPolicy.pruneAfterDays,
      consolidateThreshold: updates.consolidateThreshold ?? currentPolicy.consolidateThreshold,
      archiveAfterDays: updates.archiveAfterDays ?? currentPolicy.archiveAfterDays,
      maxMemoriesPerProject: updates.maxMemoriesPerProject ?? currentPolicy.maxMemoriesPerProject,
      retainDecisionsForever: updates.retainDecisionsForever ?? currentPolicy.retainDecisionsForever,
      retainPatternsForever: updates.retainPatternsForever ?? currentPolicy.retainPatternsForever,
    };

    const cypher = `
      MERGE (p:LifecyclePolicy {workspaceId: $workspaceId})
      ON CREATE SET
        p.pruneAfterDays = $pruneAfterDays,
        p.consolidateThreshold = $consolidateThreshold,
        p.archiveAfterDays = $archiveAfterDays,
        p.maxMemoriesPerProject = $maxMemoriesPerProject,
        p.retainDecisionsForever = $retainDecisionsForever,
        p.retainPatternsForever = $retainPatternsForever,
        p.createdAt = datetime(),
        p.updatedAt = datetime()
      ON MATCH SET
        p.pruneAfterDays = $pruneAfterDays,
        p.consolidateThreshold = $consolidateThreshold,
        p.archiveAfterDays = $archiveAfterDays,
        p.maxMemoriesPerProject = $maxMemoriesPerProject,
        p.retainDecisionsForever = $retainDecisionsForever,
        p.retainPatternsForever = $retainPatternsForever,
        p.updatedAt = datetime()
      RETURN p
    `;

    const result = await this.neo4jService.runQuery(cypher, {
      workspaceId,
      ...merged,
    });

    const node = result.records[0].get('p').properties;
    return {
      workspaceId: node.workspaceId as string,
      pruneAfterDays: toNumber(node.pruneAfterDays),
      consolidateThreshold: toNumber(node.consolidateThreshold),
      archiveAfterDays: toNumber(node.archiveAfterDays),
      maxMemoriesPerProject: toNumber(node.maxMemoriesPerProject),
      retainDecisionsForever: node.retainDecisionsForever as boolean,
      retainPatternsForever: node.retainPatternsForever as boolean,
      createdAt: parseNeo4jTimestamp(node.createdAt),
      updatedAt: parseNeo4jTimestamp(node.updatedAt),
    };
  }

  // ─── Pruning ────────────────────────────────────────────────────────────────

  /**
   * Prune stale, low-confidence memories from the workspace.
   * Removes episodes with confidence < 0.3 and age > pruneAfterDays.
   * Skips pinned, decision (when retained), and pattern (when retained) episodes.
   */
  async pruneStaleMemories(workspaceId: string): Promise<PruneResult> {
    const startTime = Date.now();
    const policy = await this.getLifecyclePolicy(workspaceId);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.pruneAfterDays);

    try {
      // Query stale memories (limit to 1000 per run to avoid unbounded memory usage)
      const cypher = `
        MATCH (e:Episode {workspaceId: $workspaceId})
        WHERE NOT coalesce(e.archived, false)
          AND e.confidence < 0.3
          AND e.timestamp < datetime($cutoffDate)
        RETURN e
        ORDER BY e.confidence ASC, e.timestamp ASC
        LIMIT 1000
      `;

      const result = await this.neo4jService.runQuery(cypher, {
        workspaceId,
        cutoffDate: cutoffDate.toISOString(),
      });

      let skippedPinned = 0;
      let skippedDecisions = 0;
      let skippedPatterns = 0;
      const prunedEpisodeIds: string[] = [];

      for (const record of result.records) {
        const node = record.get('e').properties;
        const metadata = safeJsonParse(node.metadata as string);
        const pinned = node.pinned === true || metadata.pinned === true;
        const episodeType = node.episodeType as string;

        if (pinned) {
          skippedPinned++;
          continue;
        }

        if (episodeType === 'decision' && policy.retainDecisionsForever) {
          skippedDecisions++;
          continue;
        }

        if (episodeType === 'pattern' && policy.retainPatternsForever) {
          skippedPatterns++;
          continue;
        }

        const episodeId = node.id as string;
        const deleted = await this.graphitiService.deleteEpisode(episodeId);
        if (deleted) {
          prunedEpisodeIds.push(episodeId);
        }
      }

      const pruneResult: PruneResult = {
        prunedCount: prunedEpisodeIds.length,
        prunedEpisodeIds,
        skippedPinned,
        skippedDecisions,
        skippedPatterns,
        durationMs: Date.now() - startTime,
      };

      this.eventEmitter.emit('memory:memories_pruned', pruneResult);
      return pruneResult;
    } catch (error) {
      this.logger.warn(
        `Error during pruning for workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        prunedCount: 0,
        prunedEpisodeIds: [],
        skippedPinned: 0,
        skippedDecisions: 0,
        skippedPatterns: 0,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ─── Consolidation ──────────────────────────────────────────────────────────

  /**
   * Consolidate redundant memories for a project.
   * Finds episodes referencing the same entities and merges those
   * with keyword similarity above the consolidation threshold.
   */
  async consolidateMemories(
    projectId: string,
    workspaceId: string,
  ): Promise<ConsolidationResult> {
    const startTime = Date.now();
    const policy = await this.getLifecyclePolicy(workspaceId);

    try {
      // Find episode pairs with shared entity references
      const cypher = `
        MATCH (e1:Episode {projectId: $projectId, workspaceId: $workspaceId})-[:REFERENCES]->(er:EntityRef)<-[:REFERENCES]-(e2:Episode {projectId: $projectId, workspaceId: $workspaceId})
        WHERE e1.id < e2.id
          AND NOT coalesce(e1.archived, false)
          AND NOT coalesce(e2.archived, false)
          AND e1.episodeType <> 'decision'
          AND e2.episodeType <> 'decision'
          AND NOT coalesce(e1.pinned, false)
          AND NOT coalesce(e2.pinned, false)
        RETURN e1, e2, collect(DISTINCT er.name) as sharedEntities
      `;

      const result = await this.neo4jService.runQuery(cypher, {
        projectId,
        workspaceId,
      });

      const newEpisodeIds: string[] = [];
      const archivedOriginalIds: string[] = [];
      const archivedOriginalSet = new Set<string>();
      const processedPairs = new Set<string>();

      for (const record of result.records) {
        const e1Props = record.get('e1').properties;
        const e2Props = record.get('e2').properties;
        const e1Id = e1Props.id as string;
        const e2Id = e2Props.id as string;

        // Skip if either episode was already consolidated in this run
        if (archivedOriginalSet.has(e1Id) || archivedOriginalSet.has(e2Id)) {
          continue;
        }

        const pairKey = `${e1Id}:${e2Id}`;
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        const content1 = e1Props.content as string;
        const content2 = e2Props.content as string;

        // Check metadata for pinned (double-check)
        const meta1 = safeJsonParse(e1Props.metadata as string);
        const meta2 = safeJsonParse(e2Props.metadata as string);
        if (meta1.pinned === true || meta2.pinned === true) continue;

        const similarity = this.calculateKeywordSimilarity(content1, content2);

        if (similarity >= policy.consolidateThreshold) {
          // Create consolidated episode
          const conf1 = toNumber(e1Props.confidence);
          const conf2 = toNumber(e2Props.confidence);
          const newConfidence = Math.min(1.0, Math.max(conf1, conf2) + 0.05);
          const mergedContent = this.mergeContent(content1, content2);
          const sharedEntities: string[] = record.get('sharedEntities');

          // Determine most common episode type
          const episodeType = e1Props.episodeType as string;
          const newId = uuidv4();

          const createCypher = `
            CREATE (e:Episode {
              id: $id,
              projectId: $projectId,
              workspaceId: $workspaceId,
              storyId: $storyId,
              agentType: $agentType,
              timestamp: datetime($timestamp),
              episodeType: $episodeType,
              content: $content,
              confidence: $confidence,
              metadata: $metadata
            })
            MERGE (p:ProjectNode {projectId: $projectId})
            MERGE (w:WorkspaceNode {workspaceId: $workspaceId})
            CREATE (e)-[:BELONGS_TO]->(p)
            CREATE (e)-[:IN_WORKSPACE]->(w)
            WITH e
            UNWIND $originalIds AS origId
            MATCH (orig:Episode {id: origId})
            CREATE (e)-[:CONSOLIDATED_FROM]->(orig)
            RETURN e.id as id
          `;

          const metadata = JSON.stringify({
            consolidatedFrom: [e1Id, e2Id],
            consolidatedAt: new Date().toISOString(),
          });

          await this.neo4jService.runQuery(createCypher, {
            id: newId,
            projectId,
            workspaceId,
            storyId: (e1Props.storyId as string) ?? null,
            agentType: (e1Props.agentType as string) ?? 'system',
            timestamp: new Date().toISOString(),
            episodeType,
            content: mergedContent,
            confidence: newConfidence,
            metadata,
            originalIds: [e1Id, e2Id],
          });

          // Link consolidated episode to shared entities
          if (sharedEntities.length > 0) {
            const linkCypher = `
              MATCH (e:Episode {id: $episodeId})
              UNWIND $entityNames AS entityName
              MATCH (er:EntityRef {name: entityName, projectId: $projectId, workspaceId: $workspaceId})
              MERGE (e)-[:REFERENCES]->(er)
            `;
            await this.neo4jService.runQuery(linkCypher, {
              episodeId: newId,
              entityNames: sharedEntities,
              projectId,
              workspaceId,
            });
          }

          // Archive originals
          await this.graphitiService.archiveEpisode(e1Id, `consolidated-${newId}`);
          await this.graphitiService.archiveEpisode(e2Id, `consolidated-${newId}`);

          newEpisodeIds.push(newId);
          archivedOriginalIds.push(e1Id, e2Id);
          archivedOriginalSet.add(e1Id);
          archivedOriginalSet.add(e2Id);
        }
      }

      const consolidationResult: ConsolidationResult = {
        projectId,
        consolidatedCount: newEpisodeIds.length,
        newEpisodeIds,
        archivedOriginalIds,
        durationMs: Date.now() - startTime,
      };

      if (newEpisodeIds.length > 0) {
        this.eventEmitter.emit('memory:memories_consolidated', consolidationResult);
      }

      return consolidationResult;
    } catch (error) {
      this.logger.warn(
        `Error during consolidation for project ${projectId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        projectId,
        consolidatedCount: 0,
        newEpisodeIds: [],
        archivedOriginalIds: [],
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Calculate Jaccard similarity between two strings based on keyword overlap.
   * Tokenizes, lowercases, removes stopwords, then computes |intersection| / |union|.
   */
  calculateKeywordSimilarity(content1: string, content2: string): number {
    const tokenize = (text: string): Set<string> => {
      const tokens = text
        .toLowerCase()
        .split(/[\s\W]+/)
        .filter((t) => t.length > 1 && !STOPWORDS.has(t));
      return new Set(tokens);
    };

    const set1 = tokenize(content1);
    const set2 = tokenize(content2);

    if (set1.size === 0 && set2.size === 0) return 1.0;
    if (set1.size === 0 || set2.size === 0) return 0.0;

    let intersection = 0;
    for (const token of set1) {
      if (set2.has(token)) intersection++;
    }

    const union = set1.size + set2.size - intersection;
    return union === 0 ? 0.0 : intersection / union;
  }

  // ─── Archival ───────────────────────────────────────────────────────────────

  /**
   * Archive memories older than the configured threshold.
   * Skips pinned, decision (when retained), pattern (when retained), and already-archived episodes.
   */
  async archiveOldMemories(workspaceId: string): Promise<ArchiveResult> {
    const startTime = Date.now();
    const policy = await this.getLifecyclePolicy(workspaceId);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.archiveAfterDays);

    try {
      const cypher = `
        MATCH (e:Episode {workspaceId: $workspaceId})
        WHERE NOT coalesce(e.archived, false)
          AND e.timestamp < datetime($cutoffDate)
        RETURN e
        ORDER BY e.timestamp ASC
        LIMIT 1000
      `;

      const result = await this.neo4jService.runQuery(cypher, {
        workspaceId,
        cutoffDate: cutoffDate.toISOString(),
      });

      let skippedPinned = 0;
      let skippedDecisions = 0;
      let skippedPatterns = 0;
      const archivedEpisodeIds: string[] = [];

      for (const record of result.records) {
        const node = record.get('e').properties;
        const metadata = safeJsonParse(node.metadata as string);
        const pinned = node.pinned === true || metadata.pinned === true;
        const episodeType = node.episodeType as string;

        if (pinned) {
          skippedPinned++;
          continue;
        }

        if (episodeType === 'decision' && policy.retainDecisionsForever) {
          skippedDecisions++;
          continue;
        }

        if (episodeType === 'pattern' && policy.retainPatternsForever) {
          skippedPatterns++;
          continue;
        }

        const episodeId = node.id as string;
        const archived = await this.graphitiService.archiveEpisode(
          episodeId,
          'lifecycle-archive',
        );
        if (archived) {
          archivedEpisodeIds.push(episodeId);
        }
      }

      const archiveResult: ArchiveResult = {
        archivedCount: archivedEpisodeIds.length,
        archivedEpisodeIds,
        skippedDecisions,
        skippedPatterns,
        skippedPinned,
        durationMs: Date.now() - startTime,
      };

      this.eventEmitter.emit('memory:memories_archived', archiveResult);
      return archiveResult;
    } catch (error) {
      this.logger.warn(
        `Error during archival for workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        archivedCount: 0,
        archivedEpisodeIds: [],
        skippedDecisions: 0,
        skippedPatterns: 0,
        skippedPinned: 0,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ─── Cap Enforcement ────────────────────────────────────────────────────────

  /**
   * Enforce maximum memories per project by archiving lowest-scoring episodes.
   * Score = (confidence * 0.4) + (recencyScore * 0.3) + (usageScore * 0.3)
   */
  async enforceProjectCap(
    projectId: string,
    workspaceId: string,
  ): Promise<CapEnforcementResult> {
    const startTime = Date.now();
    const policy = await this.getLifecyclePolicy(workspaceId);

    try {
      // Count active episodes
      const countCypher = `
        MATCH (e:Episode {projectId: $projectId, workspaceId: $workspaceId})
        WHERE NOT coalesce(e.archived, false)
        RETURN count(e) as activeCount
      `;

      const countResult = await this.neo4jService.runQuery(countCypher, {
        projectId,
        workspaceId,
      });

      const activeCountBefore = toNumber(countResult.records[0]?.get('activeCount') ?? 0);

      if (activeCountBefore <= policy.maxMemoriesPerProject) {
        return {
          projectId,
          activeCountBefore,
          activeCountAfter: activeCountBefore,
          archivedCount: 0,
          durationMs: Date.now() - startTime,
        };
      }

      // Query all active episodes
      const episodesCypher = `
        MATCH (e:Episode {projectId: $projectId, workspaceId: $workspaceId})
        WHERE NOT coalesce(e.archived, false)
        RETURN e
      `;

      const episodesResult = await this.neo4jService.runQuery(episodesCypher, {
        projectId,
        workspaceId,
      });

      const now = new Date();
      const scoredEpisodes: Array<{
        id: string;
        score: number;
        isProtected: boolean;
      }> = [];

      for (const record of episodesResult.records) {
        const node = record.get('e').properties;
        const metadata = safeJsonParse(node.metadata as string);
        const pinned = node.pinned === true || metadata.pinned === true;
        const episodeType = node.episodeType as string;
        const confidence = toNumber(node.confidence ?? 0.5);
        const timestamp = parseNeo4jTimestamp(node.timestamp);
        const usageCount = toNumber(metadata.usageCount ?? 0);

        const isProtected =
          pinned ||
          (episodeType === 'decision' && policy.retainDecisionsForever) ||
          (episodeType === 'pattern' && policy.retainPatternsForever);

        // Calculate composite score
        const ageInDays = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60 * 24);
        const recencyScore = Math.max(0, Math.min(1, 1.0 - ageInDays / 365));
        const usageScore = Math.min(1.0, usageCount / 10);
        const compositeScore =
          confidence * 0.4 + recencyScore * 0.3 + usageScore * 0.3;

        scoredEpisodes.push({
          id: node.id as string,
          score: compositeScore,
          isProtected,
        });
      }

      // Sort by score ascending (lowest first)
      scoredEpisodes.sort((a, b) => a.score - b.score);

      const excess = activeCountBefore - policy.maxMemoriesPerProject;
      let archivedCount = 0;

      for (const ep of scoredEpisodes) {
        if (archivedCount >= excess) break;
        if (ep.isProtected) continue;

        const archived = await this.graphitiService.archiveEpisode(
          ep.id,
          'cap-enforcement',
        );
        if (archived) archivedCount++;
      }

      const capResult: CapEnforcementResult = {
        projectId,
        activeCountBefore,
        activeCountAfter: activeCountBefore - archivedCount,
        archivedCount,
        durationMs: Date.now() - startTime,
      };

      this.eventEmitter.emit('memory:cap_enforced', capResult);
      return capResult;
    } catch (error) {
      this.logger.warn(
        `Error during cap enforcement for project ${projectId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        projectId,
        activeCountBefore: 0,
        activeCountAfter: 0,
        archivedCount: 0,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ─── Full Lifecycle ─────────────────────────────────────────────────────────

  /**
   * Run the full lifecycle for a workspace: prune, consolidate, archive, cap enforce.
   */
  async runLifecycle(workspaceId: string): Promise<LifecycleResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    // Step 1: Prune
    let pruneResult: PruneResult;
    try {
      pruneResult = await this.pruneStaleMemories(workspaceId);
    } catch (error) {
      const msg = `Pruning failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(msg);
      this.logger.warn(msg);
      pruneResult = {
        prunedCount: 0,
        prunedEpisodeIds: [],
        skippedPinned: 0,
        skippedDecisions: 0,
        skippedPatterns: 0,
        durationMs: 0,
      };
    }

    // Get all projects in workspace
    const projectIds = await this.getWorkspaceProjectIds(workspaceId);

    // Step 2: Consolidate per project
    const consolidationResults: ConsolidationResult[] = [];
    for (const projectId of projectIds) {
      try {
        const result = await this.consolidateMemories(projectId, workspaceId);
        consolidationResults.push(result);
      } catch (error) {
        const msg = `Consolidation failed for project ${projectId}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(msg);
        this.logger.warn(msg);
        consolidationResults.push({
          projectId,
          consolidatedCount: 0,
          newEpisodeIds: [],
          archivedOriginalIds: [],
          durationMs: 0,
        });
      }
    }

    // Step 3: Archive
    let archiveResult: ArchiveResult;
    try {
      archiveResult = await this.archiveOldMemories(workspaceId);
    } catch (error) {
      const msg = `Archival failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(msg);
      this.logger.warn(msg);
      archiveResult = {
        archivedCount: 0,
        archivedEpisodeIds: [],
        skippedDecisions: 0,
        skippedPatterns: 0,
        skippedPinned: 0,
        durationMs: 0,
      };
    }

    // Step 4: Cap enforcement per project
    const capResults: CapEnforcementResult[] = [];
    for (const projectId of projectIds) {
      try {
        const result = await this.enforceProjectCap(projectId, workspaceId);
        capResults.push(result);
      } catch (error) {
        const msg = `Cap enforcement failed for project ${projectId}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(msg);
        this.logger.warn(msg);
        capResults.push({
          projectId,
          activeCountBefore: 0,
          activeCountAfter: 0,
          archivedCount: 0,
          durationMs: 0,
        });
      }
    }

    const lifecycleResult: LifecycleResult = {
      workspaceId,
      pruneResult,
      consolidationResults,
      archiveResult,
      capResults,
      totalDurationMs: Date.now() - startTime,
      errors,
    };

    this.eventEmitter.emit('memory:lifecycle_completed', lifecycleResult);
    return lifecycleResult;
  }

  // ─── Lifecycle Report ───────────────────────────────────────────────────────

  /**
   * Generate a lifecycle metrics report for a workspace.
   */
  async getLifecycleReport(workspaceId: string): Promise<LifecycleReport> {
    const policy = await this.getLifecyclePolicy(workspaceId);

    // Get per-project active/archived counts
    const projectCypher = `
      MATCH (e:Episode {workspaceId: $workspaceId})
      WHERE e.projectId IS NOT NULL
      WITH e.projectId AS projectId, e
      RETURN projectId,
             sum(CASE WHEN NOT coalesce(e.archived, false) THEN 1 ELSE 0 END) as activeCount,
             sum(CASE WHEN coalesce(e.archived, false) THEN 1 ELSE 0 END) as archivedCount
      ORDER BY projectId
    `;

    const projectResult = await this.neo4jService.runQuery(projectCypher, {
      workspaceId,
    });

    let totalActiveEpisodes = 0;
    let totalArchivedEpisodes = 0;
    const projectBreakdown: LifecycleReport['projectBreakdown'] = [];

    for (const record of projectResult.records) {
      const projectId = record.get('projectId') as string;
      const activeEpisodes = toNumber(record.get('activeCount'));
      const archivedEpisodes = toNumber(record.get('archivedCount'));

      totalActiveEpisodes += activeEpisodes;
      totalArchivedEpisodes += archivedEpisodes;

      let recommendation: 'healthy' | 'needs-pruning' | 'too-few' | 'over-cap' = 'healthy';
      if (activeEpisodes > policy.maxMemoriesPerProject) {
        recommendation = 'over-cap';
      } else if (activeEpisodes > policy.maxMemoriesPerProject * 0.8) {
        recommendation = 'needs-pruning';
      } else if (activeEpisodes < 10) {
        recommendation = 'too-few';
      }

      projectBreakdown.push({
        projectId,
        activeEpisodes,
        archivedEpisodes,
        recommendation,
      });
    }

    // Get graph size metrics (fallback without APOC)
    let totalNodes = 0;
    let totalEdges = 0;
    try {
      const nodeCypher = `MATCH (n) RETURN count(n) as nodeCount`;
      const nodeResult = await this.neo4jService.runQuery(nodeCypher);
      totalNodes = toNumber(nodeResult.records[0]?.get('nodeCount') ?? 0);

      const edgeCypher = `MATCH ()-[r]->() RETURN count(r) as relCount`;
      const edgeResult = await this.neo4jService.runQuery(edgeCypher);
      totalEdges = toNumber(edgeResult.records[0]?.get('relCount') ?? 0);
    } catch (error) {
      this.logger.warn(
        `Failed to get graph metrics: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Estimated storage: ~1KB per node, ~0.5KB per edge
    const estimatedStorageMB = (totalNodes * 1024 + totalEdges * 512) / (1024 * 1024);

    return {
      workspaceId,
      generatedAt: new Date(),
      totalProjects: projectBreakdown.length,
      totalActiveEpisodes,
      totalArchivedEpisodes,
      totalPrunedAllTime: 0, // Would need a counter node to track this
      totalConsolidatedAllTime: 0,
      graphSizeMetrics: {
        totalNodes,
        totalEdges,
        estimatedStorageMB: Math.round(estimatedStorageMB * 100) / 100,
      },
      queryPerformanceMetrics: {
        averageQueryTimeMs: 0, // Would need instrumentation to track this
        cacheHitRate: 0,
      },
      projectBreakdown,
      lastLifecycleRun: null, // Would need a tracking node
    };
  }

  // ─── Pin / Unpin / Delete ───────────────────────────────────────────────────
  //
  // NOTE: Pinning is tracked via the `e.pinned` node property (primary source of truth).
  // Lifecycle methods also check `metadata.pinned` for backward compatibility with
  // episodes that may have been pinned before the dedicated property was introduced.
  // The pin/unpin API only sets the node property; legacy metadata.pinned values
  // are honored but not mutated by these endpoints.

  /**
   * Pin a memory to protect it from all lifecycle operations.
   */
  async pinMemory(episodeId: string): Promise<boolean> {
    try {
      const cypher = `
        MATCH (e:Episode {id: $episodeId})
        SET e.pinned = true
        RETURN e.id as id
      `;
      const result = await this.neo4jService.runQuery(cypher, { episodeId });
      const found = result.records.length > 0;
      if (found) {
        this.eventEmitter.emit('memory:memory_pinned', { episodeId });
      }
      return found;
    } catch (error) {
      this.logger.warn(
        `Failed to pin episode ${episodeId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Unpin a memory, allowing lifecycle operations to process it.
   */
  async unpinMemory(episodeId: string): Promise<boolean> {
    try {
      const cypher = `
        MATCH (e:Episode {id: $episodeId})
        SET e.pinned = false
        RETURN e.id as id
      `;
      const result = await this.neo4jService.runQuery(cypher, { episodeId });
      const found = result.records.length > 0;
      if (found) {
        this.eventEmitter.emit('memory:memory_unpinned', { episodeId });
      }
      return found;
    } catch (error) {
      this.logger.warn(
        `Failed to unpin episode ${episodeId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Permanently delete a specific memory.
   */
  async deleteMemory(episodeId: string): Promise<boolean> {
    try {
      const deleted = await this.graphitiService.deleteEpisode(episodeId);
      if (deleted) {
        this.eventEmitter.emit('memory:memory_deleted', { episodeId });
      }
      return deleted;
    } catch (error) {
      this.logger.warn(
        `Failed to delete episode ${episodeId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Get all project IDs in a workspace.
   */
  private async getWorkspaceProjectIds(workspaceId: string): Promise<string[]> {
    try {
      const cypher = `
        MATCH (p:ProjectNode)<-[:BELONGS_TO]-(e:Episode {workspaceId: $workspaceId})
        RETURN DISTINCT p.projectId as projectId
      `;
      const result = await this.neo4jService.runQuery(cypher, { workspaceId });
      return result.records.map((r) => r.get('projectId') as string);
    } catch (error) {
      this.logger.warn(
        `Failed to get project IDs for workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Get default lifecycle policy values from environment or hardcoded defaults.
   */
  private getDefaultPolicy(workspaceId: string): MemoryLifecyclePolicy {
    const now = new Date();
    return {
      workspaceId,
      pruneAfterDays: parseInt(
        this.configService.get<string>('MEMORY_LIFECYCLE_PRUNE_AFTER_DAYS', '180'),
        10,
      ),
      consolidateThreshold: parseFloat(
        this.configService.get<string>('MEMORY_LIFECYCLE_CONSOLIDATE_THRESHOLD', '0.85'),
      ),
      archiveAfterDays: parseInt(
        this.configService.get<string>('MEMORY_LIFECYCLE_ARCHIVE_AFTER_DAYS', '365'),
        10,
      ),
      maxMemoriesPerProject: parseInt(
        this.configService.get<string>('MEMORY_LIFECYCLE_MAX_MEMORIES_PER_PROJECT', '5000'),
        10,
      ),
      retainDecisionsForever:
        this.configService.get<string>('MEMORY_LIFECYCLE_RETAIN_DECISIONS_FOREVER', 'true') === 'true',
      retainPatternsForever:
        this.configService.get<string>('MEMORY_LIFECYCLE_RETAIN_PATTERNS_FOREVER', 'true') === 'true',
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Merge content from two episodes, avoiding exact duplication of sentences.
   * Preserves original punctuation where possible.
   */
  private mergeContent(content1: string, content2: string): string {
    // Match sentences by splitting on sentence-ending punctuation while keeping the delimiter
    const splitSentences = (text: string): string[] => {
      const parts = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
      // If no sentence-ending punctuation found, treat entire text as one sentence
      return parts.length === 0 ? [text.trim()].filter(Boolean) : parts;
    };

    const sentences1 = splitSentences(content1);
    const sentences2 = splitSentences(content2);

    // Deduplicate by lowercase comparison while preserving original casing
    const seen = new Map<string, string>();
    for (const s of [...sentences1, ...sentences2]) {
      const key = s.toLowerCase().replace(/[.!?]+$/, '').trim();
      if (key && !seen.has(key)) {
        seen.set(key, s);
      }
    }

    const merged = Array.from(seen.values()).join(' ');
    // Ensure the merged content ends with punctuation
    return /[.!?]$/.test(merged) ? merged : merged + '.';
  }
}
