/**
 * GraphitiService
 * Story 12.1: Graphiti/Neo4j Setup
 *
 * Wraps Neo4j operations with a Graphiti-compatible interface for temporal
 * knowledge graph operations. Manages episodes (memories) and entity references.
 * All queries enforce workspace isolation via workspaceId filtering.
 */
import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import neo4j from 'neo4j-driver';
import { Neo4jService } from './neo4j.service';
import {
  MemoryEpisode,
  CreateEpisodeInput,
  EpisodeSearchQuery,
  EntityRef,
  CreateEntityRefInput,
} from '../interfaces/memory.interfaces';
import {
  toNumber,
  safeJsonParse,
  parseNeo4jTimestamp,
} from '../utils/neo4j.utils';

@Injectable()
export class GraphitiService {
  private readonly logger = new Logger(GraphitiService.name);

  constructor(private readonly neo4jService: Neo4jService) {}

  /**
   * Store a new memory episode in the knowledge graph.
   * Creates Episode node, ProjectNode/WorkspaceNode relationships,
   * and optional EntityRef nodes with REFERENCES relationships.
   */
  async addEpisode(input: CreateEpisodeInput): Promise<MemoryEpisode> {
    const id = uuidv4();
    const timestamp = new Date();
    const confidence = input.confidence ?? 0.5;
    const entities = input.entities ?? [];
    const metadata = input.metadata ?? {};
    const storyId = input.storyId ?? null;

    const cypher = `
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
      RETURN e
    `;

    await this.neo4jService.runQuery(cypher, {
      id,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      storyId,
      agentType: input.agentType,
      timestamp: timestamp.toISOString(),
      episodeType: input.episodeType,
      content: input.content,
      confidence,
      metadata: JSON.stringify(metadata),
    });

    // Create entity references and link them in batch
    if (entities.length > 0) {
      const batchCypher = `
        MATCH (e:Episode {id: $episodeId})
        UNWIND $entityNames AS entityName
        MERGE (er:EntityRef {name: entityName, projectId: $projectId, workspaceId: $workspaceId})
        ON CREATE SET er.id = randomUUID(), er.entityType = 'other', er.metadata = '{}'
        MERGE (e)-[:REFERENCES]->(er)
      `;
      await this.neo4jService.runQuery(batchCypher, {
        episodeId: id,
        entityNames: entities,
        projectId: input.projectId,
        workspaceId: input.workspaceId,
      });
    }

    return {
      id,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      storyId,
      agentType: input.agentType,
      timestamp,
      episodeType: input.episodeType,
      content: input.content,
      entities,
      confidence,
      metadata,
    };
  }

  /**
   * Retrieve an episode by ID.
   */
  async getEpisode(episodeId: string): Promise<MemoryEpisode | null> {
    const cypher = `
      MATCH (e:Episode {id: $episodeId})
      OPTIONAL MATCH (e)-[:REFERENCES]->(er:EntityRef)
      RETURN e, collect(er.name) as entityNames
    `;

    const result = await this.neo4jService.runQuery(cypher, { episodeId });

    if (result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    const node = record.get('e').properties;
    const entityNames: string[] = record.get('entityNames').filter(Boolean);

    return this.mapNodeToEpisode(node, entityNames);
  }

  /**
   * Search episodes with filters. Always scoped by projectId and workspaceId.
   * Story 12.7: Excludes archived episodes by default unless includeArchived is true.
   */
  async searchEpisodes(query: EpisodeSearchQuery): Promise<MemoryEpisode[]> {
    const conditions: string[] = [
      'e.projectId = $projectId',
      'e.workspaceId = $workspaceId',
    ];
    const params: Record<string, unknown> = {
      projectId: query.projectId,
      workspaceId: query.workspaceId,
    };

    // Story 12.7: Filter out archived episodes by default
    if (!query.includeArchived) {
      conditions.push('(NOT coalesce(e.archived, false))');
    }

    if (query.types && query.types.length > 0) {
      conditions.push('e.episodeType IN $types');
      params.types = query.types;
    }

    if (query.since) {
      conditions.push('e.timestamp >= datetime($since)');
      params.since = query.since.toISOString();
    }

    const maxResults = query.maxResults ?? 10;
    params.maxResults = neo4jInt(maxResults);

    let cypher: string;

    if (query.entityNames && query.entityNames.length > 0) {
      params.entityNames = query.entityNames;
      cypher = `
        MATCH (e:Episode)-[:REFERENCES]->(er:EntityRef)
        WHERE ${conditions.join(' AND ')}
        AND er.name IN $entityNames
        OPTIONAL MATCH (e)-[:REFERENCES]->(allEr:EntityRef)
        RETURN DISTINCT e, collect(DISTINCT allEr.name) as entityNames
        ORDER BY e.timestamp DESC
        LIMIT $maxResults
      `;
    } else {
      cypher = `
        MATCH (e:Episode)
        WHERE ${conditions.join(' AND ')}
        OPTIONAL MATCH (e)-[:REFERENCES]->(er:EntityRef)
        RETURN e, collect(er.name) as entityNames
        ORDER BY e.timestamp DESC
        LIMIT $maxResults
      `;
    }

    const result = await this.neo4jService.runQuery(cypher, params);

    return result.records.map((record) => {
      const node = record.get('e').properties;
      const entityNames: string[] = record.get('entityNames').filter(Boolean);
      return this.mapNodeToEpisode(node, entityNames);
    });
  }

  /**
   * Delete an episode and all its relationships.
   */
  async deleteEpisode(episodeId: string): Promise<boolean> {
    const cypher = `
      MATCH (e:Episode {id: $episodeId})
      WITH e, e.id as eid
      DETACH DELETE e
      RETURN count(eid) as deleted
    `;

    const result = await this.neo4jService.runQuery(cypher, { episodeId });
    const deleted = result.records[0]?.get('deleted');
    return deleted !== undefined && toNumber(deleted) > 0;
  }

  /**
   * Count episodes for a given project, scoped by workspaceId.
   */
  async getProjectEpisodeCount(
    projectId: string,
    workspaceId?: string,
  ): Promise<number> {
    let cypher: string;
    let params: Record<string, unknown>;

    if (workspaceId) {
      cypher = `
        MATCH (e:Episode {projectId: $projectId, workspaceId: $workspaceId})
        RETURN count(e) as count
      `;
      params = { projectId, workspaceId };
    } else {
      cypher = `
        MATCH (e:Episode {projectId: $projectId})
        RETURN count(e) as count
      `;
      params = { projectId };
    }

    const result = await this.neo4jService.runQuery(cypher, params);
    const count = result.records[0]?.get('count');
    return count !== undefined ? toNumber(count) : 0;
  }

  /**
   * Create or merge an entity reference node.
   */
  async addEntityRef(input: CreateEntityRefInput): Promise<EntityRef> {
    const id = uuidv4();

    const cypher = `
      MERGE (er:EntityRef {name: $name, projectId: $projectId, workspaceId: $workspaceId})
      ON CREATE SET er.id = $id, er.entityType = $entityType, er.metadata = $metadata
      RETURN er
    `;

    const result = await this.neo4jService.runQuery(cypher, {
      id,
      name: input.name,
      entityType: input.entityType,
      projectId: input.projectId,
      workspaceId: input.workspaceId,
      metadata: JSON.stringify(input.metadata ?? {}),
    });

    const node = result.records[0].get('er').properties;

    return {
      id: node.id,
      name: node.name,
      entityType: node.entityType,
      projectId: node.projectId,
      workspaceId: node.workspaceId,
      metadata: safeJsonParse(node.metadata),
    };
  }

  /**
   * Create a REFERENCES relationship between an episode and an entity reference.
   */
  async linkEpisodeToEntity(
    episodeId: string,
    entityId: string,
  ): Promise<void> {
    const cypher = `
      MATCH (e:Episode {id: $episodeId})
      MATCH (er:EntityRef {id: $entityId})
      MERGE (e)-[:REFERENCES]->(er)
    `;

    await this.neo4jService.runQuery(cypher, { episodeId, entityId });
  }

  /**
   * Get all episodes that reference a given entity.
   * Enforces workspace isolation by matching entity workspaceId to episode workspaceId.
   */
  async getEntityEpisodes(entityId: string): Promise<MemoryEpisode[]> {
    const cypher = `
      MATCH (e:Episode)-[:REFERENCES]->(er:EntityRef {id: $entityId})
      WHERE e.workspaceId = er.workspaceId
      OPTIONAL MATCH (e)-[:REFERENCES]->(allEr:EntityRef)
      RETURN e, collect(DISTINCT allEr.name) as entityNames
      ORDER BY e.timestamp DESC
    `;

    const result = await this.neo4jService.runQuery(cypher, { entityId });

    return result.records.map((record) => {
      const node = record.get('e').properties;
      const entityNames: string[] = record.get('entityNames').filter(Boolean);
      return this.mapNodeToEpisode(node, entityNames);
    });
  }

  /**
   * Archive an episode by marking it with archived metadata.
   * Story 12.7: Sets archived=true, archivedAt timestamp, and summaryId on the episode.
   * Does NOT delete the episode - archive-not-delete strategy.
   */
  async archiveEpisode(
    episodeId: string,
    summaryId: string,
  ): Promise<boolean> {
    const cypher = `
      MATCH (e:Episode {id: $episodeId})
      SET e.archived = true, e.archivedAt = datetime(), e.summaryId = $summaryId
      RETURN e.id as id
    `;

    try {
      const result = await this.neo4jService.runQuery(cypher, {
        episodeId,
        summaryId,
      });

      return result.records.length > 0;
    } catch (error) {
      this.logger.warn(
        `Failed to archive episode ${episodeId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Map a Neo4j node's properties to a MemoryEpisode interface.
   */
  private mapNodeToEpisode(
    node: Record<string, unknown>,
    entityNames: string[],
  ): MemoryEpisode {
    return {
      id: node.id as string,
      projectId: node.projectId as string,
      workspaceId: node.workspaceId as string,
      storyId: (node.storyId as string) ?? null,
      agentType: node.agentType as string,
      timestamp: parseNeo4jTimestamp(node.timestamp),
      episodeType: node.episodeType as MemoryEpisode['episodeType'],
      content: node.content as string,
      entities: entityNames,
      confidence: node.confidence != null ? toNumber(node.confidence) : 0.5,
      metadata: safeJsonParse(node.metadata as string),
    };
  }
}

/**
 * Convert a plain number to a Neo4j Integer for LIMIT/SKIP parameters.
 */
function neo4jInt(value: number): typeof neo4j.Integer.prototype {
  return neo4j.int(value);
}
