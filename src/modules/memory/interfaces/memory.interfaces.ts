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
