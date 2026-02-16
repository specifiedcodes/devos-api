import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ConflictException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../shared/guards/workspace-access.guard';
import { AgentsService } from './agents.service';
import { AgentQueueService } from '../agent-queue/services/agent-queue.service';
import { AgentJobType } from '../agent-queue/entities/agent-job.entity';
import { AgentStatus } from '../../database/entities/agent.entity';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { ListAgentsQueryDto } from './dto/list-agents-query.dto';
import { ExecuteTaskDto } from './dto/execute-task.dto';
import { FailureRecoveryService } from './failure-recovery.service';

/**
 * AgentsController
 * Story 5.2: Agent Entity & Lifecycle Management
 * Story 5.3: Dev Agent Implementation - execute endpoint
 * Story 5.10: Agent Failure Detection & Recovery - health, recovery-status, recover endpoints
 *
 * API endpoints for agent management
 */
@ApiTags('Agents')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/workspaces/:workspaceId/agents')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly agentQueueService: AgentQueueService,
    private readonly failureRecoveryService: FailureRecoveryService,
  ) {}

  /**
   * Health check for all agents in a workspace
   * Story 5.10: Agent Failure Detection & Recovery
   * IMPORTANT: This route MUST be before :agentId routes to avoid route conflict
   */
  @Get('health')
  @ApiOperation({ summary: 'Health check for all agents in a workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Agent health status for the workspace' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  async getHealth(
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.failureRecoveryService.healthCheck(workspaceId);
  }

  /**
   * Create a new agent
   */
  @Post()
  @ApiOperation({ summary: 'Create a new agent in a workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Agent created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  async createAgent(
    @Param('workspaceId') workspaceId: string,
    @Req() req: any,
    @Body() body: CreateAgentDto,
  ) {
    const agent = await this.agentsService.createAgent({
      ...body,
      workspaceId,
      createdBy: req.user.userId || req.user.id,
    });

    return {
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      workspaceId: agent.workspaceId,
      projectId: agent.projectId,
      createdAt: agent.createdAt,
    };
  }

  /**
   * Get agent by ID
   */
  @Get(':agentId')
  @ApiOperation({ summary: 'Get agent by ID' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'agentId', description: 'Agent ID', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Agent details returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async getAgent(
    @Param('workspaceId') workspaceId: string,
    @Param('agentId') agentId: string,
  ) {
    return this.agentsService.getAgent(agentId, workspaceId);
  }

  /**
   * List agents
   */
  @Get()
  @ApiOperation({ summary: 'List agents in a workspace with optional filters' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'List of agents' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a workspace member' })
  async listAgents(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListAgentsQueryDto,
  ) {
    return this.agentsService.listAgents(workspaceId, {
      projectId: query.projectId,
      status: query.status,
      type: query.type,
      limit: query.limit,
      offset: query.offset,
    });
  }

  /**
   * Update agent
   */
  @Patch(':agentId')
  @ApiOperation({ summary: 'Update agent configuration' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'agentId', description: 'Agent ID', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Agent updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async updateAgent(
    @Param('workspaceId') workspaceId: string,
    @Param('agentId') agentId: string,
    @Body() body: UpdateAgentDto,
  ) {
    return this.agentsService.updateAgent(agentId, workspaceId, body);
  }

  /**
   * Update heartbeat
   */
  @Post(':agentId/heartbeat')
  @ApiOperation({ summary: 'Update agent heartbeat timestamp' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'agentId', description: 'Agent ID', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Heartbeat updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async updateHeartbeat(
    @Param('workspaceId') workspaceId: string,
    @Param('agentId') agentId: string,
  ) {
    await this.agentsService.updateHeartbeat(agentId, workspaceId);
    return { success: true };
  }

  /**
   * Pause agent
   */
  @Post(':agentId/pause')
  @ApiOperation({ summary: 'Pause a running agent' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'agentId', description: 'Agent ID', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Agent paused successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @ApiResponse({ status: 409, description: 'Agent not in a valid state to pause' })
  async pauseAgent(
    @Param('workspaceId') workspaceId: string,
    @Param('agentId') agentId: string,
    @Req() req: any,
  ) {
    return this.agentsService.pauseAgent(agentId, workspaceId, req.user.sub);
  }

  /**
   * Resume agent
   */
  @Post(':agentId/resume')
  @ApiOperation({ summary: 'Resume a paused agent' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'agentId', description: 'Agent ID', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Agent resumed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @ApiResponse({ status: 409, description: 'Agent not in a valid state to resume' })
  async resumeAgent(
    @Param('workspaceId') workspaceId: string,
    @Param('agentId') agentId: string,
    @Req() req: any,
  ) {
    return this.agentsService.resumeAgent(agentId, workspaceId, req.user.sub);
  }

  /**
   * Execute a task on an agent
   * Story 5.3: Dev Agent Implementation
   */
  @Post(':agentId/execute')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Execute a task on an agent' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'agentId', description: 'Agent ID', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 202, description: 'Task queued for execution' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @ApiResponse({ status: 409, description: 'Agent not in a valid state for execution' })
  async executeTask(
    @Param('workspaceId') workspaceId: string,
    @Param('agentId') agentId: string,
    @Req() req: any,
    @Body() body: ExecuteTaskDto,
  ) {
    // Validate agent exists (getAgent throws NotFoundException if not found)
    const agent = await this.agentsService.getAgent(agentId, workspaceId);

    // Agent must be in a valid state for execution
    const validStates = [AgentStatus.RUNNING, AgentStatus.INITIALIZING];
    if (!validStates.includes(agent.status)) {
      throw new ConflictException(
        `Agent is not in a valid state for execution (current: ${agent.status}). Must be 'running' or 'initializing'.`,
      );
    }

    // Create execute-task job in queue
    const job = await this.agentQueueService.addJob({
      workspaceId,
      userId: req.user.sub,
      jobType: AgentJobType.EXECUTE_TASK,
      data: {
        agentId: agent.id,
        agentType: agent.type,
        workspaceId,
        taskData: {
          type: body.type,
          storyId: body.storyId,
          description: body.description,
          files: body.files,
          requirements: body.requirements,
        },
      },
    });

    return {
      jobId: job.id,
      agentId: agent.id,
      taskType: body.type,
      status: 'queued',
      message: 'Task queued for execution',
    };
  }

  /**
   * Terminate agent
   */
  @Post(':agentId/terminate')
  @ApiOperation({ summary: 'Terminate an agent' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'agentId', description: 'Agent ID', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Agent terminated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async terminateAgent(
    @Param('workspaceId') workspaceId: string,
    @Param('agentId') agentId: string,
    @Req() req: any,
  ) {
    return this.agentsService.terminateAgent(agentId, workspaceId, req.user.sub);
  }

  /**
   * Get recovery status for a specific agent
   * Story 5.10: Agent Failure Detection & Recovery
   */
  @Get(':agentId/recovery-status')
  @ApiOperation({ summary: 'Get recovery status for a specific agent' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'agentId', description: 'Agent ID', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Recovery status returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async getRecoveryStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('agentId') agentId: string,
  ) {
    // Validate agent exists and belongs to workspace (throws NotFoundException if not)
    await this.agentsService.getAgent(agentId, workspaceId);
    return this.failureRecoveryService.getRecoveryStatus(agentId);
  }

  /**
   * Manually trigger recovery for a specific agent
   * Story 5.10: Agent Failure Detection & Recovery
   */
  @Post(':agentId/recover')
  @ApiOperation({ summary: 'Manually trigger recovery for a failed agent' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'agentId', description: 'Agent ID', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Recovery triggered' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async recoverAgent(
    @Param('workspaceId') workspaceId: string,
    @Param('agentId') agentId: string,
  ) {
    // Validate agent exists and belongs to workspace (throws NotFoundException if not)
    await this.agentsService.getAgent(agentId, workspaceId);
    const recovered = await this.failureRecoveryService.recoverAgent(agentId, workspaceId);
    return { recovered };
  }
}
