import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class TenantConnectionService {
  private readonly logger = new Logger(TenantConnectionService.name);

  constructor(
    @InjectDataSource() private readonly connection: DataSource,
  ) {}

  /**
   * Validates that a string is a valid UUID format
   * @param uuid - String to validate
   * @throws BadRequestException if not a valid UUID
   */
  private validateUUID(uuid: string): void {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      throw new BadRequestException(`Invalid workspace ID format: ${uuid}`);
    }
  }

  /**
   * Sanitizes a schema name to prevent SQL injection
   * Only allows alphanumeric characters and underscores
   * @param schemaName - Schema name to sanitize
   * @throws BadRequestException if schema name is invalid
   */
  private sanitizeSchemaName(schemaName: string): string {
    // Only allow workspace_ prefix followed by alphanumeric and underscores
    const validSchemaRegex = /^workspace_[a-f0-9_]+$/i;
    if (!validSchemaRegex.test(schemaName)) {
      throw new BadRequestException(`Invalid schema name format: ${schemaName}`);
    }
    return schemaName;
  }

  /**
   * Creates a new workspace schema in the database
   * @param workspaceId - UUID of the workspace
   * @returns The schema name created (e.g., 'workspace_550e8400_e29b_41d4_a716_446655440000')
   * @throws BadRequestException if workspaceId is not a valid UUID
   */
  async createWorkspaceSchema(workspaceId: string): Promise<string> {
    try {
      // Validate UUID format first (fixes Issue #2)
      this.validateUUID(workspaceId);

      // Convert UUID to schema-safe name (replace hyphens with underscores)
      const schemaName = `workspace_${workspaceId.replace(/-/g, '_')}`;

      // Sanitize schema name to prevent SQL injection (fixes Issue #1)
      const sanitizedSchemaName = this.sanitizeSchemaName(schemaName);

      this.logger.log(`Creating workspace schema: ${sanitizedSchemaName}`);

      // Use identifier quoting to prevent SQL injection
      await this.connection.query(
        `CREATE SCHEMA IF NOT EXISTS "${sanitizedSchemaName}"`,
      );

      // Set search_path to the new schema for workspace-specific operations
      await this.connection.query(
        `SET search_path TO "${sanitizedSchemaName}"`,
      );

      // TODO: Run workspace-specific migrations here in future stories
      // This is where we would create workspace-scoped tables (projects, tasks, etc.)

      // Reset search_path back to public
      await this.connection.query(`SET search_path TO public`);

      this.logger.log(`Successfully created schema: ${sanitizedSchemaName}`);
      return sanitizedSchemaName;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Failed to create workspace schema for ${workspaceId}`,
        errorStack,
      );
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new Error(
        `Database error while creating workspace schema: ${errorMessage}`,
      );
    }
  }

  /**
   * Sets the database search_path to the specified workspace schema
   * This should be called at the start of each request handling workspace data
   * @param schemaName - The workspace schema name (e.g., 'workspace_abc123')
   * @throws BadRequestException if schema name is invalid
   */
  async setWorkspaceContext(schemaName: string): Promise<void> {
    try {
      // Sanitize schema name to prevent SQL injection (fixes Issue #1)
      const sanitizedSchemaName = this.sanitizeSchemaName(schemaName);

      // Use identifier quoting to prevent SQL injection
      // Set search_path with public as fallback for shared tables
      await this.connection.query(
        `SET search_path TO "${sanitizedSchemaName}", public`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Failed to set workspace context for ${schemaName}`,
        errorStack,
      );
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new Error(
        `Database error while setting workspace context: ${errorMessage}`,
      );
    }
  }

  /**
   * Resets the database search_path to the default public schema
   * This should be called after request completion to prevent context leakage
   */
  async resetContext(): Promise<void> {
    try {
      await this.connection.query(`SET search_path TO public`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error('Failed to reset database context', errorStack);
      throw new Error(
        `Database error while resetting context: ${errorMessage}`,
      );
    }
  }

  /**
   * Checks if a workspace schema exists in the database
   * @param schemaName - The workspace schema name to check
   * @returns true if schema exists, false otherwise
   */
  async schemaExists(schemaName: string): Promise<boolean> {
    try {
      const sanitizedSchemaName = this.sanitizeSchemaName(schemaName);
      const result = await this.connection.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
        [sanitizedSchemaName],
      );
      return result.length > 0;
    } catch (error) {
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Failed to check schema existence for ${schemaName}`,
        errorStack,
      );
      return false;
    }
  }

  /**
   * Health check for database connectivity
   * @returns Object with connection status and details
   */
  async checkHealth(): Promise<{
    status: 'healthy' | 'unhealthy';
    database: string;
    poolSize: number;
    activeConnections: number;
  }> {
    try {
      // Simple query to check database connectivity
      await this.connection.query('SELECT 1');

      const poolSize = this.connection.options['poolSize'] || 0;
      const driver = this.connection.driver as any;
      const activeConnections = driver.master?.totalCount || 0;

      return {
        status: 'healthy',
        database: this.connection.options.database as string,
        poolSize: poolSize as number,
        activeConnections: activeConnections,
      };
    } catch (error) {
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error('Database health check failed', errorStack);
      return {
        status: 'unhealthy',
        database: this.connection.options.database as string,
        poolSize: 0,
        activeConnections: 0,
      };
    }
  }
}
