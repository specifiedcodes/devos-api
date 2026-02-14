/**
 * OrchestratorController
 * Story 11.1: Orchestrator State Machine Core
 *
 * REST API endpoints for controlling the autonomous pipeline state machine.
 * All endpoints are workspace-scoped and protected by JWT + workspace access guards.
 */
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../shared/guards/workspace-access.guard';
import { PipelineStateMachineService } from './services/pipeline-state-machine.service';
import { StartPipelineDto } from './dto/start-pipeline.dto';
import { PipelineHistoryQueryDto } from './dto/pipeline-history-query.dto';

@Controller('api/v1/workspaces/:workspaceId/orchestrator')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class OrchestratorController {
  constructor(
    private readonly pipelineStateMachine: PipelineStateMachineService,
  ) {}

  /**
   * Start a new pipeline for a project.
   * POST /api/v1/workspaces/:workspaceId/orchestrator/start
   *
   * @returns 201 Created with workflowId and initial state
   * @throws 409 Conflict if pipeline already active for project
   */
  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  async startPipeline(
    @Param('workspaceId') workspaceId: string,
    @Body() body: StartPipelineDto,
    @Req() req: any,
  ) {
    const userId = req.user.sub || req.user.userId || req.user.id;

    return this.pipelineStateMachine.startPipeline(
      body.projectId,
      workspaceId,
      {
        triggeredBy: `user:${userId}`,
        storyId: body.storyId,
        config: body.config,
      },
    );
  }

  /**
   * Get current pipeline state for a project.
   * GET /api/v1/workspaces/:workspaceId/orchestrator/:projectId/state
   *
   * @returns 200 OK with PipelineContext
   * @throws 404 Not Found if no active pipeline or workspace mismatch
   */
  @Get(':projectId/state')
  async getState(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    const state = await this.pipelineStateMachine.getState(projectId);

    if (!state || state.workspaceId !== workspaceId) {
      throw new NotFoundException(
        `No active pipeline found for project ${projectId}`,
      );
    }

    return state;
  }

  /**
   * Pause an active pipeline.
   * POST /api/v1/workspaces/:workspaceId/orchestrator/:projectId/pause
   *
   * @returns 200 OK with previous and new state
   * @throws 404 Not Found if no active pipeline
   * @throws 409 Conflict if already paused
   */
  @Post(':projectId/pause')
  @HttpCode(HttpStatus.OK)
  async pausePipeline(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Req() req: any,
  ) {
    const userId = req.user.sub || req.user.userId || req.user.id;

    return this.pipelineStateMachine.pausePipeline(
      projectId,
      `user:${userId}`,
    );
  }

  /**
   * Resume a paused pipeline.
   * POST /api/v1/workspaces/:workspaceId/orchestrator/:projectId/resume
   *
   * @returns 200 OK with previous and new state
   * @throws 409 Conflict if not currently paused
   */
  @Post(':projectId/resume')
  @HttpCode(HttpStatus.OK)
  async resumePipeline(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Req() req: any,
  ) {
    const userId = req.user.sub || req.user.userId || req.user.id;

    return this.pipelineStateMachine.resumePipeline(
      projectId,
      `user:${userId}`,
    );
  }

  /**
   * Get state transition history for a project.
   * GET /api/v1/workspaces/:workspaceId/orchestrator/:projectId/history
   *
   * @returns 200 OK with paginated history items
   */
  @Get(':projectId/history')
  async getHistory(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Query() query: PipelineHistoryQueryDto,
  ) {
    return this.pipelineStateMachine.getHistory(projectId, workspaceId, {
      limit: query.limit,
      offset: query.offset,
    });
  }
}
