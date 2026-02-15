/**
 * Neo4jService
 * Story 12.1: Graphiti/Neo4j Setup
 *
 * Manages the Neo4j driver connection, schema initialization, and query execution.
 * Implements graceful degradation: if Neo4j is unavailable, the system continues
 * operating without long-term memory capabilities.
 */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { Driver, Session, Result, Transaction } from 'neo4j-driver';

@Injectable()
export class Neo4jService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Neo4jService.name);
  private driver: Driver | null = null;
  private connected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const uri =
      this.configService.get<string>('NEO4J_URI') || 'bolt://localhost:7687';
    const user = this.configService.get<string>('NEO4J_USER') || 'neo4j';
    const password = this.configService.get<string>('NEO4J_PASSWORD');

    if (!password) {
      this.logger.warn(
        'NEO4J_PASSWORD not set. Neo4j memory service will be unavailable.',
      );
      this.connected = false;
      return;
    }

    try {
      this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
      await this.driver.verifyConnectivity();
      this.connected = true;
      this.logger.log(`Connected to Neo4j at ${uri}`);

      await this.initializeSchema();
    } catch (error) {
      this.logger.warn(
        `Failed to connect to Neo4j at ${uri}: ${error instanceof Error ? error.message : String(error)}. Memory service will be unavailable.`,
      );
      this.connected = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.logger.log('Neo4j driver closed');
    }
  }

  /**
   * Execute a Cypher query and return the result.
   */
  async runQuery(
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<Result> {
    if (!this.driver) {
      throw new Error('Neo4j driver is not initialized');
    }

    const session: Session = this.driver.session();
    try {
      const result = await session.run(cypher, params);
      return result;
    } finally {
      await session.close();
    }
  }

  /**
   * Execute work within a transaction. Commits on success, rolls back on error.
   */
  async runInTransaction<T>(
    work: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    if (!this.driver) {
      throw new Error('Neo4j driver is not initialized');
    }

    const session: Session = this.driver.session();
    const tx = session.beginTransaction();
    try {
      const result = await work(tx);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Verify Neo4j connectivity. Returns true if connected, false otherwise.
   */
  async verifyConnectivity(): Promise<boolean> {
    if (!this.driver) {
      return false;
    }

    try {
      await this.driver.verifyConnectivity();
      this.connected = true;
      return true;
    } catch {
      this.connected = false;
      return false;
    }
  }

  /**
   * Get the underlying Neo4j driver for advanced use.
   */
  getDriver(): Driver | null {
    return this.driver;
  }

  /**
   * Check if the service is currently connected.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Initialize graph schema constraints and indexes on startup.
   * Uses IF NOT EXISTS for idempotent execution.
   */
  private async initializeSchema(): Promise<void> {
    const constraints = [
      'CREATE CONSTRAINT episode_id IF NOT EXISTS FOR (e:Episode) REQUIRE e.id IS UNIQUE',
      'CREATE CONSTRAINT entity_ref_id IF NOT EXISTS FOR (er:EntityRef) REQUIRE er.id IS UNIQUE',
      'CREATE CONSTRAINT project_node_id IF NOT EXISTS FOR (p:ProjectNode) REQUIRE p.projectId IS UNIQUE',
      'CREATE CONSTRAINT workspace_node_id IF NOT EXISTS FOR (w:WorkspaceNode) REQUIRE w.workspaceId IS UNIQUE',
      // Story 12.6: Cross-Project Learning - WorkspacePattern constraints
      'CREATE CONSTRAINT workspace_pattern_id IF NOT EXISTS FOR (wp:WorkspacePattern) REQUIRE wp.id IS UNIQUE',
    ];

    const indexes = [
      'CREATE INDEX episode_project IF NOT EXISTS FOR (e:Episode) ON (e.projectId)',
      'CREATE INDEX episode_workspace IF NOT EXISTS FOR (e:Episode) ON (e.workspaceId)',
      'CREATE INDEX episode_timestamp IF NOT EXISTS FOR (e:Episode) ON (e.timestamp)',
      'CREATE INDEX episode_type IF NOT EXISTS FOR (e:Episode) ON (e.episodeType)',
      'CREATE INDEX entity_ref_name IF NOT EXISTS FOR (er:EntityRef) ON (er.name)',
      // Story 12.6: Cross-Project Learning - WorkspacePattern indexes
      'CREATE INDEX workspace_pattern_workspace IF NOT EXISTS FOR (wp:WorkspacePattern) ON (wp.workspaceId)',
      'CREATE INDEX workspace_pattern_type IF NOT EXISTS FOR (wp:WorkspacePattern) ON (wp.patternType)',
      'CREATE INDEX workspace_pattern_confidence IF NOT EXISTS FOR (wp:WorkspacePattern) ON (wp.confidence)',
    ];

    for (const constraint of constraints) {
      try {
        await this.runQuery(constraint);
      } catch (error) {
        this.logger.warn(
          `Schema constraint warning: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    for (const index of indexes) {
      try {
        await this.runQuery(index);
      } catch (error) {
        this.logger.warn(
          `Schema index warning: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log('Neo4j schema constraints and indexes initialized');
  }
}
