import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { AgentStatusService } from '../services/agent-status.service';
import { GetStatusHistoryQueryDto, GetWorkspaceStatusUpdatesQueryDto } from '../dto/get-status-history-query.dto';
import {
  GetAgentStatusResponseDto,
  GetStatusHistoryResponseDto,
  GetWorkspaceStatusUpdatesResponseDto,
} from '../dto/status-update-response.dto';

/**
 * AgentStatusController
 * Story 9.3: Agent Status Updates
 *
 * API endpoints for agent status queries and history
 */
@ApiTags('Agent Status')
@ApiBearerAuth()
@Controller('api/v1/workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class AgentStatusController {
  constructor(private readonly agentStatusService: AgentStatusService) {}

  /**
   * Get current status for an agent
   * GET /api/v1/workspaces/:workspaceId/agents/:agentId/status
   */
  @Get('agents/:agentId/status')
  @ApiOperation({ summary: 'Get current agent status' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  @ApiResponse({
    status: 200,
    description: 'Current agent status',
    type: GetAgentStatusResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async getAgentStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('agentId') agentId: string,
  ): Promise<GetAgentStatusResponseDto> {
    const { currentStatus, agent } = await this.agentStatusService.getCurrentStatus(
      agentId,
      workspaceId,
    );

    return {
      currentStatus: {
        activityStatus: currentStatus.activityStatus,
        message: currentStatus.message,
        since: currentStatus.since?.toISOString() || null,
      },
      agent: {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        status: agent.status,
      },
    };
  }

  /**
   * Get status history for an agent
   * GET /api/v1/workspaces/:workspaceId/agents/:agentId/status/history
   */
  @Get('agents/:agentId/status/history')
  @ApiOperation({ summary: 'Get agent status history' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  @ApiResponse({
    status: 200,
    description: 'Agent status history',
    type: GetStatusHistoryResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async getAgentStatusHistory(
    @Param('workspaceId') workspaceId: string,
    @Param('agentId') agentId: string,
    @Query() query: GetStatusHistoryQueryDto,
  ): Promise<GetStatusHistoryResponseDto> {
    const result = await this.agentStatusService.getAgentStatusHistory(
      agentId,
      workspaceId,
      {
        limit: query.limit,
        before: query.before ? new Date(query.before) : undefined,
      },
    );

    return {
      statusUpdates: result.statusUpdates.map((update) => ({
        id: update.id,
        agentId: update.agentId,
        agentType: update.agentType,
        agentName: update.agentName,
        previousStatus: update.previousStatus,
        newStatus: update.newStatus,
        message: update.message,
        category: update.category,
        metadata: update.metadata || undefined,
        createdAt: update.createdAt.toISOString(),
      })),
      hasMore: result.hasMore,
      cursor: result.cursor,
    };
  }

  /**
   * Get recent status updates for a workspace
   * GET /api/v1/workspaces/:workspaceId/status/updates
   */
  @Get('status/updates')
  @ApiOperation({ summary: 'Get workspace status updates' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiResponse({
    status: 200,
    description: 'Workspace status updates',
    type: GetWorkspaceStatusUpdatesResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getWorkspaceStatusUpdates(
    @Param('workspaceId') workspaceId: string,
    @Query() query: GetWorkspaceStatusUpdatesQueryDto,
  ): Promise<GetWorkspaceStatusUpdatesResponseDto> {
    const result = await this.agentStatusService.getWorkspaceStatusUpdates(
      workspaceId,
      {
        projectId: query.projectId,
        agentId: query.agentId,
        category: query.category,
        limit: query.limit,
      },
    );

    return {
      statusUpdates: result.statusUpdates.map((update) => ({
        id: update.id,
        agentId: update.agentId,
        agentType: update.agentType,
        agentName: update.agentName,
        previousStatus: update.previousStatus,
        newStatus: update.newStatus,
        message: update.message,
        category: update.category,
        metadata: update.metadata || undefined,
        createdAt: update.createdAt.toISOString(),
      })),
      hasMore: result.hasMore,
    };
  }
}
