/**
 * ChatMetricsService
 * Story 9.8: Agent Response Time Optimization
 *
 * Prometheus-style metrics collection for agent response performance.
 */

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import {
  MetricLabels,
  MetricsSummary,
  TimeSeriesData,
  TimeSeriesDataPoint,
  AlertStatus,
  IPerformanceMetricsService,
  RESPONSE_TIME_BUCKETS,
  STREAM_LATENCY_BUCKETS,
  DEFAULT_ALERT_THRESHOLDS,
  METRICS_KEYS,
} from '../interfaces/metrics.interfaces';

/**
 * TTL for metrics data in Redis (7 days in seconds)
 */
const METRICS_TTL = 7 * 24 * 60 * 60;

/**
 * Time window for percentile calculations (1 hour)
 */
const PERCENTILE_WINDOW = 60 * 60 * 1000;

@Injectable()
export class ChatMetricsService implements IPerformanceMetricsService {
  private readonly logger = new Logger(ChatMetricsService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Record response time in histogram buckets
   */
  async recordResponseTime(time: number, labels: MetricLabels): Promise<void> {
    try {
      const labelStr = this.labelsToString(labels);

      // Increment counter for each bucket that the value falls into
      for (const bucket of RESPONSE_TIME_BUCKETS) {
        if (time <= bucket) {
          await this.redisService.increment(
            `${METRICS_KEYS.RESPONSE_TIMES}:bucket:${bucket}:${labelStr}`,
            1,
          );
        }
      }

      // Store raw value for percentile calculations
      await this.appendToTimeSeries(
        `${METRICS_KEYS.RESPONSE_TIMES}:raw`,
        time,
      );

      // Increment total counter
      await this.redisService.increment(
        `${METRICS_KEYS.REQUEST_COUNT}:${labelStr}`,
        1,
      );
    } catch (error: any) {
      this.logger.warn(`Failed to record response time: ${error.message}`);
    }
  }

  /**
   * Record cache hit or miss
   */
  async recordCacheHit(hit: boolean, category: string): Promise<void> {
    try {
      const key = hit
        ? `${METRICS_KEYS.CACHE_STATS}:hits:${category}`
        : `${METRICS_KEYS.CACHE_STATS}:misses:${category}`;

      await this.redisService.increment(key, 1);

      // Also increment totals
      const totalKey = hit
        ? `${METRICS_KEYS.CACHE_STATS}:hits:total`
        : `${METRICS_KEYS.CACHE_STATS}:misses:total`;

      await this.redisService.increment(totalKey, 1);
    } catch (error: any) {
      this.logger.warn(`Failed to record cache hit: ${error.message}`);
    }
  }

  /**
   * Record current queue depth
   */
  async recordQueueDepth(depth: number, priority: string): Promise<void> {
    try {
      await this.redisService.set(
        `${METRICS_KEYS.QUEUE_DEPTH}:${priority}`,
        depth.toString(),
        METRICS_TTL,
      );

      // Append to time series for historical tracking
      await this.appendToTimeSeries(
        `${METRICS_KEYS.QUEUE_DEPTH}:history`,
        depth,
      );
    } catch (error: any) {
      this.logger.warn(`Failed to record queue depth: ${error.message}`);
    }
  }

  /**
   * Record stream chunk latency
   */
  async recordStreamChunk(latency: number, chunkIndex: number): Promise<void> {
    try {
      // Track first chunk specially (important for perceived latency)
      if (chunkIndex === 0) {
        await this.redisService.increment(
          `${METRICS_KEYS.STREAM_LATENCY}:first_chunk`,
          latency,
        );
        await this.redisService.increment(
          `${METRICS_KEYS.STREAM_LATENCY}:first_chunk:count`,
          1,
        );
      }

      // Track in histogram buckets
      for (const bucket of STREAM_LATENCY_BUCKETS) {
        if (latency <= bucket) {
          await this.redisService.increment(
            `${METRICS_KEYS.STREAM_LATENCY}:bucket:${bucket}`,
            1,
          );
        }
      }
    } catch (error: any) {
      this.logger.warn(`Failed to record stream chunk: ${error.message}`);
    }
  }

  /**
   * Record error by type
   */
  async recordError(type: string): Promise<void> {
    try {
      await this.redisService.increment(`${METRICS_KEYS.ERROR_COUNT}:${type}`, 1);
      await this.redisService.increment(`${METRICS_KEYS.ERROR_COUNT}:total`, 1);
    } catch (error: any) {
      this.logger.warn(`Failed to record error: ${error.message}`);
    }
  }

  /**
   * Get current metrics summary
   */
  async getMetrics(): Promise<MetricsSummary> {
    try {
      // Get response time percentiles
      const responseTimeData = await this.getTimeSeriesData(
        `${METRICS_KEYS.RESPONSE_TIMES}:raw`,
      );
      const values = responseTimeData.map((d) => d.value).sort((a, b) => a - b);

      const responseTime = {
        p50: this.calculatePercentile(values, 50),
        p90: this.calculatePercentile(values, 90),
        p99: this.calculatePercentile(values, 99),
        avg: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
      };

      // Get cache stats
      const hits = parseInt(
        (await this.redisService.get(`${METRICS_KEYS.CACHE_STATS}:hits:total`)) || '0',
      );
      const misses = parseInt(
        (await this.redisService.get(`${METRICS_KEYS.CACHE_STATS}:misses:total`)) || '0',
      );
      const total = hits + misses;

      const cache = {
        hitRate: total > 0 ? hits / total : 0,
        totalHits: hits,
        totalMisses: misses,
      };

      // Get queue stats
      const queueDepth = parseInt(
        (await this.redisService.get(`${METRICS_KEYS.QUEUE_DEPTH}:total`)) || '0',
      );

      const queueHistory = await this.getTimeSeriesData(
        `${METRICS_KEYS.QUEUE_DEPTH}:history`,
      );
      const avgWaitTime =
        queueHistory.length > 0
          ? queueHistory.reduce((a, b) => a + b.value, 0) / queueHistory.length
          : 0;

      const queue = {
        currentDepth: queueDepth,
        avgWaitTime,
        processingRate: this.calculateProcessingRate(responseTimeData),
      };

      // Get throughput
      const requestCount = parseInt(
        (await this.redisService.get(`${METRICS_KEYS.REQUEST_COUNT}:total`)) || '0',
      );

      const throughput = {
        requestsPerSecond: this.calculateThroughput(responseTimeData),
        totalRequests: requestCount,
      };

      return {
        responseTime,
        throughput,
        cache,
        queue,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get metrics: ${error.message}`);
      return {
        responseTime: { p50: 0, p90: 0, p99: 0, avg: 0 },
        throughput: { requestsPerSecond: 0, totalRequests: 0 },
        cache: { hitRate: 0, totalHits: 0, totalMisses: 0 },
        queue: { currentDepth: 0, avgWaitTime: 0, processingRate: 0 },
      };
    }
  }

  /**
   * Get historical metrics for time range
   */
  async getHistoricalMetrics(
    startTime: Date,
    endTime: Date,
  ): Promise<TimeSeriesData[]> {
    try {
      const responseTimeData = await this.getTimeSeriesData(
        `${METRICS_KEYS.RESPONSE_TIMES}:raw`,
      );

      const filtered = responseTimeData.filter(
        (d) => d.timestamp >= startTime && d.timestamp <= endTime,
      );

      return [
        {
          metric: 'response_time',
          data: filtered,
        },
      ];
    } catch (error: any) {
      this.logger.error(`Failed to get historical metrics: ${error.message}`);
      return [];
    }
  }

  /**
   * Get alert status based on current metrics
   */
  async getAlertStatus(): Promise<AlertStatus[]> {
    const alerts: AlertStatus[] = [];
    const metrics = await this.getMetrics();

    // Check P99 response time
    if (metrics.responseTime.p99 > DEFAULT_ALERT_THRESHOLDS.responseTimeP99) {
      alerts.push({
        name: 'response_time_p99',
        severity: 'critical',
        status: 'firing',
        message: `P99 response time (${metrics.responseTime.p99}ms) exceeds threshold (${DEFAULT_ALERT_THRESHOLDS.responseTimeP99}ms)`,
        value: metrics.responseTime.p99,
        threshold: DEFAULT_ALERT_THRESHOLDS.responseTimeP99,
        triggeredAt: new Date(),
      });
    } else {
      alerts.push({
        name: 'response_time_p99',
        severity: 'critical',
        status: 'resolved',
        message: 'P99 response time is within threshold',
        value: metrics.responseTime.p99,
        threshold: DEFAULT_ALERT_THRESHOLDS.responseTimeP99,
      });
    }

    // Check cache hit rate
    if (metrics.cache.hitRate < DEFAULT_ALERT_THRESHOLDS.cacheHitRateLow) {
      alerts.push({
        name: 'cache_hit_rate_low',
        severity: 'warning',
        status: 'firing',
        message: `Cache hit rate (${(metrics.cache.hitRate * 100).toFixed(1)}%) is below threshold (${DEFAULT_ALERT_THRESHOLDS.cacheHitRateLow * 100}%)`,
        value: metrics.cache.hitRate,
        threshold: DEFAULT_ALERT_THRESHOLDS.cacheHitRateLow,
        triggeredAt: new Date(),
      });
    } else {
      alerts.push({
        name: 'cache_hit_rate_low',
        severity: 'warning',
        status: 'resolved',
        message: 'Cache hit rate is within threshold',
        value: metrics.cache.hitRate,
        threshold: DEFAULT_ALERT_THRESHOLDS.cacheHitRateLow,
      });
    }

    // Check queue depth
    if (metrics.queue.currentDepth > DEFAULT_ALERT_THRESHOLDS.queueDepthHigh) {
      alerts.push({
        name: 'queue_depth_high',
        severity: 'warning',
        status: 'firing',
        message: `Queue depth (${metrics.queue.currentDepth}) exceeds threshold (${DEFAULT_ALERT_THRESHOLDS.queueDepthHigh})`,
        value: metrics.queue.currentDepth,
        threshold: DEFAULT_ALERT_THRESHOLDS.queueDepthHigh,
        triggeredAt: new Date(),
      });
    } else {
      alerts.push({
        name: 'queue_depth_high',
        severity: 'warning',
        status: 'resolved',
        message: 'Queue depth is within threshold',
        value: metrics.queue.currentDepth,
        threshold: DEFAULT_ALERT_THRESHOLDS.queueDepthHigh,
      });
    }

    return alerts;
  }

  /**
   * Calculate percentile from sorted values
   */
  calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;

    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
  }

  /**
   * Convert labels to string for Redis key
   */
  private labelsToString(labels: MetricLabels): string {
    return Object.entries(labels)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
      .join(',') || 'unlabeled';
  }

  /**
   * Append value to time series in Redis using sorted sets for better performance
   * Uses Redis ZADD for O(log n) insertion instead of O(n) array manipulation
   */
  private async appendToTimeSeries(key: string, value: number): Promise<void> {
    try {
      const now = Date.now();
      const sortedSetKey = `${key}:zset`;

      // Use Redis sorted set with timestamp as score for O(log n) operations
      // Store value as JSON with timestamp for retrieval
      const dataPoint = JSON.stringify({ timestamp: new Date(now), value });
      await this.redisService.zadd(sortedSetKey, now, dataPoint);

      // Remove old entries in a separate async operation (non-blocking cleanup)
      const cutoff = now - PERCENTILE_WINDOW;
      this.cleanupOldTimeSeriesData(sortedSetKey, cutoff).catch((err) => {
        this.logger.warn(`Failed to cleanup old time series data: ${err.message}`);
      });

      // Also maintain backward compatibility with legacy format
      // by periodically syncing to the original key format
      if (now % 10000 < 1000) { // Every ~10 seconds
        this.syncTimeSeriesData(key, sortedSetKey).catch((err) => {
          this.logger.debug(`Background sync skipped: ${err.message}`);
        });
      }
    } catch (error: any) {
      this.logger.warn(`Failed to append to time series: ${error.message}`);
    }
  }

  /**
   * Cleanup old time series data asynchronously
   */
  private async cleanupOldTimeSeriesData(key: string, cutoff: number): Promise<void> {
    try {
      await this.redisService.zremrangebyscore(key, 0, cutoff);
    } catch (error: any) {
      // Non-critical, log and continue
      this.logger.debug(`Cleanup failed for ${key}: ${error.message}`);
    }
  }

  /**
   * Sync sorted set data back to legacy array format
   */
  private async syncTimeSeriesData(legacyKey: string, sortedSetKey: string): Promise<void> {
    try {
      const cutoff = Date.now() - PERCENTILE_WINDOW;
      const entries = await this.redisService.zrangebyscore(sortedSetKey, cutoff, '+inf');

      if (entries && entries.length > 0) {
        const data: TimeSeriesDataPoint[] = entries.map((entry: string) => JSON.parse(entry));
        await this.redisService.set(legacyKey, JSON.stringify(data), METRICS_TTL);
      }
    } catch (error: any) {
      this.logger.debug(`Sync failed: ${error.message}`);
    }
  }

  /**
   * Get time series data from Redis
   */
  private async getTimeSeriesData(key: string): Promise<TimeSeriesDataPoint[]> {
    try {
      const data = await this.redisService.get(key);
      if (!data) return [];

      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed.map((d) => ({
          timestamp: new Date(d.timestamp),
          value: d.value,
        }));
      }

      // Handle legacy format with { values: number[] }
      if (parsed.values && Array.isArray(parsed.values)) {
        return parsed.values.map((v: number, i: number) => ({
          timestamp: new Date(Date.now() - (parsed.values.length - i) * 1000),
          value: v,
        }));
      }

      return [];
    } catch (error: any) {
      this.logger.warn(`Failed to get time series data: ${error.message}`);
      return [];
    }
  }

  /**
   * Calculate throughput (requests per second)
   */
  private calculateThroughput(data: TimeSeriesDataPoint[]): number {
    if (data.length < 2) return 0;

    const firstTime = new Date(data[0].timestamp).getTime();
    const lastTime = new Date(data[data.length - 1].timestamp).getTime();
    const durationSeconds = (lastTime - firstTime) / 1000;

    return durationSeconds > 0 ? data.length / durationSeconds : 0;
  }

  /**
   * Calculate processing rate based on recent data
   */
  private calculateProcessingRate(data: TimeSeriesDataPoint[]): number {
    // Use recent 1 minute of data
    const oneMinuteAgo = Date.now() - 60000;
    const recent = data.filter(
      (d) => new Date(d.timestamp).getTime() > oneMinuteAgo,
    );

    return recent.length / 60; // requests per second
  }
}
