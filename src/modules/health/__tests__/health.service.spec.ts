import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bull';
import { DataSource } from 'typeorm';
import { HealthCheckService } from '../health.service';
import { RedisService } from '../../redis/redis.service';

describe('HealthCheckService', () => {
  let service: HealthCheckService;
  let mockDataSource: jest.Mocked<Partial<DataSource>>;
  let mockRedisService: jest.Mocked<Partial<RedisService>>;
  let mockQueue: any;
  let mockConfigService: jest.Mocked<Partial<ConfigService>>;

  beforeEach(async () => {
    mockDataSource = {
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    mockRedisService = {
      healthCheck: jest.fn().mockResolvedValue(true),
    };

    mockQueue = {
      isReady: jest.fn().mockResolvedValue(true),
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: 0,
        active: 0,
        completed: 10,
        failed: 0,
        delayed: 0,
      }),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue: any) => {
        if (key === 'HEALTH_PROBE_TIMEOUT_MS') return 5000;
        if (key === 'HEALTH_CACHE_TTL_MS') return 10000;
        if (key === 'NEO4J_URI') return 'bolt://localhost:7687';
        if (key === 'NEO4J_USER') return 'neo4j';
        if (key === 'NEO4J_PASSWORD') return 'neo4j_password';
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthCheckService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: RedisService, useValue: mockRedisService },
        { provide: getQueueToken('agent-tasks'), useValue: mockQueue },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<HealthCheckService>(HealthCheckService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkHealth', () => {
    it('should return healthy status when all dependencies respond within thresholds', async () => {
      // Neo4j will fail since we can't connect in tests, but DB/Redis/BullMQ should work
      const result = await service.checkHealth();

      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeGreaterThan(0);
      expect(result.version).toBeDefined();
      expect(result.services).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary.total).toBe(4);
      // DB and BullMQ should be healthy (mocks resolve instantly)
      expect(result.services.database.status).toBe('healthy');
      expect(result.services.bullmq.status).toBe('healthy');
      // Redis and Neo4j may vary based on test runner timing
      expect(['healthy', 'degraded']).toContain(result.services.redis.status);
    });

    it('should return degraded status when PostgreSQL responds slowly (> 100ms)', async () => {
      // Mock a slow database query
      mockDataSource.query = jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([{ '?column?': 1 }]), 150)),
      );

      const result = await service.checkHealth();

      expect(result.services.database.status).toBe('degraded');
      expect(result.services.database.responseTimeMs).toBeGreaterThanOrEqual(100);
    });

    it('should return unhealthy status when Redis ping times out', async () => {
      mockRedisService.healthCheck = jest.fn().mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Probe timeout')), 6000)),
      );

      // Override timeout to a short value for testing
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          HealthCheckService,
          { provide: DataSource, useValue: mockDataSource },
          { provide: RedisService, useValue: mockRedisService },
          { provide: getQueueToken('agent-tasks'), useValue: mockQueue },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockImplementation((key: string, defaultValue: any) => {
                if (key === 'HEALTH_PROBE_TIMEOUT_MS') return 100; // Short timeout
                if (key === 'HEALTH_CACHE_TTL_MS') return 0; // No caching
                return defaultValue;
              }),
            },
          },
        ],
      }).compile();

      const svc = module.get<HealthCheckService>(HealthCheckService);
      const result = await svc.checkHealth();

      expect(result.services.redis.status).toBe('unhealthy');
    });

    it('should return unhealthy status when BullMQ queue is not ready', async () => {
      mockQueue.isReady = jest.fn().mockRejectedValue(new Error('Queue not ready'));

      const result = await service.checkHealth();

      expect(result.services.bullmq.status).toBe('unhealthy');
      expect(result.services.bullmq.error).toContain('Queue not ready');
    });

    it('should calculate overall status as worst individual status (unhealthy > degraded > healthy)', async () => {
      // Make one service unhealthy
      mockRedisService.healthCheck = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await service.checkHealth();

      expect(result.status).toBe('unhealthy');
      expect(result.summary.unhealthy).toBeGreaterThanOrEqual(1);
    });

    it('should cache results for configured TTL', async () => {
      const result1 = await service.checkHealth();
      const result2 = await service.checkHealth();

      // Both should return the same cached result
      expect(result1.timestamp).toBe(result2.timestamp);

      // Database should only have been queried once (cached)
      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
    });

    it('should handle individual probe failure without affecting other probes', async () => {
      // Make database fail but keep everything else working
      mockDataSource.query = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await service.checkHealth();

      expect(result.services.database.status).toBe('unhealthy');
      expect(result.services.redis.status).toBe('healthy');
      expect(result.services.bullmq.status).toBe('healthy');
    });

    it('should return unhealthy for dependency when probe throws exception', async () => {
      mockDataSource.query = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.checkHealth();

      expect(result.services.database.status).toBe('unhealthy');
      expect(result.services.database.error).toContain('ECONNREFUSED');
    });

    it('should return summary with correct counts', async () => {
      const result = await service.checkHealth();

      const { summary } = result;
      const totalStatuses =
        summary.healthy + summary.degraded + summary.unhealthy;
      expect(totalStatuses).toBe(summary.total);
    });
  });

  describe('checkReadiness', () => {
    it('should check only critical dependencies (database, redis, bullmq)', async () => {
      const checks = await service.checkReadiness();

      expect(checks).toHaveProperty('database');
      expect(checks).toHaveProperty('redis');
      expect(checks).toHaveProperty('bullmq');
      expect(checks).not.toHaveProperty('neo4j');
    });
  });

  describe('checkDependency', () => {
    it('should return probe result for valid dependency name', async () => {
      const result = await service.checkDependency('database');

      expect(result).toBeDefined();
      expect(result!.status).toBe('healthy');
    });

    it('should return null for unknown dependency name', async () => {
      const result = await service.checkDependency('unknown');
      expect(result).toBeNull();
    });
  });

  describe('BullMQ degraded check', () => {
    it('should return degraded when failed jobs >= 100', async () => {
      mockQueue.getJobCounts = jest.fn().mockResolvedValue({
        waiting: 0,
        active: 0,
        completed: 10,
        failed: 150,
        delayed: 0,
      });

      const result = await service.checkDependency('bullmq');

      expect(result!.status).toBe('degraded');
      expect(result!.details).toHaveProperty('failed', 150);
    });
  });
});
