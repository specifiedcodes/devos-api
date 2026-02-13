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
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CliSessionsService } from './cli-sessions.service';
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
 *
 * Provides REST API endpoints for CLI session history management.
 */
@Controller('api/workspaces/:workspaceId/cli-sessions')
export class CliSessionsController {
  constructor(private readonly cliSessionsService: CliSessionsService) {}

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
 */
@Controller('api/internal/cli-sessions')
export class CliSessionsInternalController {
  constructor(private readonly cliSessionsService: CliSessionsService) {}

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
}
