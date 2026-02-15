/**
 * BenchmarkService
 *
 * Story 13-8: Model Performance Benchmarks
 *
 * Core service for recording per-request model performance,
 * aggregating rolling benchmarks, and providing router feedback.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ModelPerformance } from '../../../database/entities/model-performance.entity';
import { RedisService } from '../../redis/redis.service';
import { RecordPerformanceDto } from '../dto/record-performance.dto';

/** Aggregated benchmark for a specific model + task type */
export interface ModelBenchmark {
  model: string;
  provider: string;
  taskType: string;
  successRate: number;
  avgQualityScore: number;
  avgLatencyMs: number;
  costPerSuccess: number;
  retryRate: number;
  totalRequests: number;
  windowDays: number;
}

/** Full model x task type matrix */
export interface ModelTaskMatrix {
  models: string[];
  taskTypes: string[];
  cells: Record<string, Record<string, ModelBenchmark | null>>;
}

/** Daily performance data points for trend analysis */
export interface ModelPerformanceTrend {
  model: string;
  taskType: string;
  dataPoints: Array<{
    date: string;
    successRate: number;
    avgLatencyMs: number;
    requests: number;
    avgQualityScore: number;
  }>;
}

/** Router feedback response for model selection */
export interface RouterFeedbackResponse {
  taskType: string;
  deprioritized: string[];
  promoted: string[];
  rankings: Array<{
    model: string;
    provider: string;
    compositeScore: number;
    successRate: number;
    avgQualityScore: number;
    avgLatencyMs: number;
    costPerSuccess: number;
  }>;
}

/** Minimum number of requests required for statistical significance */
const MIN_REQUESTS_THRESHOLD = 10;

/** Default rolling window in days */
const DEFAULT_WINDOW_DAYS = 30;

/** Redis cache TTL in seconds (5 minutes) */
const CACHE_TTL = 300;

@Injectable()
export class BenchmarkService {
  private readonly logger = new Logger(BenchmarkService.name);

  constructor(
    @InjectRepository(ModelPerformance)
    private readonly performanceRepository: Repository<ModelPerformance>,
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Record a new performance metric.
   * Invalidates cached benchmarks for the affected model+taskType.
   */
  async recordPerformance(
    workspaceId: string,
    dto: RecordPerformanceDto,
  ): Promise<ModelPerformance> {
    const record = this.performanceRepository.create({
      requestId: dto.requestId,
      workspaceId,
      model: dto.model,
      provider: dto.provider,
      taskType: dto.taskType,
      success: dto.success,
      qualityScore: dto.qualityScore ?? null,
      latencyMs: dto.latencyMs,
      inputTokens: dto.inputTokens,
      outputTokens: dto.outputTokens,
      cost: dto.cost,
      contextSize: dto.contextSize ?? 0,
      retryCount: dto.retryCount ?? 0,
      errorType: dto.errorType ?? null,
    });

    const saved = await this.performanceRepository.save(record);

    // Invalidate caches
    try {
      // Invalidate known cache keys
      await this.redisService.del(
        `benchmark:model|${dto.model}|task|${dto.taskType}`,
        'benchmark:matrix',
        `benchmark:router-feedback|${dto.taskType}`,
      );
      // Invalidate trend caches for this model+taskType (keyed by days param)
      const trendKeys = await this.redisService.scanKeys(
        `benchmark:trend|${dto.model}|${dto.taskType}|*`,
      );
      if (trendKeys.length > 0) {
        await this.redisService.del(...trendKeys);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate benchmark cache: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Emit event for other listeners
    this.eventEmitter.emit('benchmark:recorded', {
      model: dto.model,
      taskType: dto.taskType,
      workspaceId,
    });

    return saved;
  }

  /**
   * Get aggregated benchmark for a specific model + task type over a rolling window.
   */
  async getModelBenchmark(
    model: string,
    taskType: string,
    windowDays: number = DEFAULT_WINDOW_DAYS,
  ): Promise<ModelBenchmark | null> {
    // Check Redis cache
    const cacheKey = `benchmark:model|${model}|task|${taskType}`;
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as ModelBenchmark;
      }
    } catch {
      // Cache miss or error, continue to DB query
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - windowDays);

    const result = await this.performanceRepository
      .createQueryBuilder('perf')
      .select('perf.model', 'model')
      .addSelect('perf.provider', 'provider')
      .addSelect('perf.task_type', 'taskType')
      .addSelect('COUNT(*)', 'totalRequests')
      .addSelect(
        "SUM(CASE WHEN perf.success THEN 1 ELSE 0 END)::DECIMAL / COUNT(*)",
        'successRate',
      )
      .addSelect(
        'AVG(CASE WHEN perf.quality_score IS NOT NULL THEN perf.quality_score END)',
        'avgQualityScore',
      )
      .addSelect('AVG(perf.latency_ms)', 'avgLatencyMs')
      .addSelect(
        `CASE
          WHEN SUM(CASE WHEN perf.success THEN 1 ELSE 0 END) > 0
          THEN SUM(perf.cost) / SUM(CASE WHEN perf.success THEN 1 ELSE 0 END)
          ELSE 0
        END`,
        'costPerSuccess',
      )
      .addSelect('AVG(perf.retry_count)', 'retryRate')
      .where('perf.model = :model', { model })
      .andWhere('perf.task_type = :taskType', { taskType })
      .andWhere('perf.created_at >= :cutoffDate', { cutoffDate })
      .groupBy('perf.model')
      .addGroupBy('perf.provider')
      .addGroupBy('perf.task_type')
      .getRawOne();

    if (!result || parseInt(result.totalRequests, 10) === 0) {
      return null;
    }

    const benchmark: ModelBenchmark = {
      model: result.model,
      provider: result.provider,
      taskType: result.taskType,
      successRate: parseFloat(result.successRate || '0'),
      avgQualityScore: parseFloat(result.avgQualityScore || '0'),
      avgLatencyMs: parseFloat(result.avgLatencyMs || '0'),
      costPerSuccess: parseFloat(result.costPerSuccess || '0'),
      retryRate: parseFloat(result.retryRate || '0'),
      totalRequests: parseInt(result.totalRequests, 10),
      windowDays,
    };

    // Cache result
    try {
      await this.redisService.set(cacheKey, JSON.stringify(benchmark), CACHE_TTL);
    } catch {
      // Caching failure is non-critical
    }

    return benchmark;
  }

  /**
   * Get the full model x task type matrix with benchmark data.
   */
  async getModelTaskMatrix(
    windowDays: number = DEFAULT_WINDOW_DAYS,
  ): Promise<ModelTaskMatrix> {
    // Check Redis cache
    const cacheKey = 'benchmark:matrix';
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as ModelTaskMatrix;
      }
    } catch {
      // Cache miss or error
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - windowDays);

    // Get all distinct model + task type combinations
    const results = await this.performanceRepository
      .createQueryBuilder('perf')
      .select('perf.model', 'model')
      .addSelect('perf.provider', 'provider')
      .addSelect('perf.task_type', 'taskType')
      .addSelect('COUNT(*)', 'totalRequests')
      .addSelect(
        "SUM(CASE WHEN perf.success THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(*), 0)",
        'successRate',
      )
      .addSelect(
        'AVG(CASE WHEN perf.quality_score IS NOT NULL THEN perf.quality_score END)',
        'avgQualityScore',
      )
      .addSelect('AVG(perf.latency_ms)', 'avgLatencyMs')
      .addSelect(
        `CASE
          WHEN SUM(CASE WHEN perf.success THEN 1 ELSE 0 END) > 0
          THEN SUM(perf.cost) / SUM(CASE WHEN perf.success THEN 1 ELSE 0 END)
          ELSE 0
        END`,
        'costPerSuccess',
      )
      .addSelect('AVG(perf.retry_count)', 'retryRate')
      .where('perf.created_at >= :cutoffDate', { cutoffDate })
      .groupBy('perf.model')
      .addGroupBy('perf.provider')
      .addGroupBy('perf.task_type')
      .getRawMany();

    const modelsSet = new Set<string>();
    const taskTypesSet = new Set<string>();
    const cells: Record<string, Record<string, ModelBenchmark | null>> = {};

    for (const row of results) {
      const model = row.model;
      const taskType = row.taskType;
      modelsSet.add(model);
      taskTypesSet.add(taskType);

      if (!cells[model]) {
        cells[model] = {};
      }

      cells[model][taskType] = {
        model,
        provider: row.provider,
        taskType,
        successRate: parseFloat(row.successRate || '0'),
        avgQualityScore: parseFloat(row.avgQualityScore || '0'),
        avgLatencyMs: parseFloat(row.avgLatencyMs || '0'),
        costPerSuccess: parseFloat(row.costPerSuccess || '0'),
        retryRate: parseFloat(row.retryRate || '0'),
        totalRequests: parseInt(row.totalRequests, 10),
        windowDays,
      };
    }

    // Fill null cells for model+taskType combinations without data
    const models = Array.from(modelsSet).sort();
    const taskTypes = Array.from(taskTypesSet).sort();

    for (const model of models) {
      if (!cells[model]) {
        cells[model] = {};
      }
      for (const taskType of taskTypes) {
        if (!cells[model][taskType]) {
          cells[model][taskType] = null;
        }
      }
    }

    const matrix: ModelTaskMatrix = { models, taskTypes, cells };

    // Cache result
    try {
      await this.redisService.set(cacheKey, JSON.stringify(matrix), CACHE_TTL);
    } catch {
      // Caching failure is non-critical
    }

    return matrix;
  }

  /**
   * Get daily performance data points for a specific model + task type.
   */
  async getModelPerformanceTrend(
    model: string,
    taskType: string,
    days: number = DEFAULT_WINDOW_DAYS,
  ): Promise<ModelPerformanceTrend> {
    // Check Redis cache
    const cacheKey = `benchmark:trend|${model}|${taskType}|${days}`;
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as ModelPerformanceTrend;
      }
    } catch {
      // Cache miss or error, continue to DB query
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const results = await this.performanceRepository
      .createQueryBuilder('perf')
      .select("DATE(perf.created_at)", 'date')
      .addSelect('COUNT(*)', 'requests')
      .addSelect(
        "SUM(CASE WHEN perf.success THEN 1 ELSE 0 END)::DECIMAL / NULLIF(COUNT(*), 0)",
        'successRate',
      )
      .addSelect('AVG(perf.latency_ms)', 'avgLatencyMs')
      .addSelect(
        'AVG(CASE WHEN perf.quality_score IS NOT NULL THEN perf.quality_score END)',
        'avgQualityScore',
      )
      .where('perf.model = :model', { model })
      .andWhere('perf.task_type = :taskType', { taskType })
      .andWhere('perf.created_at >= :cutoffDate', { cutoffDate })
      .groupBy('DATE(perf.created_at)')
      .orderBy('DATE(perf.created_at)', 'ASC')
      .getRawMany();

    const trend: ModelPerformanceTrend = {
      model,
      taskType,
      dataPoints: results.map((r) => ({
        date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date),
        successRate: parseFloat(r.successRate || '0'),
        avgLatencyMs: parseFloat(r.avgLatencyMs || '0'),
        requests: parseInt(r.requests, 10),
        avgQualityScore: parseFloat(r.avgQualityScore || '0'),
      })),
    };

    // Cache result
    try {
      await this.redisService.set(cacheKey, JSON.stringify(trend), CACHE_TTL);
    } catch {
      // Caching failure is non-critical
    }

    return trend;
  }

  /**
   * Get models with success rate below the threshold for any task type.
   * Excludes models with fewer than MIN_REQUESTS_THRESHOLD requests.
   */
  async getDeprioritizedModels(
    threshold: number = 0.80,
  ): Promise<Array<{ model: string; taskType: string; successRate: number }>> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DEFAULT_WINDOW_DAYS);

    const results = await this.performanceRepository
      .createQueryBuilder('perf')
      .select('perf.model', 'model')
      .addSelect('perf.task_type', 'taskType')
      .addSelect(
        "SUM(CASE WHEN perf.success THEN 1 ELSE 0 END)::DECIMAL / COUNT(*)",
        'successRate',
      )
      .addSelect('COUNT(*)', 'totalRequests')
      .where('perf.created_at >= :cutoffDate', { cutoffDate })
      .groupBy('perf.model')
      .addGroupBy('perf.task_type')
      .having('COUNT(*) >= :minRequests', {
        minRequests: MIN_REQUESTS_THRESHOLD,
      })
      .getRawMany();

    return results
      .filter((r) => parseFloat(r.successRate) < threshold)
      .map((r) => ({
        model: r.model,
        taskType: r.taskType,
        successRate: parseFloat(r.successRate),
      }));
  }

  /**
   * Get models with consistently high quality scores above the threshold.
   * Excludes models with fewer than MIN_REQUESTS_THRESHOLD requests.
   */
  async getPromotedModels(
    qualityThreshold: number = 0.90,
  ): Promise<
    Array<{ model: string; taskType: string; avgQualityScore: number }>
  > {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DEFAULT_WINDOW_DAYS);

    const results = await this.performanceRepository
      .createQueryBuilder('perf')
      .select('perf.model', 'model')
      .addSelect('perf.task_type', 'taskType')
      .addSelect(
        'AVG(CASE WHEN perf.quality_score IS NOT NULL THEN perf.quality_score END)',
        'avgQualityScore',
      )
      .addSelect('COUNT(*)', 'totalRequests')
      .where('perf.created_at >= :cutoffDate', { cutoffDate })
      .groupBy('perf.model')
      .addGroupBy('perf.task_type')
      .having('COUNT(*) >= :minRequests', {
        minRequests: MIN_REQUESTS_THRESHOLD,
      })
      .getRawMany();

    return results
      .filter(
        (r) =>
          r.avgQualityScore !== null &&
          parseFloat(r.avgQualityScore) > qualityThreshold,
      )
      .map((r) => ({
        model: r.model,
        taskType: r.taskType,
        avgQualityScore: parseFloat(r.avgQualityScore),
      }));
  }

  /**
   * Get router feedback for a given task type.
   * Returns deprioritized/promoted lists and composite-score rankings.
   */
  async getRouterFeedback(taskType: string): Promise<RouterFeedbackResponse> {
    // Check Redis cache
    const cacheKey = `benchmark:router-feedback|${taskType}`;
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as RouterFeedbackResponse;
      }
    } catch {
      // Cache miss or error
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DEFAULT_WINDOW_DAYS);

    const results = await this.performanceRepository
      .createQueryBuilder('perf')
      .select('perf.model', 'model')
      .addSelect('perf.provider', 'provider')
      .addSelect('COUNT(*)', 'totalRequests')
      .addSelect(
        "SUM(CASE WHEN perf.success THEN 1 ELSE 0 END)::DECIMAL / COUNT(*)",
        'successRate',
      )
      .addSelect(
        'AVG(CASE WHEN perf.quality_score IS NOT NULL THEN perf.quality_score END)',
        'avgQualityScore',
      )
      .addSelect('AVG(perf.latency_ms)', 'avgLatencyMs')
      .addSelect(
        `CASE
          WHEN SUM(CASE WHEN perf.success THEN 1 ELSE 0 END) > 0
          THEN SUM(perf.cost) / SUM(CASE WHEN perf.success THEN 1 ELSE 0 END)
          ELSE 0
        END`,
        'costPerSuccess',
      )
      .where('perf.task_type = :taskType', { taskType })
      .andWhere('perf.created_at >= :cutoffDate', { cutoffDate })
      .groupBy('perf.model')
      .addGroupBy('perf.provider')
      .having('COUNT(*) >= :minRequests', {
        minRequests: MIN_REQUESTS_THRESHOLD,
      })
      .getRawMany();

    if (results.length === 0) {
      const emptyResponse: RouterFeedbackResponse = {
        taskType,
        deprioritized: [],
        promoted: [],
        rankings: [],
      };

      try {
        await this.redisService.set(
          cacheKey,
          JSON.stringify(emptyResponse),
          CACHE_TTL,
        );
      } catch {
        // non-critical
      }

      return emptyResponse;
    }

    // Parse results
    const benchmarks = results.map((r) => ({
      model: r.model as string,
      provider: r.provider as string,
      successRate: parseFloat(r.successRate || '0'),
      avgQualityScore: parseFloat(r.avgQualityScore || '0'),
      avgLatencyMs: parseFloat(r.avgLatencyMs || '0'),
      costPerSuccess: parseFloat(r.costPerSuccess || '0'),
    }));

    // Normalize cost and latency
    const maxCost = Math.max(...benchmarks.map((b) => b.costPerSuccess), 0.000001);
    const maxLatency = Math.max(...benchmarks.map((b) => b.avgLatencyMs), 1);

    // Calculate composite scores and build rankings
    const rankings = benchmarks
      .map((b) => {
        const normalizedCost = b.costPerSuccess / maxCost;
        const normalizedLatency = b.avgLatencyMs / maxLatency;

        const compositeScore =
          0.4 * b.successRate +
          0.3 * b.avgQualityScore +
          0.2 * (1 - normalizedCost) +
          0.1 * (1 - normalizedLatency);

        return {
          model: b.model,
          provider: b.provider,
          compositeScore: Math.round(compositeScore * 10000) / 10000,
          successRate: b.successRate,
          avgQualityScore: b.avgQualityScore,
          avgLatencyMs: b.avgLatencyMs,
          costPerSuccess: b.costPerSuccess,
        };
      })
      .sort((a, b) => b.compositeScore - a.compositeScore);

    const deprioritized = benchmarks
      .filter((b) => b.successRate < 0.80)
      .map((b) => b.model);

    const promoted = benchmarks
      .filter((b) => b.avgQualityScore > 0.90)
      .map((b) => b.model);

    const response: RouterFeedbackResponse = {
      taskType,
      deprioritized,
      promoted,
      rankings,
    };

    // Cache result
    try {
      await this.redisService.set(cacheKey, JSON.stringify(response), CACHE_TTL);
    } catch {
      // non-critical
    }

    return response;
  }
}
