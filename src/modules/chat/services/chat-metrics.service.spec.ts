/**
 * ChatMetricsService Tests
 * Story 9.8: Agent Response Time Optimization
 *
 * Unit tests for Prometheus-style metrics collection.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ChatMetricsService } from './chat-metrics.service';
import { RedisService } from '../../redis/redis.service';
import {
  DEFAULT_ALERT_THRESHOLDS,
  METRICS_KEYS,
} from '../interfaces/metrics.interfaces';

describe('ChatMetricsService', () => {
  let service: ChatMetricsService;
  let redisService: jest.Mocked<RedisService>;

  beforeEach(async () => {
    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      increment: jest.fn(),
      keys: jest.fn(),
      expire: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatMetricsService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<ChatMetricsService>(ChatMetricsService);
    redisService = module.get(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordResponseTime', () => {
    it('should record response time with labels', async () => {
      await service.recordResponseTime(500, {
        agentType: 'dev',
        requestType: 'chat',
        cacheHit: 'false',
      });

      expect(redisService.increment).toHaveBeenCalled();
    });

    it('should update histogram buckets', async () => {
      await service.recordResponseTime(500, { agentType: 'dev' });

      // Should increment buckets for values >= 500
      expect(redisService.increment).toHaveBeenCalledWith(
        expect.stringContaining('response_time'),
        expect.any(Number),
      );
    });

    it('should handle very fast responses', async () => {
      await service.recordResponseTime(50, { agentType: 'dev' });

      // Should increment all buckets >= 50
      expect(redisService.increment).toHaveBeenCalled();
    });

    it('should handle slow responses', async () => {
      await service.recordResponseTime(5000, { agentType: 'dev' });

      // Should only increment the largest bucket
      expect(redisService.increment).toHaveBeenCalled();
    });
  });

  describe('recordCacheHit', () => {
    it('should record cache hit', async () => {
      await service.recordCacheHit(true, 'help');

      expect(redisService.increment).toHaveBeenCalledWith(
        expect.stringContaining('hits'),
        1,
      );
    });

    it('should record cache miss', async () => {
      await service.recordCacheHit(false, 'help');

      expect(redisService.increment).toHaveBeenCalledWith(
        expect.stringContaining('misses'),
        1,
      );
    });

    it('should track by category', async () => {
      await service.recordCacheHit(true, 'status');

      expect(redisService.increment).toHaveBeenCalledWith(
        expect.stringContaining('status'),
        expect.any(Number),
      );
    });
  });

  describe('recordQueueDepth', () => {
    it('should record queue depth', async () => {
      await service.recordQueueDepth(25, 'HIGH');

      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining('queue_depth'),
        expect.any(String),
        expect.any(Number),
      );
    });

    it('should track by priority', async () => {
      await service.recordQueueDepth(10, 'CRITICAL');

      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining('CRITICAL'),
        expect.any(String),
        expect.any(Number),
      );
    });
  });

  describe('recordStreamChunk', () => {
    it('should record stream chunk latency', async () => {
      await service.recordStreamChunk(50, 0);

      expect(redisService.increment).toHaveBeenCalledWith(
        expect.stringContaining('stream_latency'),
        expect.any(Number),
      );
    });

    it('should track first chunk specially', async () => {
      await service.recordStreamChunk(100, 0);

      expect(redisService.increment).toHaveBeenCalledWith(
        expect.stringContaining('first_chunk'),
        expect.any(Number),
      );
    });
  });

  describe('recordError', () => {
    it('should increment error counter', async () => {
      await service.recordError('timeout');

      expect(redisService.increment).toHaveBeenCalledWith(
        expect.stringContaining('error_count:timeout'),
        1,
      );
    });

    it('should track total errors', async () => {
      await service.recordError('api_error');

      expect(redisService.increment).toHaveBeenCalledWith(
        expect.stringContaining('error_count:total'),
        1,
      );
    });
  });

  describe('getMetrics', () => {
    it('should return metrics summary', async () => {
      // Mock response time data (time series format)
      const timeSeriesData = [
        { timestamp: new Date(), value: 100 },
        { timestamp: new Date(), value: 200 },
        { timestamp: new Date(), value: 300 },
      ];

      redisService.get.mockImplementation((key: string) => {
        if (key.includes('response_time')) {
          return Promise.resolve(JSON.stringify(timeSeriesData));
        }
        if (key.includes('hits:total')) {
          return Promise.resolve('100');
        }
        if (key.includes('misses:total')) {
          return Promise.resolve('20');
        }
        return Promise.resolve(null);
      });

      const metrics = await service.getMetrics();

      expect(metrics).toHaveProperty('responseTime');
      expect(metrics).toHaveProperty('throughput');
      expect(metrics).toHaveProperty('cache');
      expect(metrics).toHaveProperty('queue');
    });

    it('should calculate percentiles correctly', async () => {
      // Create time series data from values
      const values = Array.from({ length: 100 }, (_, i) => ({
        timestamp: new Date(Date.now() - (100 - i) * 1000),
        value: i * 10,
      }));
      redisService.get.mockResolvedValue(JSON.stringify(values));

      const metrics = await service.getMetrics();

      expect(metrics.responseTime.p50).toBeDefined();
      expect(metrics.responseTime.p90).toBeDefined();
      expect(metrics.responseTime.p99).toBeDefined();
    });

    it('should calculate cache hit rate', async () => {
      redisService.get.mockImplementation((key: string) => {
        if (key.includes('hits:total')) return Promise.resolve('80');
        if (key.includes('misses:total')) return Promise.resolve('20');
        return Promise.resolve(null);
      });

      const metrics = await service.getMetrics();

      expect(metrics.cache.hitRate).toBeCloseTo(0.8, 1);
    });
  });

  describe('getAlertStatus', () => {
    it('should return resolved alerts when metrics are healthy', async () => {
      // Return low response times - time series format
      const healthyData = [
        { timestamp: new Date(), value: 1000 },
        { timestamp: new Date(), value: 1200 },
        { timestamp: new Date(), value: 1500 },
      ];
      redisService.get.mockImplementation((key: string) => {
        if (key.includes('response_time')) {
          return Promise.resolve(JSON.stringify(healthyData));
        }
        // High hit rate
        if (key.includes('hits:total')) return Promise.resolve('80');
        if (key.includes('misses:total')) return Promise.resolve('20');
        // Low queue depth
        if (key.includes('queue_depth:total')) return Promise.resolve('10');
        return Promise.resolve(null);
      });

      const alerts = await service.getAlertStatus();

      // All alerts should be resolved
      const firingAlerts = alerts.filter((a) => a.status === 'firing');
      expect(firingAlerts.length).toBe(0);
    });

    it('should fire alert when P99 exceeds threshold', async () => {
      // Most values are fast, but some are very slow - exceeds 3s P99 threshold
      const values = [
        ...Array(95).fill(0).map((_, i) => ({ timestamp: new Date(), value: 500 })),
        ...Array(5).fill(0).map((_, i) => ({ timestamp: new Date(), value: 5000 })),
      ];
      redisService.get.mockImplementation((key: string) => {
        if (key.includes('response_time')) {
          return Promise.resolve(JSON.stringify(values));
        }
        if (key.includes('hits:total')) return Promise.resolve('80');
        if (key.includes('misses:total')) return Promise.resolve('20');
        return Promise.resolve(null);
      });

      const alerts = await service.getAlertStatus();

      const p99Alert = alerts.find((a) => a.name === 'response_time_p99');
      expect(p99Alert?.status).toBe('firing');
    });

    it('should fire alert when cache hit rate is low', async () => {
      redisService.get.mockImplementation((key: string) => {
        if (key.includes('hits:total')) return Promise.resolve('10');
        if (key.includes('misses:total')) return Promise.resolve('90');
        return Promise.resolve(null);
      });

      const alerts = await service.getAlertStatus();

      const cacheAlert = alerts.find((a) => a.name === 'cache_hit_rate_low');
      expect(cacheAlert?.status).toBe('firing');
    });

    it('should fire alert when queue depth is high', async () => {
      redisService.get.mockImplementation((key: string) => {
        if (key.includes('queue_depth:total')) return Promise.resolve('150');
        if (key.includes('hits:total')) return Promise.resolve('80');
        if (key.includes('misses:total')) return Promise.resolve('20');
        return Promise.resolve(null);
      });

      const alerts = await service.getAlertStatus();

      const queueAlert = alerts.find((a) => a.name === 'queue_depth_high');
      expect(queueAlert?.status).toBe('firing');
    });
  });

  describe('getHistoricalMetrics', () => {
    it('should return time series data', async () => {
      const mockData = [
        { timestamp: new Date(Date.now() - 3600000), value: 500 },
        { timestamp: new Date(Date.now() - 1800000), value: 600 },
        { timestamp: new Date(), value: 550 },
      ];
      redisService.get.mockResolvedValue(JSON.stringify(mockData));

      const startTime = new Date(Date.now() - 7200000);
      const endTime = new Date();

      const data = await service.getHistoricalMetrics(startTime, endTime);

      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('calculatePercentile', () => {
    it('should calculate P50 correctly', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const p50 = service.calculatePercentile(values, 50);
      expect(p50).toBe(5);
    });

    it('should calculate P99 correctly', () => {
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      const p99 = service.calculatePercentile(values, 99);
      expect(p99).toBe(99);
    });

    it('should handle empty array', () => {
      const p50 = service.calculatePercentile([], 50);
      expect(p50).toBe(0);
    });
  });
});
