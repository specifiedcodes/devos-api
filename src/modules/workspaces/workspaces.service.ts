import { Injectable, Logger, InternalServerErrorException, NotFoundException, BadRequestException, ForbiddenException, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { Workspace } from '../../database/entities/workspace.entity';
import { WorkspaceMember, WorkspaceRole } from '../../database/entities/workspace-member.entity';
import { User } from '../../database/entities/user.entity';
import { SecurityEvent, SecurityEventType } from '../../database/entities/security-event.entity';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { WorkspaceResponseDto } from './dto/workspace-response.dto';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);
  private readonly ACCESS_TOKEN_EXPIRY = '24h';
  private readonly REFRESH_TOKEN_EXPIRY = '30d';

  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepository: Repository<WorkspaceMember>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(SecurityEvent)
    private readonly securityEventRepository: Repository<SecurityEvent>,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
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

  /**
   * Get all workspaces for a user with role information
   * @param userId - User ID to fetch workspaces for
   * @returns Array of workspaces with role, project count, and member count
   */
  async getUserWorkspaces(userId: string): Promise<WorkspaceResponseDto[]> {
    try {
      // Get user's current workspace
      const user = await this.userRepository.findOne({
        where: { id: userId },
        select: ['currentWorkspaceId'],
      });

      // Query to get all workspaces for the user with role and counts
      const workspaces = await this.workspaceRepository
        .createQueryBuilder('workspace')
        .leftJoin('workspace.members', 'member')
        .where('member.userId = :userId', { userId })
        .select([
          'workspace.id',
          'workspace.name',
          'workspace.description',
          'workspace.createdAt',
          'member.role',
        ])
        .getMany();

      // Get counts for each workspace
      const workspaceDtos: WorkspaceResponseDto[] = await Promise.all(
        workspaces.map(async (workspace) => {
          // Get member count
          const memberCount = await this.workspaceMemberRepository.count({
            where: { workspaceId: workspace.id },
          });

          // Get project count from workspace schema
          let projectCount = 0;
          try {
            const schemaName = workspace.schemaName;
            const result = await this.dataSource.query(
              `SELECT COUNT(*)::int as count FROM "${schemaName}".projects WHERE status = 'active'`,
            );
            projectCount = result[0]?.count || 0;
          } catch (error) {
            this.logger.warn(`Failed to get project count for workspace ${workspace.id}: ${error}`);
            projectCount = 0;
          }

          // Get user's role for this workspace
          const member = await this.workspaceMemberRepository.findOne({
            where: { workspaceId: workspace.id, userId },
          });

          return {
            id: workspace.id,
            name: workspace.name,
            description: workspace.description,
            role: member?.role || WorkspaceRole.VIEWER,
            projectCount,
            memberCount,
            createdAt: workspace.createdAt,
            isCurrentWorkspace: workspace.id === user?.currentWorkspaceId,
          };
        }),
      );

      return workspaceDtos;
    } catch (error) {
      this.logger.error(
        `Failed to get workspaces for user ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException('Failed to fetch workspaces');
    }
  }

  /**
   * Create new workspace for user (user-initiated, not registration default)
   * @param userId - User ID creating the workspace
   * @param dto - Workspace creation data
   * @returns Created workspace with role information
   */
  async createWorkspace(userId: string, dto: CreateWorkspaceDto): Promise<WorkspaceResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validate name length
      if (dto.name.length < 3 || dto.name.length > 50) {
        throw new BadRequestException('Workspace name must be between 3 and 50 characters');
      }

      this.logger.log(`Creating workspace for user ${userId}: "${dto.name}"`);

      // Generate unique schema name
      const workspaceId = uuidv4();
      const schemaName = `workspace_${workspaceId.replace(/-/g, '')}`;

      // Create workspace record
      const workspace = this.workspaceRepository.create({
        id: workspaceId,
        name: dto.name,
        description: dto.description,
        ownerUserId: userId,
        schemaName: schemaName,
      });

      const savedWorkspace = await queryRunner.manager.save(workspace);
      this.logger.log(`Workspace created: ${savedWorkspace.id}`);

      // Add user as workspace owner in workspace_members
      const workspaceMember = this.workspaceMemberRepository.create({
        workspaceId: savedWorkspace.id,
        userId: userId,
        role: WorkspaceRole.OWNER,
      });

      await queryRunner.manager.save(workspaceMember);
      this.logger.log(`User ${userId} added as owner to workspace ${savedWorkspace.id}`);

      // Create PostgreSQL schema for the workspace
      await this.createWorkspaceSchema(schemaName, queryRunner);

      // Create base tables in the workspace schema
      await this.createWorkspaceTables(schemaName, queryRunner);

      await queryRunner.commitTransaction();

      this.logger.log(`User-initiated workspace creation complete for user ${userId}`);

      return {
        id: savedWorkspace.id,
        name: savedWorkspace.name,
        description: savedWorkspace.description,
        role: WorkspaceRole.OWNER,
        projectCount: 0,
        memberCount: 1,
        createdAt: savedWorkspace.createdAt,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      this.logger.error(
        `User-initiated workspace creation failed for user ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );

      // Log security event
      try {
        const securityEvent = this.securityEventRepository.create({
          user_id: userId,
          email: '',
          event_type: SecurityEventType.WORKSPACE_CREATION_FAILED,
          reason: 'user_initiated_workspace_creation_failed',
          metadata: {
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          },
        } as any);
        await this.securityEventRepository.save(securityEvent);
      } catch (logError) {
        this.logger.error('Failed to log workspace creation failure event', logError);
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to create workspace');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Rename existing workspace
   * @param workspaceId - Workspace ID to rename
   * @param newName - New workspace name
   * @returns Updated workspace
   */
  async renameWorkspace(workspaceId: string, newName: string): Promise<WorkspaceResponseDto> {
    try {
      // Validate name length
      if (newName.length < 3 || newName.length > 50) {
        throw new BadRequestException('Workspace name must be between 3 and 50 characters');
      }

      // Check workspace exists
      const workspace = await this.workspaceRepository.findOne({
        where: { id: workspaceId },
      });

      if (!workspace) {
        throw new NotFoundException('Workspace not found');
      }

      // Update workspace name
      workspace.name = newName;
      const updatedWorkspace = await this.workspaceRepository.save(workspace);

      this.logger.log(`Workspace renamed: ${workspaceId} -> "${newName}"`);

      // Get member count
      const memberCount = await this.workspaceMemberRepository.count({
        where: { workspaceId },
      });

      // Get project count
      let projectCount = 0;
      try {
        const result = await this.dataSource.query(
          `SELECT COUNT(*)::int as count FROM "${workspace.schemaName}".projects WHERE status = 'active'`,
        );
        projectCount = result[0]?.count || 0;
      } catch (error) {
        this.logger.warn(`Failed to get project count for workspace ${workspaceId}: ${error}`);
      }

      return {
        id: updatedWorkspace.id,
        name: updatedWorkspace.name,
        description: updatedWorkspace.description,
        role: WorkspaceRole.OWNER, // Role will be determined by guard
        projectCount,
        memberCount,
        createdAt: updatedWorkspace.createdAt,
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error(
        `Failed to rename workspace ${workspaceId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException('Failed to rename workspace');
    }
  }

  /**
   * Soft delete workspace (30-day retention before permanent deletion)
   * @param workspaceId - Workspace ID to delete
   */
  async softDeleteWorkspace(workspaceId: string): Promise<void> {
    try {
      // Check workspace exists
      const workspace = await this.workspaceRepository.findOne({
        where: { id: workspaceId },
      });

      if (!workspace) {
        throw new NotFoundException('Workspace not found');
      }

      // Soft delete (sets deletedAt timestamp)
      await this.workspaceRepository.softDelete(workspaceId);

      this.logger.log(`Workspace soft deleted: ${workspaceId}`);

      // Log security event
      try {
        const securityEvent = this.securityEventRepository.create({
          user_id: workspace.ownerUserId,
          email: '',
          event_type: SecurityEventType.WORKSPACE_DELETED,
          reason: 'workspace_soft_deleted',
          metadata: {
            workspaceId,
            workspaceName: workspace.name,
            timestamp: new Date().toISOString(),
          },
        } as any);
        await this.securityEventRepository.save(securityEvent);
      } catch (logError) {
        this.logger.error('Failed to log workspace deletion event', logError);
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `Failed to delete workspace ${workspaceId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException('Failed to delete workspace');
    }
  }

  /**
   * Switch user to a different workspace
   * @param userId - User ID performing the switch
   * @param targetWorkspaceId - Workspace ID to switch to
   * @param currentJti - Current session JTI
   * @param ipAddress - User's IP address
   * @param userAgent - User's user agent
   * @returns New tokens and workspace information
   */
  async switchWorkspace(
    userId: string,
    targetWorkspaceId: string,
    currentJti: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<{
    workspace: WorkspaceResponseDto;
    tokens: { access_token: string; refresh_token: string };
  }> {
    try {
      // 1. Verify workspace exists
      const workspace = await this.workspaceRepository.findOne({
        where: { id: targetWorkspaceId },
        withDeleted: false,
      });

      if (!workspace) {
        throw new NotFoundException('Workspace not found');
      }

      // 2. Verify user is member of target workspace
      const membership = await this.workspaceMemberRepository.findOne({
        where: { userId, workspaceId: targetWorkspaceId },
      });

      if (!membership) {
        throw new ForbiddenException('You are not a member of this workspace');
      }

      // 3. Get user data
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Store old workspace ID for logging
      const oldWorkspaceId = user.currentWorkspaceId;

      // 4. Update user's current workspace in database
      await this.userRepository.update(userId, {
        currentWorkspaceId: targetWorkspaceId,
      });

      // 5. Find current session and update workspace_id
      const sessionKeys = await this.redisService.keys(`session:${userId}:*`);
      for (const key of sessionKeys) {
        const sessionData = await this.redisService.get(key);
        if (sessionData) {
          const session = JSON.parse(sessionData);
          if (session.access_token_jti === currentJti || session.refresh_token_jti === currentJti) {
            // Update session with new workspace_id
            session.workspace_id = targetWorkspaceId;
            const ttlSeconds = Math.floor(
              (new Date(session.expires_at).getTime() - Date.now()) / 1000,
            );
            if (ttlSeconds > 0) {
              await this.redisService.set(key, JSON.stringify(session), ttlSeconds);
            }
            break;
          }
        }
      }

      // 6. Generate NEW tokens with updated workspace_id in payload
      const accessTokenJti = uuidv4();
      const refreshTokenJti = uuidv4();

      const accessPayload = {
        sub: userId,
        email: user.email,
        jti: accessTokenJti,
        workspaceId: targetWorkspaceId,
      };

      const accessToken = this.jwtService.sign(accessPayload, {
        expiresIn: this.ACCESS_TOKEN_EXPIRY,
      });

      const refreshPayload = {
        sub: userId,
        jti: refreshTokenJti,
        workspaceId: targetWorkspaceId,
      };

      const refreshToken = this.jwtService.sign(refreshPayload, {
        expiresIn: this.REFRESH_TOKEN_EXPIRY,
      });

      // 7. Create new session with new workspace context
      const sessionId = uuidv4();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      const newSession = {
        session_id: sessionId,
        user_id: userId,
        workspace_id: targetWorkspaceId,
        access_token_jti: accessTokenJti,
        refresh_token_jti: refreshTokenJti,
        created_at: new Date(),
        expires_at: expiresAt,
        ip_address: ipAddress,
        user_agent: userAgent,
        last_active: new Date(),
      };

      const ttlSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
      await this.redisService.set(
        `session:${userId}:${sessionId}`,
        JSON.stringify(newSession),
        ttlSeconds,
      );

      // 8. Log security event
      try {
        const securityEvent = this.securityEventRepository.create({
          user_id: userId,
          email: user.email,
          event_type: SecurityEventType.WORKSPACE_SWITCHED,
          ip_address: ipAddress,
          user_agent: userAgent,
          metadata: {
            from_workspace_id: oldWorkspaceId,
            to_workspace_id: targetWorkspaceId,
            timestamp: new Date().toISOString(),
          },
        } as any);
        await this.securityEventRepository.save(securityEvent);
      } catch (logError) {
        this.logger.error('Failed to log workspace switch event', logError);
      }

      this.logger.log(`User ${userId} switched from workspace ${oldWorkspaceId} to ${targetWorkspaceId}`);

      // 9. Get project count and member count for response
      let projectCount = 0;
      try {
        const result = await this.dataSource.query(
          `SELECT COUNT(*)::int as count FROM "${workspace.schemaName}".projects WHERE status = 'active'`,
        );
        projectCount = result[0]?.count || 0;
      } catch (error) {
        this.logger.warn(`Failed to get project count for workspace ${targetWorkspaceId}`);
        projectCount = 0;
      }

      const memberCount = await this.workspaceMemberRepository.count({
        where: { workspaceId: targetWorkspaceId },
      });

      return {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          description: workspace.description,
          role: membership.role,
          projectCount,
          memberCount,
          createdAt: workspace.createdAt,
          isCurrentWorkspace: true,
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }

      this.logger.error(
        `Failed to switch workspace for user ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException('Failed to switch workspace');
    }
  }
}
