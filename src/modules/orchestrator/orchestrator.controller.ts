/**
 * OrchestratorController
 * Story 11.1: Orchestrator State Machine Core
 * Story 11.9: Agent Failure Recovery & Checkpoints
 *
 * REST API endpoints for controlling the autonomous pipeline state machine.
 * All endpoints are workspace-scoped and protected by JWT + workspace access guards.
 *
 * Story 11.9 adds:
 * - POST /:projectId/failures/:failureId/override - Manual failure override
 * - GET /:projectId/recovery-status - Recovery status
 * - GET /:projectId/failures - Failure history
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
  Optional,
  Inject,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../shared/guards/workspace-access.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PipelineStateMachineService } from './services/pipeline-state-machine.service';
import { PipelineFailureRecoveryService } from './services/pipeline-failure-recovery.service';
import { StartPipelineDto } from './dto/start-pipeline.dto';
import { PipelineHistoryQueryDto } from './dto/pipeline-history-query.dto';
import { FailureRecoveryHistory } from './entities/failure-recovery-history.entity';
import {
  ManualOverrideDto,
  FailureHistoryQueryDto,
} from './interfaces/failure-recovery.interfaces';

@Controller('api/v1/workspaces/:workspaceId/orchestrator')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class OrchestratorController {
  constructor(
    private readonly pipelineStateMachine: PipelineStateMachineService,
    @Optional()
    @Inject(PipelineFailureRecoveryService)
    private readonly failureRecoveryService: PipelineFailureRecoveryService | null,
    @Optional()
    @InjectRepository(FailureRecoveryHistory)
    private readonly failureHistoryRepository: Repository<FailureRecoveryHistory> | null,
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

  // ─── Story 11.9: Failure Recovery Endpoints ─────────────────────────────────

  /**
   * Handle a manual override for an escalated failure.
   * POST /api/v1/workspaces/:workspaceId/orchestrator/:projectId/failures/:failureId/override
   *
   * @returns 200 OK with RecoveryResult
   * @throws 404 if failure not found
   */
  @Post(':projectId/failures/:failureId/override')
  @HttpCode(HttpStatus.OK)
  async handleManualOverride(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Param('failureId') failureId: string,
    @Body() body: ManualOverrideDto,
    @Req() req: any,
  ) {
    if (!this.failureRecoveryService) {
      throw new NotFoundException('Failure recovery service not available');
    }

    const userId = req.user.sub || req.user.userId || req.user.id;

    return this.failureRecoveryService.handleManualOverride({
      failureId,
      workspaceId,
      userId,
      action: body.action,
      guidance: body.guidance,
      reassignToAgentType: body.reassignToAgentType,
    });
  }

  /**
   * Get current recovery status for a pipeline.
   * GET /api/v1/workspaces/:workspaceId/orchestrator/:projectId/recovery-status
   *
   * @returns 200 OK with PipelineRecoveryStatus
   */
  @Get(':projectId/recovery-status')
  async getRecoveryStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
  ) {
    if (!this.failureRecoveryService) {
      return {
        projectId,
        activeFailures: [],
        recoveryHistory: [],
        isEscalated: false,
        totalRetries: 0,
        maxRetries: 3,
      };
    }

    return this.failureRecoveryService.getRecoveryStatus(projectId);
  }

  /**
   * Get failure history for a pipeline with pagination.
   * GET /api/v1/workspaces/:workspaceId/orchestrator/:projectId/failures
   *
   * @returns 200 OK with { items, total }
   */
  @Get(':projectId/failures')
  async getFailureHistory(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Query() query: FailureHistoryQueryDto,
  ) {
    if (!this.failureHistoryRepository) {
      return { items: [], total: 0 };
    }

    const limit = Math.min(query.limit || 20, 100);
    const offset = query.offset || 0;

    const [items, total] = await this.failureHistoryRepository.findAndCount({
      where: { projectId, workspaceId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { items, total };
  }
}
