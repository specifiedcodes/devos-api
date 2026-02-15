/**
 * BenchmarkController
 *
 * Story 13-8: Model Performance Benchmarks
 *
 * REST API endpoints for recording model performance and querying benchmarks.
 */
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { BenchmarkService } from '../services/benchmark.service';
import { RecordPerformanceDto } from '../dto/record-performance.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';

@Controller()
export class BenchmarkController {
  constructor(private readonly benchmarkService: BenchmarkService) {}

  /**
   * Record a new performance metric.
   * POST /api/v1/workspaces/:workspaceId/benchmarks/record
   */
  @Post('api/v1/workspaces/:workspaceId/benchmarks/record')
  @UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async recordPerformance(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: RecordPerformanceDto,
  ) {
    return this.benchmarkService.recordPerformance(workspaceId, dto);
  }

  /**
   * Get benchmark for a specific model + task type.
   * GET /api/v1/benchmarks/models/:model/tasks/:taskType
   */
  @Get('api/v1/benchmarks/models/:model/tasks/:taskType')
  @UseGuards(JwtAuthGuard)
  async getModelBenchmark(
    @Param('model') model: string,
    @Param('taskType') taskType: string,
    @Query('windowDays') windowDays?: string,
  ) {
    const days = this.parseWindowDays(windowDays);
    const benchmark = await this.benchmarkService.getModelBenchmark(
      model,
      taskType,
      days,
    );

    if (!benchmark) {
      throw new NotFoundException(
        `No benchmark data for model=${model} taskType=${taskType}`,
      );
    }

    return benchmark;
  }

  /**
   * Get the full model x task type benchmark matrix.
   * GET /api/v1/benchmarks/matrix
   */
  @Get('api/v1/benchmarks/matrix')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getMatrix(@Query('windowDays') windowDays?: string) {
    const days = this.parseWindowDays(windowDays);
    return this.benchmarkService.getModelTaskMatrix(days);
  }

  /**
   * Get performance trend for a model + task type.
   * GET /api/v1/benchmarks/models/:model/tasks/:taskType/trend
   */
  @Get('api/v1/benchmarks/models/:model/tasks/:taskType/trend')
  @UseGuards(JwtAuthGuard)
  async getModelTrend(
    @Param('model') model: string,
    @Param('taskType') taskType: string,
    @Query('days') days?: string,
  ) {
    const numDays = this.parseDays(days);
    return this.benchmarkService.getModelPerformanceTrend(
      model,
      taskType,
      numDays,
    );
  }

  /**
   * Get deprioritized models (success rate below threshold).
   * GET /api/v1/benchmarks/deprioritized
   */
  @Get('api/v1/benchmarks/deprioritized')
  @UseGuards(JwtAuthGuard)
  async getDeprioritized(@Query('threshold') threshold?: string) {
    const thresholdValue = threshold ? parseFloat(threshold) : undefined;
    if (thresholdValue !== undefined && (isNaN(thresholdValue) || thresholdValue < 0 || thresholdValue > 1)) {
      throw new BadRequestException('threshold must be between 0 and 1');
    }
    return this.benchmarkService.getDeprioritizedModels(thresholdValue);
  }

  /**
   * Get promoted models (quality score above threshold).
   * GET /api/v1/benchmarks/promoted
   */
  @Get('api/v1/benchmarks/promoted')
  @UseGuards(JwtAuthGuard)
  async getPromoted(@Query('qualityThreshold') qualityThreshold?: string) {
    const thresholdValue = qualityThreshold
      ? parseFloat(qualityThreshold)
      : undefined;
    if (thresholdValue !== undefined && (isNaN(thresholdValue) || thresholdValue < 0 || thresholdValue > 1)) {
      throw new BadRequestException('qualityThreshold must be between 0 and 1');
    }
    return this.benchmarkService.getPromotedModels(thresholdValue);
  }

  /**
   * Get router feedback for a task type.
   * GET /api/v1/benchmarks/router-feedback?taskType=coding
   */
  @Get('api/v1/benchmarks/router-feedback')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getRouterFeedback(@Query('taskType') taskType?: string) {
    if (!taskType || !taskType.trim()) {
      throw new BadRequestException('taskType query parameter is required');
    }
    return this.benchmarkService.getRouterFeedback(taskType.trim());
  }

  /**
   * Parse windowDays query param with validation (default 30, max 90).
   */
  private parseWindowDays(windowDays?: string): number {
    if (!windowDays) return 30;
    const parsed = parseInt(windowDays, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 90) {
      throw new BadRequestException('windowDays must be between 1 and 90');
    }
    return parsed;
  }

  /**
   * Parse days query param with validation (default 30, max 90).
   */
  private parseDays(days?: string): number {
    if (!days) return 30;
    const parsed = parseInt(days, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 90) {
      throw new BadRequestException('days must be between 1 and 90');
    }
    return parsed;
  }
}
