/**
 * MemoryController
 * Story 12.1: Graphiti/Neo4j Setup
 * Story 12.2: Memory Ingestion Pipeline
 * Story 12.3: Memory Query Service
 * Story 12.6: Cross-Project Learning
 *
 * REST API endpoints for the memory subsystem.
 * Provides health check, manual ingestion trigger, ingestion stats,
 * memory query, relevance feedback, and cross-project pattern management.
 */
import {
  Controller,
  Get,
  Post,
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

@ApiTags('Memory')
@Controller('api/v1/memory')
export class MemoryController {
  constructor(
    private readonly memoryHealthService: MemoryHealthService,
    private readonly memoryIngestionService: MemoryIngestionService,
    private readonly memoryQueryService: MemoryQueryService,
    private readonly crossProjectLearningService: CrossProjectLearningService,
  ) {}

  @Get('health')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
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
  @ApiBearerAuth()
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
  @ApiBearerAuth()
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
  @ApiBearerAuth()
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
  @ApiBearerAuth()
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

  // ─── Cross-Project Learning Endpoints (Story 12.6) ─────────────────────────

  @Get('patterns/:workspaceId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
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
  @ApiBearerAuth()
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
  @ApiBearerAuth()
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
  @ApiBearerAuth()
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
  @ApiBearerAuth()
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
  @ApiBearerAuth()
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
