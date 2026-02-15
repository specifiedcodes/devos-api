/**
 * MemoryController
 * Story 12.1: Graphiti/Neo4j Setup
 * Story 12.2: Memory Ingestion Pipeline
 * Story 12.3: Memory Query Service
 *
 * REST API endpoints for the memory subsystem.
 * Provides health check, manual ingestion trigger, ingestion stats,
 * memory query, and relevance feedback.
 */
import {
  Controller,
  Get,
  Post,
  Body,
  Query,
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
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MemoryHealthService } from './services/memory-health.service';
import { MemoryIngestionService } from './services/memory-ingestion.service';
import { MemoryQueryService } from './services/memory-query.service';
import {
  MemoryHealth,
  IngestionResult,
  IngestionStats,
  MemoryQueryResult,
  MemoryEpisodeType,
} from './interfaces/memory.interfaces';
import {
  IngestMemoryDto,
  IngestionStatsQueryDto,
} from './dto/ingestion.dto';
import {
  MemoryQueryDto,
  MemoryFeedbackDto,
} from './dto/query.dto';

@ApiTags('Memory')
@Controller('api/v1/memory')
export class MemoryController {
  constructor(
    private readonly memoryHealthService: MemoryHealthService,
    private readonly memoryIngestionService: MemoryIngestionService,
    private readonly memoryQueryService: MemoryQueryService,
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
}
