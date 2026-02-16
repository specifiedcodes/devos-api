import { Test, TestingModule } from '@nestjs/testing';
import { HealthHistoryService } from '../health-history.service';
import { HealthCheckService } from '../health.service';
import { HealthMetricsService } from '../health-metrics.service';
import { RedisService } from '../../redis/redis.service';
import { HealthCheckResult } from '../dto/health-check.dto';

describe('HealthHistoryService', () => {
  let service: HealthHistoryService;
  let mockRedisService: jest.Mocked<Partial<RedisService>>;
  let mockHealthCheckService: jest.Mocked<Partial<HealthCheckService>>;
  let mockHealthMetricsService: jest.Mocked<Partial<HealthMetricsService>>;

  const mockHealthResult: HealthCheckResult = {
    status: 'healthy',
    timestamp: '2026-02-16T10:00:00.000Z',
    uptime: 86400,
    version: '0.1.0',
    services: {
      database: {
        status: 'healthy',
        responseTimeMs: 12,
        lastChecked: '2026-02-16T10:00:00.000Z',
      },
      redis: {
        status: 'healthy',
        responseTimeMs: 3,
        lastChecked: '2026-02-16T10:00:00.000Z',
      },
      bullmq: {
        status: 'healthy',
        responseTimeMs: 8,
        lastChecked: '2026-02-16T10:00:00.000Z',
      },
      neo4j: {
        status: 'healthy',
        responseTimeMs: 45,
        lastChecked: '2026-02-16T10:00:00.000Z',
      },
    },
    summary: { total: 4, healthy: 4, degraded: 0, unhealthy: 0 },
  };

  beforeEach(async () => {
    mockRedisService = {
      zadd: jest.fn().mockResolvedValue(1),
      zrangebyscore: jest.fn().mockResolvedValue([]),
      zremrangebyscore: jest.fn().mockResolvedValue(0),
    };

    mockHealthCheckService = {
      checkHealth: jest.fn().mockResolvedValue(mockHealthResult),
    };

    mockHealthMetricsService = {
      updateMetrics: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthHistoryService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: HealthCheckService, useValue: mockHealthCheckService },
        { provide: HealthMetricsService, useValue: mockHealthMetricsService },
      ],
    }).compile();

    service = module.get<HealthHistoryService>(HealthHistoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordHealthCheck', () => {
    it('should store health check result in Redis sorted set with timestamp score', async () => {
      await service.recordHealthCheck();

      expect(mockRedisService.zadd).toHaveBeenCalledWith(
        'health:history',
        expect.any(Number),
        expect.any(String),
      );

      const storedEntry = JSON.parse(
        (mockRedisService.zadd as jest.Mock).mock.calls[0][2],
      );
      expect(storedEntry.overallStatus).toBe('healthy');
      expect(storedEntry.services).toBeDefined();
      expect(storedEntry.totalResponseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should prune old entries (> 24 hours) on each check', async () => {
      await service.recordHealthCheck();

      expect(mockRedisService.zremrangebyscore).toHaveBeenCalledWith(
        'health:history',
        '-inf',
        expect.any(Number),
      );
    });

    it('should update Prometheus metrics via HealthMetricsService', async () => {
      await service.recordHealthCheck();

      expect(mockHealthMetricsService.updateMetrics).toHaveBeenCalledWith(
        mockHealthResult,
      );
    });

    it('should handle Redis unavailability gracefully (logs warning, continues)', async () => {
      mockRedisService.zadd = jest
        .fn()
        .mockRejectedValue(new Error('Redis unavailable'));

      // Should not throw
      await expect(service.recordHealthCheck()).resolves.not.toThrow();
    });
  });

  describe('getHistory', () => {
    it('should return entries for requested duration window', async () => {
      const mockEntries = [
        JSON.stringify({
          timestamp: '2026-02-16T09:00:00.000Z',
          overallStatus: 'healthy',
          services: { database: 'healthy', redis: 'healthy' },
          totalResponseTimeMs: 15,
        }),
        JSON.stringify({
          timestamp: '2026-02-16T09:01:00.000Z',
          overallStatus: 'healthy',
          services: { database: 'healthy', redis: 'healthy' },
          totalResponseTimeMs: 18,
        }),
      ];
      mockRedisService.zrangebyscore = jest.fn().mockResolvedValue(mockEntries);

      const result = await service.getHistory('1h');

      expect(result).toHaveLength(2);
      expect(result[0].overallStatus).toBe('healthy');
    });

    it('should call zrangebyscore with correct time window for 1h', async () => {
      await service.getHistory('1h');

      expect(mockRedisService.zrangebyscore).toHaveBeenCalledWith(
        'health:history',
        expect.any(Number),
        '+inf',
      );

      // Verify the minScore is approximately 1 hour ago
      const minScore = (mockRedisService.zrangebyscore as jest.Mock).mock
        .calls[0][1] as number;
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      expect(Math.abs(minScore - oneHourAgo)).toBeLessThan(1000);
    });

    it('should call zrangebyscore with correct time window for 24h', async () => {
      await service.getHistory('24h');

      const minScore = (mockRedisService.zrangebyscore as jest.Mock).mock
        .calls[0][1] as number;
      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
      expect(Math.abs(minScore - twentyFourHoursAgo)).toBeLessThan(1000);
    });

    it('should return empty array when Redis is unavailable', async () => {
      mockRedisService.zrangebyscore = jest
        .fn()
        .mockRejectedValue(new Error('Redis unavailable'));

      const result = await service.getHistory('1h');
      expect(result).toEqual([]);
    });
  });

  describe('getUptimePercentage', () => {
    it('should calculate correctly (healthy entries / total entries * 100)', async () => {
      const entries = [
        JSON.stringify({
          timestamp: '2026-02-16T09:00:00.000Z',
          overallStatus: 'healthy',
          services: {},
          totalResponseTimeMs: 15,
        }),
        JSON.stringify({
          timestamp: '2026-02-16T09:01:00.000Z',
          overallStatus: 'unhealthy',
          services: {},
          totalResponseTimeMs: 0,
        }),
        JSON.stringify({
          timestamp: '2026-02-16T09:02:00.000Z',
          overallStatus: 'healthy',
          services: {},
          totalResponseTimeMs: 12,
        }),
        JSON.stringify({
          timestamp: '2026-02-16T09:03:00.000Z',
          overallStatus: 'healthy',
          services: {},
          totalResponseTimeMs: 10,
        }),
      ];
      mockRedisService.zrangebyscore = jest.fn().mockResolvedValue(entries);

      const result = await service.getUptimePercentage('1h');

      // 3 healthy out of 4 = 75%
      expect(result).toBe(75);
    });

    it('should return 100 when all entries are healthy', async () => {
      const entries = [
        JSON.stringify({
          timestamp: '2026-02-16T09:00:00.000Z',
          overallStatus: 'healthy',
          services: {},
          totalResponseTimeMs: 15,
        }),
        JSON.stringify({
          timestamp: '2026-02-16T09:01:00.000Z',
          overallStatus: 'healthy',
          services: {},
          totalResponseTimeMs: 12,
        }),
      ];
      mockRedisService.zrangebyscore = jest.fn().mockResolvedValue(entries);

      const result = await service.getUptimePercentage('1h');
      expect(result).toBe(100);
    });

    it('should return 0 when all entries are unhealthy', async () => {
      const entries = [
        JSON.stringify({
          timestamp: '2026-02-16T09:00:00.000Z',
          overallStatus: 'unhealthy',
          services: {},
          totalResponseTimeMs: 0,
        }),
        JSON.stringify({
          timestamp: '2026-02-16T09:01:00.000Z',
          overallStatus: 'unhealthy',
          services: {},
          totalResponseTimeMs: 0,
        }),
      ];
      mockRedisService.zrangebyscore = jest.fn().mockResolvedValue(entries);

      const result = await service.getUptimePercentage('1h');
      expect(result).toBe(0);
    });

    it('should return 100 when no data exists (assume healthy)', async () => {
      mockRedisService.zrangebyscore = jest.fn().mockResolvedValue([]);

      const result = await service.getUptimePercentage('1h');
      expect(result).toBe(100);
    });
  });

  describe('getIncidents', () => {
    it('should identify contiguous unhealthy/degraded periods', async () => {
      const entries = [
        JSON.stringify({
          timestamp: '2026-02-16T09:00:00.000Z',
          overallStatus: 'healthy',
          services: { database: 'healthy', redis: 'healthy' },
          totalResponseTimeMs: 15,
        }),
        JSON.stringify({
          timestamp: '2026-02-16T09:01:00.000Z',
          overallStatus: 'unhealthy',
          services: { database: 'unhealthy', redis: 'healthy' },
          totalResponseTimeMs: 0,
        }),
        JSON.stringify({
          timestamp: '2026-02-16T09:02:00.000Z',
          overallStatus: 'unhealthy',
          services: { database: 'unhealthy', redis: 'healthy' },
          totalResponseTimeMs: 0,
        }),
        JSON.stringify({
          timestamp: '2026-02-16T09:03:00.000Z',
          overallStatus: 'healthy',
          services: { database: 'healthy', redis: 'healthy' },
          totalResponseTimeMs: 15,
        }),
      ];
      mockRedisService.zrangebyscore = jest.fn().mockResolvedValue(entries);

      const incidents = await service.getIncidents('1h');

      expect(incidents).toHaveLength(1);
      expect(incidents[0].severity).toBe('unhealthy');
      expect(incidents[0].affectedServices).toContain('database');
      expect(incidents[0].resolvedAt).toBe('2026-02-16T09:03:00.000Z');
      expect(incidents[0].duration).toBe(120); // 2 minutes
    });

    it('should return empty array when all entries are healthy', async () => {
      const entries = [
        JSON.stringify({
          timestamp: '2026-02-16T09:00:00.000Z',
          overallStatus: 'healthy',
          services: { database: 'healthy' },
          totalResponseTimeMs: 15,
        }),
        JSON.stringify({
          timestamp: '2026-02-16T09:01:00.000Z',
          overallStatus: 'healthy',
          services: { database: 'healthy' },
          totalResponseTimeMs: 12,
        }),
      ];
      mockRedisService.zrangebyscore = jest.fn().mockResolvedValue(entries);

      const incidents = await service.getIncidents('1h');
      expect(incidents).toHaveLength(0);
    });

    it('should handle ongoing incident without resolvedAt', async () => {
      const entries = [
        JSON.stringify({
          timestamp: '2026-02-16T09:00:00.000Z',
          overallStatus: 'degraded',
          services: { redis: 'degraded' },
          totalResponseTimeMs: 200,
        }),
      ];
      mockRedisService.zrangebyscore = jest.fn().mockResolvedValue(entries);

      const incidents = await service.getIncidents('1h');

      expect(incidents).toHaveLength(1);
      expect(incidents[0].resolvedAt).toBeNull();
      expect(incidents[0].severity).toBe('degraded');
    });

    it('should return empty array when no history data', async () => {
      mockRedisService.zrangebyscore = jest.fn().mockResolvedValue([]);

      const incidents = await service.getIncidents('24h');
      expect(incidents).toHaveLength(0);
    });
  });
});
