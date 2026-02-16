import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiExcludeController } from '@nestjs/swagger';
import { CliSessionsService } from './cli-sessions.service';
import { CliSessionArchiveService } from './cli-session-archive.service';
import { CliSessionArchiveSchedulerService } from './cli-session-archive-scheduler.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../shared/guards/workspace-access.guard';
import { WorkspaceAdminGuard } from '../workspaces/guards/workspace-admin.guard';
import { ServiceAuthGuard } from '../../shared/guards/service-auth.guard';
import {
  CreateCliSessionDto,
  GetSessionsQueryDto,
  PaginatedCliSessionsResult,
  CliSessionReplayDto,
} from './dto';

/**
 * CLI Sessions Controller
 * Story 8.5: CLI Session History and Replay
 * Story 16.3: CLI Session Archive Storage (AC7)
 *
 * Provides REST API endpoints for CLI session history management.
 */
@ApiTags('CLI Sessions')
@ApiBearerAuth('JWT-auth')
@Controller('api/workspaces/:workspaceId/cli-sessions')
export class CliSessionsController {
  constructor(
    private readonly cliSessionsService: CliSessionsService,
    private readonly archiveService: CliSessionArchiveService,
    private readonly archiveScheduler: CliSessionArchiveSchedulerService,
  ) {}

  /**
   * GET /api/workspaces/:workspaceId/cli-sessions
   * Get paginated session history for a workspace
   */
  @Get()
  @UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
  async getSessions(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: GetSessionsQueryDto,
  ): Promise<PaginatedCliSessionsResult> {
    return this.cliSessionsService.getWorkspaceSessions({
      workspaceId,
      projectId: query.projectId,
      agentType: query.agentType,
      status: query.status,
      storyKey: query.storyKey,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      limit: query.limit || 20,
      offset: query.offset || 0,
    });
  }

  /**
   * GET /api/workspaces/:workspaceId/cli-sessions/archive-stats
   * Get archive statistics for a workspace
   * Story 16.3: CLI Session Archive Storage (AC7)
   * IMPORTANT: Declared BEFORE :sessionId parameterized routes to prevent route collision
   */
  @Get('archive-stats')
  @UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
  async getArchiveStats(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<{
    totalArchived: number;
    totalSizeBytes: number;
    oldestArchive: string | null;
    newestArchive: string | null;
  }> {
    const stats = await this.archiveService.getArchiveStats(workspaceId);
    return {
      totalArchived: stats.totalArchived,
      totalSizeBytes: stats.totalSizeBytes,
      oldestArchive: stats.oldestArchive ? stats.oldestArchive.toISOString() : null,
      newestArchive: stats.newestArchive ? stats.newestArchive.toISOString() : null,
    };
  }

  /**
   * GET /api/workspaces/:workspaceId/cli-sessions/:sessionId
   * Get a single session with output for replay
   */
  @Get(':sessionId')
  @UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
  async getSession(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<CliSessionReplayDto> {
    return this.cliSessionsService.getSessionForReplay(workspaceId, sessionId);
  }

  /**
   * POST /api/workspaces/:workspaceId/cli-sessions/:sessionId/archive
   * Manually trigger archive for a session (Admin/Owner only)
   * Story 16.3: CLI Session Archive Storage (AC7)
   */
  @Post(':sessionId/archive')
  @UseGuards(JwtAuthGuard, WorkspaceAdminGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async archiveSession(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<{ message: string }> {
    const session = await this.cliSessionsService.getSession(workspaceId, sessionId);

    if (!session) {
      throw new NotFoundException(`CLI session ${sessionId} not found`);
    }

    if (session.storageKey) {
      throw new ConflictException(`CLI session ${sessionId} is already archived`);
    }

    await this.archiveScheduler.enqueueSessionArchive(sessionId);
    return { message: 'Session queued for archival' };
  }

  /**
   * DELETE /api/workspaces/:workspaceId/cli-sessions/:sessionId
   * Delete a session (Admin/Owner only)
   */
  @Delete(':sessionId')
  @UseGuards(JwtAuthGuard, WorkspaceAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSession(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<void> {
    await this.cliSessionsService.deleteSession(workspaceId, sessionId);
  }
}

/**
 * Internal CLI Sessions Controller
 * Used for service-to-service communication (orchestrator -> api)
 * Story 16.3: Added internal archive endpoint
 */
@ApiExcludeController()
@Controller('api/internal/cli-sessions')
export class CliSessionsInternalController {
  constructor(
    private readonly cliSessionsService: CliSessionsService,
    private readonly archiveScheduler: CliSessionArchiveSchedulerService,
  ) {}

  /**
   * POST /api/internal/cli-sessions
   * Create a CLI session record (internal service only)
   * Rate limited to 100 requests per minute to prevent abuse
   */
  @Post()
  @UseGuards(ServiceAuthGuard)
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async createSession(
    @Body() dto: CreateCliSessionDto,
  ): Promise<{ id: string }> {
    const session = await this.cliSessionsService.createSession(dto);
    return { id: session.id };
  }

  /**
   * POST /api/internal/cli-sessions/:sessionId/archive
   * Internal trigger for session archive (called by orchestrator when CLI session ends)
   * Story 16.3: CLI Session Archive Storage (AC7)
   */
  @Post(':sessionId/archive')
  @UseGuards(ServiceAuthGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async archiveSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<{ message: string }> {
    await this.archiveScheduler.enqueueSessionArchive(sessionId);
    return { message: 'Session queued for archival' };
  }
}
