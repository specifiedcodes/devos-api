/**
 * MemoryController
 * Story 12.1: Graphiti/Neo4j Setup
 * Story 12.2: Memory Ingestion Pipeline
 *
 * REST API endpoints for the memory subsystem.
 * Provides health check, manual ingestion trigger, and ingestion stats.
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
import {
  MemoryHealth,
  IngestionResult,
  IngestionStats,
} from './interfaces/memory.interfaces';
import {
  IngestMemoryDto,
  IngestionStatsQueryDto,
} from './dto/ingestion.dto';

@ApiTags('Memory')
@Controller('api/v1/memory')
export class MemoryController {
  constructor(
    private readonly memoryHealthService: MemoryHealthService,
    private readonly memoryIngestionService: MemoryIngestionService,
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
}
