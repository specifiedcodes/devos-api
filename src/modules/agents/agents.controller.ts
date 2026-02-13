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
  async getHealth(
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.failureRecoveryService.healthCheck(workspaceId);
  }

  /**
   * Create a new agent
   */
  @Post()
  async createAgent(
    @Param('workspaceId') workspaceId: string,
    @Req() req: any,
    @Body() body: CreateAgentDto,
  ) {
    const agent = await this.agentsService.createAgent({
      ...body,
      workspaceId,
      createdBy: req.user.sub,
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
