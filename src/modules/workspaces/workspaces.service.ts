import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Workspace } from '../../database/entities/workspace.entity';
import { WorkspaceMember, WorkspaceRole } from '../../database/entities/workspace-member.entity';
import { User } from '../../database/entities/user.entity';
import { SecurityEvent, SecurityEventType } from '../../database/entities/security-event.entity';

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepository: Repository<WorkspaceMember>,
    @InjectRepository(SecurityEvent)
    private readonly securityEventRepository: Repository<SecurityEvent>,
  ) {}

  /**
   * Creates a default workspace for a newly registered user
   * @param user - The user who just registered
   * @param queryRunner - Transaction query runner for atomicity
   * @returns The created workspace
   */
  async createDefaultWorkspace(
    user: User,
    queryRunner: QueryRunner,
  ): Promise<Workspace> {
    try {
      // 1. Generate workspace name from user email
      const workspaceName = this.generateWorkspaceName(user.email);
      this.logger.log(`Creating default workspace for user ${user.id}: "${workspaceName}"`);

      // 2. Generate unique schema name
      const workspaceId = uuidv4();
      const schemaName = `workspace_${workspaceId.replace(/-/g, '')}`;

      // 3. Create workspace record
      const workspace = this.workspaceRepository.create({
        id: workspaceId,
        name: workspaceName,
        ownerUserId: user.id,
        schemaName: schemaName,
      });

      const savedWorkspace = await queryRunner.manager.save(workspace);
      this.logger.log(`Workspace created: ${savedWorkspace.id}`);

      // 4. Add user as workspace owner in workspace_members
      const workspaceMember = this.workspaceMemberRepository.create({
        workspaceId: savedWorkspace.id,
        userId: user.id,
        role: WorkspaceRole.OWNER,
      });

      await queryRunner.manager.save(workspaceMember);
      this.logger.log(`User ${user.id} added as owner to workspace ${savedWorkspace.id}`);

      // 5. Create PostgreSQL schema for the workspace
      await this.createWorkspaceSchema(schemaName, queryRunner);

      // 6. Create base tables in the workspace schema
      await this.createWorkspaceTables(schemaName, queryRunner);

      this.logger.log(`Workspace setup complete for user ${user.id}`);
      return savedWorkspace;
    } catch (error) {
      this.logger.error(
        `Workspace creation failed for user ${user.id}`,
        error instanceof Error ? error.stack : String(error),
      );

      // Fix Issue #4: Log workspace creation failure to security events
      try {
        const securityEvent = this.securityEventRepository.create({
          user_id: user.id,
          email: user.email,
          event_type: SecurityEventType.WORKSPACE_CREATION_FAILED,
          reason: 'workspace_creation_failed',
          metadata: {
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          },
        } as any);
        await this.securityEventRepository.save(securityEvent);
      } catch (logError) {
        this.logger.error('Failed to log workspace creation failure event', logError);
      }

      throw new InternalServerErrorException('Failed to create default workspace');
    }
  }

  /**
   * Generates a workspace name from user email
   * Format: "{EmailPrefix}'s Workspace"
   * Example: rajat@example.com → "Rajat's Workspace"
   * Fix Issue #5: Proper title case for professional appearance
   */
  private generateWorkspaceName(email: string): string {
    const emailPrefix = email.split('@')[0];

    // Title case: capitalize first letter of each word segment (separated by dots, dashes, underscores)
    const titleCased = emailPrefix
      .split(/[._-]/)
      .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
      .join('');

    return `${titleCased}'s Workspace`;
  }

  /**
   * Creates a PostgreSQL schema for the workspace
   * Schema name format: workspace_{uuid without dashes}
   */
  private async createWorkspaceSchema(
    schemaName: string,
    queryRunner: QueryRunner,
  ): Promise<void> {
    try {
      // Validate schema name pattern (Fix Issue #1: SQL injection prevention)
      const schemaPattern = /^workspace_[a-f0-9]{32}$/;
      if (!schemaPattern.test(schemaName)) {
        throw new Error(`Invalid schema name format: ${schemaName}`);
      }

      // Fix Issue #3: Check if schema already exists (race condition prevention)
      const existingSchema = await queryRunner.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
        [schemaName],
      );

      if (existingSchema.length > 0) {
        throw new Error(`Schema already exists: ${schemaName}`);
      }

      // Create schema using identifier escaping (Fix Issue #1: Prevent SQL injection)
      // PostgreSQL uses identifier for schema names, double quotes are safe with validation
      await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS ${queryRunner.connection.driver.escape(schemaName)}`);
      this.logger.log(`Schema created: ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Schema creation failed: ${schemaName}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Creates base tables in the workspace schema
   * Tables: projects, integrations, byok_secrets
   *
   * Fix Issue #8: These tables are created via raw SQL instead of TypeORM migrations because:
   * 1. Each workspace gets its own PostgreSQL schema (multi-tenancy pattern)
   * 2. Schemas are created dynamically at runtime when users register
   * 3. TypeORM migrations run once globally, not per-workspace
   * 4. This approach allows unlimited workspace scaling without migration conflicts
   */
  private async createWorkspaceTables(
    schemaName: string,
    queryRunner: QueryRunner,
  ): Promise<void> {
    try {
      // Create projects table
      await queryRunner.query(`
        CREATE TABLE "${schemaName}".projects (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          template_id VARCHAR(100),
          github_repo_url VARCHAR(500),
          deployment_url VARCHAR(500),
          created_by_user_id UUID NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted'))
        )
      `);

      // Create index on created_by_user_id
      await queryRunner.query(`
        CREATE INDEX idx_projects_created_by_user_id
        ON "${schemaName}".projects (created_by_user_id)
      `);

      // Create index on status
      await queryRunner.query(`
        CREATE INDEX idx_projects_status
        ON "${schemaName}".projects (status)
      `);

      this.logger.log(`Table created: ${schemaName}.projects`);

      // Create integrations table
      await queryRunner.query(`
        CREATE TABLE "${schemaName}".integrations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          integration_type VARCHAR(50) NOT NULL,
          encrypted_credentials TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Create index on integration_type
      await queryRunner.query(`
        CREATE INDEX idx_integrations_type
        ON "${schemaName}".integrations (integration_type)
      `);

      this.logger.log(`Table created: ${schemaName}.integrations`);

      // Create byok_secrets table
      await queryRunner.query(`
        CREATE TABLE "${schemaName}".byok_secrets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          provider VARCHAR(50) NOT NULL,
          encrypted_api_key TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      this.logger.log(`Table created: ${schemaName}.byok_secrets`);

      // Fix Issue #7: Verify all tables were created successfully
      const verificationQuery = await queryRunner.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name IN ('projects', 'integrations', 'byok_secrets')`,
        [schemaName],
      );

      if (verificationQuery.length !== 3) {
        throw new Error(`Table verification failed: Expected 3 tables, found ${verificationQuery.length}`);
      }

      this.logger.log(`All workspace tables verified in schema: ${schemaName}`);
    } catch (error) {
      // Fix Issue #2: Cleanup orphaned schema if table creation fails
      this.logger.error(
        `Table creation failed in schema: ${schemaName}. Attempting cleanup...`,
        error instanceof Error ? error.stack : String(error),
      );

      try {
        await queryRunner.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        this.logger.warn(`Cleaned up orphaned schema: ${schemaName}`);
      } catch (cleanupError) {
        this.logger.error(
          `Failed to cleanup orphaned schema: ${schemaName}`,
          cleanupError instanceof Error ? cleanupError.stack : String(cleanupError),
        );
      }

      throw error;
    }
  }
}
