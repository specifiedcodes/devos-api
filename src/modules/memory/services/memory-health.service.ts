/**
 * MemoryHealthService
 * Story 12.1: Graphiti/Neo4j Setup
 *
 * Provides health indicators and graph statistics for the memory subsystem.
 * Gracefully handles Neo4j unavailability.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from './neo4j.service';
import { MemoryHealth, GraphStats } from '../interfaces/memory.interfaces';
import { toNumber } from '../utils/neo4j.utils';

@Injectable()
export class MemoryHealthService {
  private readonly logger = new Logger(MemoryHealthService.name);

  constructor(private readonly neo4jService: Neo4jService) {}

  /**
   * Get overall health status of the memory subsystem.
   */
  async getHealth(): Promise<MemoryHealth> {
    const connected = await this.neo4jService.verifyConnectivity();

    if (!connected) {
      return {
        neo4jConnected: false,
        neo4jVersion: null,
        totalEpisodes: 0,
        totalEntities: 0,
        lastEpisodeTimestamp: null,
        overallStatus: 'unavailable',
      };
    }

    try {
      // Get Neo4j version
      let neo4jVersion: string | null = null;
      try {
        const versionResult = await this.neo4jService.runQuery(
          'CALL dbms.components() YIELD versions RETURN versions[0] as version',
        );
        neo4jVersion =
          (versionResult.records[0]?.get('version') as string) ?? null;
      } catch {
        this.logger.warn('Could not retrieve Neo4j version');
      }

      // Count episodes
      const episodeResult = await this.neo4jService.runQuery(
        'MATCH (e:Episode) RETURN count(e) as count',
      );
      const totalEpisodes = toNumber(
        episodeResult.records[0]?.get('count'),
      );

      // Count entities
      const entityResult = await this.neo4jService.runQuery(
        'MATCH (er:EntityRef) RETURN count(er) as count',
      );
      const totalEntities = toNumber(
        entityResult.records[0]?.get('count'),
      );

      // Get latest episode timestamp
      let lastEpisodeTimestamp: Date | null = null;
      try {
        const timestampResult = await this.neo4jService.runQuery(
          'MATCH (e:Episode) RETURN e.timestamp as ts ORDER BY e.timestamp DESC LIMIT 1',
        );
        const ts = timestampResult.records[0]?.get('ts');
        if (ts) {
          lastEpisodeTimestamp =
            typeof ts === 'string'
              ? new Date(ts)
              : ts.toString
                ? new Date(ts.toString())
                : null;
        }
      } catch {
        this.logger.warn('Could not retrieve last episode timestamp');
      }

      return {
        neo4jConnected: true,
        neo4jVersion,
        totalEpisodes,
        totalEntities,
        lastEpisodeTimestamp,
        overallStatus: 'healthy',
      };
    } catch (error) {
      this.logger.error(
        `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        neo4jConnected: false,
        neo4jVersion: null,
        totalEpisodes: 0,
        totalEntities: 0,
        lastEpisodeTimestamp: null,
        overallStatus: 'unavailable',
      };
    }
  }

  /**
   * Get detailed graph statistics.
   */
  async getGraphStats(): Promise<GraphStats> {
    const connected = await this.neo4jService.verifyConnectivity();

    if (!connected) {
      return {
        episodeCount: 0,
        entityCount: 0,
        relationshipCount: 0,
        storageEstimateMB: 0,
      };
    }

    try {
      const episodeResult = await this.neo4jService.runQuery(
        'MATCH (e:Episode) RETURN count(e) as count',
      );
      const episodeCount = toNumber(
        episodeResult.records[0]?.get('count'),
      );

      const entityResult = await this.neo4jService.runQuery(
        'MATCH (er:EntityRef) RETURN count(er) as count',
      );
      const entityCount = toNumber(
        entityResult.records[0]?.get('count'),
      );

      const relResult = await this.neo4jService.runQuery(
        'MATCH ()-[r]->() RETURN count(r) as count',
      );
      const relationshipCount = toNumber(
        relResult.records[0]?.get('count'),
      );

      // Rough estimate: ~1KB per node, ~0.5KB per relationship
      const storageEstimateMB =
        ((episodeCount + entityCount) * 1 + relationshipCount * 0.5) / 1024;

      return {
        episodeCount,
        entityCount,
        relationshipCount,
        storageEstimateMB: Math.round(storageEstimateMB * 100) / 100,
      };
    } catch (error) {
      this.logger.error(
        `Graph stats failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        episodeCount: 0,
        entityCount: 0,
        relationshipCount: 0,
        storageEstimateMB: 0,
      };
    }
  }

}
