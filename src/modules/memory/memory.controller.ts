/**
 * MemoryController
 * Story 12.1: Graphiti/Neo4j Setup
 * Story 12.2: Memory Ingestion Pipeline
 * Story 12.3: Memory Query Service
 * Story 12.6: Cross-Project Learning
 * Story 12.7: Memory Summarization (Cheap Models)
 * Story 12.8: Context Budget System
 * Story 12.9: Memory Lifecycle Management
 *
 * REST API endpoints for the memory subsystem.
 * Provides health check, manual ingestion trigger, ingestion stats,
 * memory query, relevance feedback, cross-project pattern management,
 * memory summarization management, context budget information,
 * and memory lifecycle management (pruning, consolidation, archival,
 * cap enforcement, policy management, pin/unpin/delete).
 */
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MemoryHealthService } from './services/memory-health.service';
import { MemoryIngestionService } from './services/memory-ingestion.service';
import { MemoryQueryService } from './services/memory-query.service';
import { CrossProjectLearningService } from './services/cross-project-learning.service';
import { MemorySummarizationService } from './services/memory-summarization.service';
import { ContextBudgetService } from './services/context-budget.service';
import { MemoryLifecycleService } from './services/memory-lifecycle.service';
import {
  MemoryHealth,
  IngestionResult,
  IngestionStats,
  MemoryQueryResult,
  MemoryEpisodeType,
  WorkspacePattern,
  PatternDetectionResult,
  PatternRecommendation,
  PatternAdoptionStats,
  PatternType,
  PatternConfidence,
  PatternStatus,
  MemorySummary,
  SummarizationResult,
  SummarizationStats,
  ContextBudget,
  MemoryLifecyclePolicy,
  LifecycleResult,
  LifecycleReport,
} from './interfaces/memory.interfaces';
import {
  IngestMemoryDto,
  IngestionStatsQueryDto,
} from './dto/ingestion.dto';
import {
  MemoryQueryDto,
  MemoryFeedbackDto,
} from './dto/query.dto';
import {
  PatternDetectDto,
  PatternOverrideDto,
  PatternQueryDto,
  PatternRecommendationQueryDto,
} from './dto/pattern.dto';
import {
  SummarizeDto,
  SummaryQueryDto,
  SummarizationStatsQueryDto,
} from './dto/summarization.dto';
import { ContextBudgetQueryDto } from './dto/context-budget.dto';
import {
  LifecycleRunDto,
  LifecyclePolicyQueryDto,
  LifecyclePolicyUpdateDto,
  LifecycleReportQueryDto,
} from './dto/lifecycle.dto';

@ApiTags('Memory')
@Controller('api/v1/memory')
export class MemoryController {
  constructor(
    private readonly memoryHealthService: MemoryHealthService,
    private readonly memoryIngestionService: MemoryIngestionService,
    private readonly memoryQueryService: MemoryQueryService,
    private readonly crossProjectLearningService: CrossProjectLearningService,
    private readonly memorySummarizationService: MemorySummarizationService,
    private readonly contextBudgetService: ContextBudgetService,
    private readonly memoryLifecycleService: MemoryLifecycleService,
  ) {}

  @Get('health')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get memory subsystem health status' })
  @ApiResponse({
    status: 200,
    description: 'Memory health status returned successfully',
  })
  async getHealth(): Promise<MemoryHealth> {
    return this.memoryHealthService.getHealth();
  }

  @Post('ingest')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Manually trigger memory ingestion for a completed task' })
  @ApiBody({ type: IngestMemoryDto })
  @ApiResponse({
    status: 201,
    description: 'Memory ingestion completed successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async ingest(@Body() body: IngestMemoryDto): Promise<IngestionResult> {
    return this.memoryIngestionService.ingest({
      projectId: body.projectId,
      workspaceId: body.workspaceId,
      storyId: body.storyId ?? null,
      agentType: body.agentType,
      sessionId: body.sessionId,
      branch: body.branch ?? null,
      commitHash: body.commitHash ?? null,
      exitCode: body.exitCode ?? null,
      durationMs: body.durationMs,
      outputSummary: body.outputSummary ?? null,
      filesChanged: body.filesChanged ?? [],
      commitMessages: body.commitMessages ?? [],
      testResults: body.testResults ?? null,
      prUrl: body.prUrl ?? null,
      deploymentUrl: body.deploymentUrl ?? null,
      errorMessage: body.errorMessage ?? null,
      pipelineMetadata: body.pipelineMetadata ?? {},
    });
  }

  @Get('ingestion-stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get memory ingestion statistics for a project' })
  @ApiQuery({ name: 'projectId', required: true, type: String })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiQuery({ name: 'since', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Ingestion statistics returned successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async getIngestionStats(
    @Query() query: IngestionStatsQueryDto,
  ): Promise<IngestionStats> {
    const since = query.since ? new Date(query.since) : undefined;
    return this.memoryIngestionService.getIngestionStats(
      query.projectId,
      query.workspaceId,
      since,
    );
  }

  @Post('query')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Query memories with filters and semantic relevance' })
  @ApiBody({ type: MemoryQueryDto })
  @ApiResponse({
    status: 200,
    description: 'Memory query results returned successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async queryMemories(@Body() body: MemoryQueryDto): Promise<MemoryQueryResult> {
    return this.memoryQueryService.query({
      projectId: body.projectId,
      workspaceId: body.workspaceId,
      query: body.query,
      filters: body.filters
        ? {
            types: body.filters.types as MemoryEpisodeType[] | undefined,
            entityIds: body.filters.entityIds,
            since: body.filters.since ? new Date(body.filters.since) : undefined,
            maxResults: body.filters.maxResults,
          }
        : undefined,
    });
  }

  @Post('feedback')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Record relevance feedback on a memory episode' })
  @ApiBody({ type: MemoryFeedbackDto })
  @ApiResponse({
    status: 200,
    description: 'Feedback recorded successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async recordFeedback(
    @Body() body: MemoryFeedbackDto,
  ): Promise<{ updated: boolean }> {
    const updated = await this.memoryQueryService.recordRelevanceFeedback(
      body.episodeId,
      body.wasUseful,
    );
    return { updated };
  }

  // ─── Memory Summarization Endpoints (Story 12.7) ───────────────────────────

  @Post('summarize')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Manually trigger memory summarization for a project' })
  @ApiBody({ type: SummarizeDto })
  @ApiResponse({
    status: 200,
    description: 'Summarization completed successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async summarize(@Body() body: SummarizeDto): Promise<SummarizationResult> {
    return this.memorySummarizationService.summarizeProject(
      body.projectId,
      body.workspaceId,
    );
  }

  @Get('summaries')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get memory summaries for a project' })
  @ApiQuery({ name: 'projectId', required: true, type: String })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'Summaries returned successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async getSummaries(
    @Query() query: SummaryQueryDto,
  ): Promise<MemorySummary[]> {
    return this.memorySummarizationService.getProjectSummaries(
      query.projectId,
      query.workspaceId,
    );
  }

  @Get('summarization-stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get memory summarization statistics for a project' })
  @ApiQuery({ name: 'projectId', required: true, type: String })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'Summarization statistics returned successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async getSummarizationStats(
    @Query() query: SummarizationStatsQueryDto,
  ): Promise<SummarizationStats> {
    return this.memorySummarizationService.getSummarizationStats(
      query.projectId,
      query.workspaceId,
    );
  }

  // ─── Context Budget Endpoint (Story 12.8) ───────────────────────────────────

  @Get('context-budget')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get context budget for a model' })
  @ApiQuery({ name: 'modelId', required: true, type: String, description: 'Model identifier (e.g., claude-3-5-sonnet, gpt-4)' })
  @ApiResponse({
    status: 200,
    description: 'Context budget returned successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async getContextBudget(
    @Query() query: ContextBudgetQueryDto,
  ): Promise<ContextBudget> {
    return this.contextBudgetService.calculateBudget(query.modelId);
  }

  // ─── Memory Lifecycle Endpoints (Story 12.9) ──────────────────────────────

  @Post('lifecycle/run')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Manually trigger memory lifecycle for a workspace' })
  @ApiBody({ type: LifecycleRunDto })
  @ApiResponse({
    status: 200,
    description: 'Lifecycle run completed successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async runLifecycle(@Body() body: LifecycleRunDto): Promise<LifecycleResult> {
    return this.memoryLifecycleService.runLifecycle(body.workspaceId);
  }

  @Get('lifecycle/policy')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get lifecycle policy for a workspace' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'Lifecycle policy returned successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async getLifecyclePolicy(
    @Query() query: LifecyclePolicyQueryDto,
  ): Promise<MemoryLifecyclePolicy> {
    return this.memoryLifecycleService.getLifecyclePolicy(query.workspaceId);
  }

  @Put('lifecycle/policy')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update lifecycle policy for a workspace' })
  @ApiBody({ type: LifecyclePolicyUpdateDto })
  @ApiResponse({
    status: 200,
    description: 'Lifecycle policy updated successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async updateLifecyclePolicy(
    @Body() body: LifecyclePolicyUpdateDto,
  ): Promise<MemoryLifecyclePolicy> {
    const { workspaceId, ...updates } = body;
    return this.memoryLifecycleService.updateLifecyclePolicy(workspaceId, updates);
  }

  @Get('lifecycle/report')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get lifecycle metrics report for a workspace' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'Lifecycle report returned successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async getLifecycleReport(
    @Query() query: LifecycleReportQueryDto,
  ): Promise<LifecycleReport> {
    return this.memoryLifecycleService.getLifecycleReport(query.workspaceId);
  }

  @Post('episodes/:episodeId/pin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Pin a memory to protect from lifecycle operations' })
  @ApiParam({ name: 'episodeId', description: 'Episode ID to pin', type: String })
  @ApiResponse({
    status: 200,
    description: 'Memory pinned successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async pinMemory(
    @Param('episodeId') episodeId: string,
  ): Promise<{ pinned: boolean }> {
    const pinned = await this.memoryLifecycleService.pinMemory(episodeId);
    return { pinned };
  }

  @Post('episodes/:episodeId/unpin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Unpin a memory to allow lifecycle operations' })
  @ApiParam({ name: 'episodeId', description: 'Episode ID to unpin', type: String })
  @ApiResponse({
    status: 200,
    description: 'Memory unpinned successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async unpinMemory(
    @Param('episodeId') episodeId: string,
  ): Promise<{ unpinned: boolean }> {
    const unpinned = await this.memoryLifecycleService.unpinMemory(episodeId);
    return { unpinned };
  }

  @Delete('episodes/:episodeId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Permanently delete a specific memory' })
  @ApiParam({ name: 'episodeId', description: 'Episode ID to delete', type: String })
  @ApiResponse({
    status: 200,
    description: 'Memory deleted successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async deleteMemory(
    @Param('episodeId') episodeId: string,
  ): Promise<{ deleted: boolean }> {
    const deleted = await this.memoryLifecycleService.deleteMemory(episodeId);
    return { deleted };
  }

  // ─── Cross-Project Learning Endpoints (Story 12.6) ─────────────────────────

  @Get('patterns/:workspaceId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Retrieve workspace patterns for cross-project learning' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', type: String })
  @ApiQuery({ name: 'type', required: false, enum: ['architecture', 'error', 'testing', 'deployment', 'security'] })
  @ApiQuery({ name: 'confidence', required: false, enum: ['low', 'medium', 'high'] })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'overridden', 'archived'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Workspace patterns returned successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async getWorkspacePatterns(
    @Param('workspaceId') workspaceId: string,
    @Query() query: PatternQueryDto,
  ): Promise<WorkspacePattern[]> {
    return this.crossProjectLearningService.getWorkspacePatterns(workspaceId, {
      patternType: query.type as PatternType | undefined,
      confidence: query.confidence as PatternConfidence | undefined,
      status: query.status as PatternStatus | undefined,
      limit: query.limit,
    });
  }

  @Post('patterns/detect')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Trigger cross-project pattern detection for a workspace' })
  @ApiBody({ type: PatternDetectDto })
  @ApiResponse({
    status: 200,
    description: 'Pattern detection completed successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async detectPatterns(
    @Body() body: PatternDetectDto,
  ): Promise<PatternDetectionResult> {
    return this.crossProjectLearningService.detectPatterns(body.workspaceId);
  }

  @Post('patterns/:patternId/override')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Override a workspace pattern' })
  @ApiParam({ name: 'patternId', description: 'Pattern ID to override', type: String })
  @ApiBody({ type: PatternOverrideDto })
  @ApiResponse({
    status: 200,
    description: 'Pattern overridden successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  @ApiResponse({
    status: 404,
    description: 'Pattern not found',
  })
  async overridePattern(
    @Param('patternId') patternId: string,
    @Body() body: PatternOverrideDto,
  ): Promise<WorkspacePattern> {
    return this.crossProjectLearningService.overridePattern(
      patternId,
      body.userId,
      body.reason,
    );
  }

  @Post('patterns/:patternId/restore')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Restore an overridden workspace pattern' })
  @ApiParam({ name: 'patternId', description: 'Pattern ID to restore', type: String })
  @ApiResponse({
    status: 200,
    description: 'Pattern restored successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  @ApiResponse({
    status: 404,
    description: 'Pattern not found',
  })
  async restorePattern(
    @Param('patternId') patternId: string,
  ): Promise<WorkspacePattern> {
    return this.crossProjectLearningService.restorePattern(patternId);
  }

  @Get('patterns/:workspaceId/recommendations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get pattern recommendations for a task' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', type: String })
  @ApiQuery({ name: 'projectId', required: true, type: String })
  @ApiQuery({ name: 'task', required: true, type: String })
  @ApiResponse({
    status: 200,
    description: 'Pattern recommendations returned successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async getPatternRecommendations(
    @Param('workspaceId') workspaceId: string,
    @Query() query: PatternRecommendationQueryDto,
  ): Promise<PatternRecommendation[]> {
    return this.crossProjectLearningService.getPatternRecommendations(
      workspaceId,
      query.projectId,
      query.task,
    );
  }

  @Get('patterns/:workspaceId/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get pattern adoption statistics for a workspace' })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID', type: String })
  @ApiResponse({
    status: 200,
    description: 'Pattern adoption statistics returned successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT required',
  })
  async getPatternAdoptionStats(
    @Param('workspaceId') workspaceId: string,
  ): Promise<PatternAdoptionStats> {
    return this.crossProjectLearningService.getPatternAdoptionStats(workspaceId);
  }
}
