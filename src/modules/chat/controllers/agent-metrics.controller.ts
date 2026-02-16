/**
 * AgentMetricsController
 * Story 9.8: Agent Response Time Optimization
 *
 * REST API endpoints for performance metrics and alerts.
 */

import {
  Controller,
  Get,
  Query,
  UseGuards,
  Logger,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ChatMetricsService } from '../services/chat-metrics.service';
import {
  MetricsSummary,
  TimeSeriesData,
  AlertStatus,
  HistoryQuery,
} from '../interfaces/metrics.interfaces';

@ApiTags('Agent Metrics')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/metrics/agent-performance')
@UseGuards(JwtAuthGuard)
export class AgentMetricsController {
  private readonly logger = new Logger(AgentMetricsController.name);

  constructor(private readonly metricsService: ChatMetricsService) {}

  /**
   * Get current performance metrics summary
   */
  @Get()
  @ApiOperation({ summary: 'Get current agent performance metrics' })
  @ApiResponse({
    status: 200,
    description: 'Current metrics summary',
  })
  async getMetrics(): Promise<MetricsSummary> {
    this.logger.debug('Fetching current metrics');
    return this.metricsService.getMetrics();
  }

  /**
   * Get historical metrics for time range
   */
  @Get('history')
  @ApiOperation({ summary: 'Get historical performance metrics' })
  @ApiQuery({ name: 'startTime', required: false, type: String })
  @ApiQuery({ name: 'endTime', required: false, type: String })
  @ApiQuery({ name: 'metric', required: false, type: String })
  @ApiQuery({ name: 'resolution', required: false, enum: ['minute', 'hour', 'day'] })
  @ApiResponse({
    status: 200,
    description: 'Historical metrics data',
  })
  async getHistoricalMetrics(
    @Query('startTime') startTimeStr?: string,
    @Query('endTime') endTimeStr?: string,
    @Query('metric') metric?: string,
    @Query('resolution') resolution?: 'minute' | 'hour' | 'day',
  ): Promise<TimeSeriesData[]> {
    // Default to last hour if no time range provided
    const endTime = endTimeStr ? new Date(endTimeStr) : new Date();
    const startTime = startTimeStr
      ? new Date(startTimeStr)
      : new Date(endTime.getTime() - 3600000); // 1 hour ago

    this.logger.debug(
      `Fetching historical metrics from ${startTime} to ${endTime}`,
    );

    return this.metricsService.getHistoricalMetrics(startTime, endTime);
  }

  /**
   * Get current alert status
   */
  @Get('alerts')
  @ApiOperation({ summary: 'Get current alert status' })
  @ApiResponse({
    status: 200,
    description: 'List of current alerts',
  })
  async getAlertStatus(): Promise<AlertStatus[]> {
    this.logger.debug('Fetching alert status');
    return this.metricsService.getAlertStatus();
  }

  /**
   * Get response time percentiles
   */
  @Get('response-time')
  @ApiOperation({ summary: 'Get response time percentiles' })
  @ApiResponse({
    status: 200,
    description: 'Response time percentile data',
  })
  async getResponseTimeMetrics(): Promise<{
    p50: number;
    p90: number;
    p99: number;
    avg: number;
    samples: number;
  }> {
    const metrics = await this.metricsService.getMetrics();
    return {
      ...metrics.responseTime,
      samples: metrics.throughput.totalRequests,
    };
  }

  /**
   * Get cache statistics
   */
  @Get('cache')
  @ApiOperation({ summary: 'Get cache hit/miss statistics' })
  @ApiResponse({
    status: 200,
    description: 'Cache statistics',
  })
  async getCacheMetrics(): Promise<{
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    hitRatePercent: string;
  }> {
    const metrics = await this.metricsService.getMetrics();
    return {
      ...metrics.cache,
      hitRatePercent: `${(metrics.cache.hitRate * 100).toFixed(1)}%`,
    };
  }

  /**
   * Get queue statistics
   */
  @Get('queue')
  @ApiOperation({ summary: 'Get queue depth and processing statistics' })
  @ApiResponse({
    status: 200,
    description: 'Queue statistics',
  })
  async getQueueMetrics(): Promise<{
    currentDepth: number;
    avgWaitTime: number;
    processingRate: number;
    estimatedWaitMs: number;
  }> {
    const metrics = await this.metricsService.getMetrics();
    const estimatedWaitMs =
      metrics.queue.processingRate > 0
        ? (metrics.queue.currentDepth / metrics.queue.processingRate) * 1000
        : 0;

    return {
      ...metrics.queue,
      estimatedWaitMs,
    };
  }

  /**
   * Get throughput statistics
   */
  @Get('throughput')
  @ApiOperation({ summary: 'Get request throughput statistics' })
  @ApiResponse({
    status: 200,
    description: 'Throughput statistics',
  })
  async getThroughputMetrics(): Promise<{
    requestsPerSecond: number;
    requestsPerMinute: number;
    totalRequests: number;
  }> {
    const metrics = await this.metricsService.getMetrics();
    return {
      ...metrics.throughput,
      requestsPerMinute: metrics.throughput.requestsPerSecond * 60,
    };
  }
}
