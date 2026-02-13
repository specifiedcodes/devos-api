/**
 * Metrics Interfaces
 * Story 9.8: Agent Response Time Optimization
 *
 * Type definitions for performance metrics and monitoring.
 */

/**
 * Metric types supported
 */
export enum MetricType {
  HISTOGRAM = 'histogram',
  COUNTER = 'counter',
  GAUGE = 'gauge',
}

/**
 * Labels for metrics
 */
export interface MetricLabels {
  agentType?: string;
  requestType?: string;
  cacheHit?: string;
  priority?: string;
  status?: string;
}

/**
 * Histogram buckets for response time
 */
export const RESPONSE_TIME_BUCKETS = [100, 250, 500, 1000, 2000, 3000, 5000];

/**
 * Histogram buckets for stream latency
 */
export const STREAM_LATENCY_BUCKETS = [10, 25, 50, 100, 200, 500];

/**
 * Metrics summary for dashboard
 */
export interface MetricsSummary {
  responseTime: {
    p50: number;
    p90: number;
    p99: number;
    avg: number;
  };
  throughput: {
    requestsPerSecond: number;
    totalRequests: number;
  };
  cache: {
    hitRate: number;
    totalHits: number;
    totalMisses: number;
  };
  queue: {
    currentDepth: number;
    avgWaitTime: number;
    processingRate: number;
  };
}

/**
 * Time series data point
 */
export interface TimeSeriesDataPoint {
  timestamp: Date;
  value: number;
  labels?: MetricLabels;
}

/**
 * Time series data for historical metrics
 */
export interface TimeSeriesData {
  metric: string;
  data: TimeSeriesDataPoint[];
}

/**
 * Alert status
 */
export interface AlertStatus {
  name: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'firing' | 'resolved';
  message: string;
  value: number;
  threshold: number;
  triggeredAt?: Date;
  resolvedAt?: Date;
}

/**
 * Alert thresholds configuration
 */
export interface AlertThresholds {
  responseTimeP99: number;    // Alert if P99 > threshold (ms)
  queueDepthHigh: number;     // Alert if queue > threshold
  cacheHitRateLow: number;    // Alert if hit rate < threshold (0-1)
  errorRateHigh: number;      // Alert if error rate > threshold (0-1)
}

/**
 * Default alert thresholds
 */
export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  responseTimeP99: 3000,      // 3 seconds (NFR-P6)
  queueDepthHigh: 100,
  cacheHitRateLow: 0.3,       // 30%
  errorRateHigh: 0.05,        // 5%
};

/**
 * Performance metrics service interface
 */
export interface IPerformanceMetricsService {
  recordResponseTime(time: number, labels: MetricLabels): void;
  recordCacheHit(hit: boolean, category: string): void;
  recordQueueDepth(depth: number, priority: string): void;
  recordStreamChunk(latency: number, chunkIndex: number): void;
  recordError(type: string): void;
  getMetrics(): Promise<MetricsSummary>;
  getHistoricalMetrics(startTime: Date, endTime: Date): Promise<TimeSeriesData[]>;
  getAlertStatus(): Promise<AlertStatus[]>;
}

/**
 * Query parameters for historical metrics
 */
export interface HistoryQuery {
  startTime?: string;
  endTime?: string;
  metric?: string;
  resolution?: 'minute' | 'hour' | 'day';
}

/**
 * Metrics collection configuration
 */
export interface MetricsConfig {
  collectionInterval: number;  // ms
  retention: string;           // e.g., '7d'
  aggregation: string[];       // ['p50', 'p90', 'p99', 'avg']
}

/**
 * Default metrics configuration
 */
export const DEFAULT_METRICS_CONFIG: MetricsConfig = {
  collectionInterval: 5000,    // 5 seconds
  retention: '7d',
  aggregation: ['p50', 'p90', 'p99', 'avg'],
};

/**
 * Redis keys for metrics storage
 */
export const METRICS_KEYS = {
  RESPONSE_TIMES: 'metrics:response_times',
  CACHE_STATS: 'metrics:cache_stats',
  QUEUE_DEPTH: 'metrics:queue_depth',
  STREAM_LATENCY: 'metrics:stream_latency',
  ERROR_COUNT: 'metrics:error_count',
  REQUEST_COUNT: 'metrics:request_count',
};
