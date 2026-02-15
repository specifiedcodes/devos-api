/**
 * Memory Interfaces
 * Story 12.1: Graphiti/Neo4j Setup
 *
 * TypeScript interfaces for the temporal knowledge graph memory system.
 * All memory operations are scoped by workspaceId for multi-tenant isolation.
 */

export type MemoryEpisodeType =
  | 'decision'
  | 'fact'
  | 'problem'
  | 'preference'
  | 'pattern';

export interface MemoryEpisode {
  id: string;
  projectId: string;
  workspaceId: string;
  storyId: string | null;
  agentType: string;
  timestamp: Date;
  episodeType: MemoryEpisodeType;
  content: string;
  entities: string[];
  confidence: number;
  metadata: Record<string, unknown>;
}

export interface CreateEpisodeInput {
  projectId: string;
  workspaceId: string;
  storyId?: string;
  agentType: string;
  episodeType: MemoryEpisodeType;
  content: string;
  entities?: string[];
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface EpisodeSearchQuery {
  projectId: string;
  workspaceId: string;
  types?: MemoryEpisodeType[];
  entityNames?: string[];
  since?: Date;
  maxResults?: number;
  includeArchived?: boolean;
}

export type EntityRefType =
  | 'file'
  | 'api'
  | 'library'
  | 'service'
  | 'config'
  | 'other';

export interface EntityRef {
  id: string;
  name: string;
  entityType: EntityRefType;
  projectId: string;
  workspaceId: string;
  metadata?: Record<string, unknown>;
}

export interface CreateEntityRefInput {
  name: string;
  entityType: EntityRefType;
  projectId: string;
  workspaceId: string;
  metadata?: Record<string, unknown>;
}

export interface GraphitiConfig {
  storageBackend: 'neo4j' | 'pgvector';
  connectionUri: string;
  embeddingModel: string;
  embeddingProvider: string;
  maxEpisodes: number;
}

export interface MemoryHealth {
  neo4jConnected: boolean;
  neo4jVersion: string | null;
  totalEpisodes: number;
  totalEntities: number;
  lastEpisodeTimestamp: Date | null;
  overallStatus: 'healthy' | 'degraded' | 'unavailable';
}

export interface GraphStats {
  episodeCount: number;
  entityCount: number;
  relationshipCount: number;
  storageEstimateMB: number;
}

// ─── Ingestion Pipeline Interfaces (Story 12.2) ─────────────────────────────

/**
 * A single extracted memory ready for storage.
 * Produced by MemoryExtractionService from pipeline task output data.
 */
export interface ExtractedMemory {
  episodeType: MemoryEpisodeType;
  content: string;
  entities: string[];
  confidence: number;
  metadata: Record<string, unknown>;
}

/**
 * Input data for the memory ingestion pipeline.
 * Built from PipelineStateEvent metadata after an agent task completes.
 */
export interface IngestionInput {
  projectId: string;
  workspaceId: string;
  storyId: string | null;
  agentType: string;
  sessionId: string;
  branch: string | null;
  commitHash: string | null;
  exitCode: number | null;
  durationMs: number;
  outputSummary: string | null;
  filesChanged: string[];
  commitMessages: string[];
  testResults: { passed: number; failed: number; total: number } | null;
  prUrl: string | null;
  deploymentUrl: string | null;
  errorMessage: string | null;
  pipelineMetadata: Record<string, any>;
}

/**
 * Result of a memory ingestion run.
 */
export interface IngestionResult {
  episodesCreated: number;
  episodeIds: string[];
  extractionDurationMs: number;
  errors: string[];
}

/**
 * Aggregated ingestion statistics for a project.
 */
export interface IngestionStats {
  totalIngestions: number;
  totalEpisodes: number;
  deduplicationsSkipped: number;
  errors: number;
}

/**
 * Result of a deduplication check for a single episode.
 */
export interface DeduplicationResult {
  isDuplicate: boolean;
  isFlagged: boolean;
  existingEpisodeId?: string;
  similarity: number;
}

/**
 * Batch deduplication result.
 */
export interface DeduplicationBatchResult {
  accepted: ExtractedMemory[];
  skipped: number;
  flagged: number;
}

// ─── Memory Query Interfaces (Story 12.3) ────────────────────────────────────

/**
 * Input for the main memory query method.
 */
export interface MemoryQueryInput {
  projectId: string;
  workspaceId: string;
  query: string;
  filters?: {
    types?: MemoryEpisodeType[];
    entityIds?: string[];
    since?: Date;
    maxResults?: number;
  };
}

/**
 * Result returned by the memory query method.
 */
export interface MemoryQueryResult {
  memories: MemoryEpisode[];
  totalCount: number;
  relevanceScores: number[];
  queryDurationMs: number;
}

/**
 * Formatted memory context ready for agent consumption.
 */
export interface FormattedMemoryContext {
  contextString: string;
  memoryCount: number;
}

/**
 * Input for recording relevance feedback on a memory episode.
 */
export interface MemoryFeedbackInput {
  episodeId: string;
  wasUseful: boolean;
}

/**
 * A scored memory episode with relevance score attached.
 */
export interface ScoredMemory extends MemoryEpisode {
  relevanceScore: number;
}

// ─── Cross-Project Learning Interfaces (Story 12.6) ──────────────────────────

/**
 * Pattern type categories for workspace-level patterns.
 */
export type PatternType = 'architecture' | 'error' | 'testing' | 'deployment' | 'security';

/**
 * Confidence level determined by cross-project adoption.
 */
export type PatternConfidence = 'low' | 'medium' | 'high';

/**
 * Pattern lifecycle status.
 */
export type PatternStatus = 'active' | 'overridden' | 'archived';

/**
 * Workspace-level pattern recognized across multiple projects.
 */
export interface WorkspacePattern {
  id: string;
  workspaceId: string;
  patternType: PatternType;
  content: string;
  sourceProjectIds: string[];
  sourceEpisodeIds: string[];
  occurrenceCount: number;
  confidence: PatternConfidence;
  status: PatternStatus;
  overriddenBy: string | null;
  overrideReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

/**
 * Filters for querying workspace patterns.
 */
export interface PatternFilters {
  patternType?: PatternType;
  confidence?: PatternConfidence;
  status?: PatternStatus;
  limit?: number;
}

/**
 * Result from running pattern detection on a workspace.
 */
export interface PatternDetectionResult {
  newPatterns: number;
  updatedPatterns: number;
  totalPatterns: number;
  detectionDurationMs: number;
}

/**
 * A pattern recommendation for a specific task, with relevance scoring.
 */
export interface PatternRecommendation {
  pattern: WorkspacePattern;
  relevanceScore: number;
  confidenceLabel: string;
}

/**
 * Adoption statistics for workspace patterns.
 */
export interface PatternAdoptionStats {
  totalPatterns: number;
  byConfidence: { low: number; medium: number; high: number };
  byType: Record<PatternType, number>;
  overrideRate: number;
  averageOccurrenceCount: number;
  topPatterns: WorkspacePattern[];
}

// ─── Memory Summarization Interfaces (Story 12.7) ────────────────────────────

/**
 * A consolidated memory summary stored in Neo4j.
 * Groups archived episodes by month for efficient retrieval.
 */
export interface MemorySummary {
  id: string;
  projectId: string;
  workspaceId: string;
  periodStart: Date;
  periodEnd: Date;
  originalEpisodeCount: number;
  summary: string;
  keyDecisions: string[];
  keyPatterns: string[];
  archivedEpisodeIds: string[];
  summarizationModel: string;
  createdAt: Date;
  metadata: Record<string, unknown>;
}

/**
 * Result of a summarization run.
 */
export interface SummarizationResult {
  summariesCreated: number;
  episodesArchived: number;
  totalProcessed: number;
  durationMs: number;
  skipped: boolean;
  errors: string[];
}

/**
 * Summarization statistics for a project.
 */
export interface SummarizationStats {
  totalSummaries: number;
  totalArchivedEpisodes: number;
  activeEpisodes: number;
  oldestSummary: Date | null;
  newestSummary: Date | null;
}
