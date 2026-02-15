import { Registry } from 'prom-client';
import { RedisMetricsService } from '../services/redis-metrics.service';
import { MetricsService } from '../metrics.service';
import { RedisService } from '../../redis/redis.service';

describe('RedisMetricsService', () => {
  let service: RedisMetricsService;
  let registry: Registry;
  let mockRedisService: {
    getConnectionStatus: jest.Mock;
    getInfo: jest.Mock;
  };

  const sampleRedisInfo = [
    '# Server',
    'redis_version:7.0.0',
    '',
    '# Clients',
    'connected_clients:5',
    '',
    '# Memory',
    'used_memory:2048000',
    '',
    '# Stats',
    'total_commands_processed:50000',
    'keyspace_hits:30000',
    'keyspace_misses:5000',
  ].join('\r\n');

  beforeEach(() => {
    registry = new Registry();
    const metricsService = {
      getRegistry: () => registry,
    } as MetricsService;

    mockRedisService = {
      getConnectionStatus: jest.fn().mockReturnValue(true),
      getInfo: jest.fn().mockResolvedValue(sampleRedisInfo),
    };

    service = new RedisMetricsService(
      metricsService,
      mockRedisService as unknown as RedisService,
    );
  });

  afterEach(async () => {
    await registry.clear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('collectRedisMetrics', () => {
    it('should set redis_connected gauge to 1 when Redis is connected', async () => {
      await service.collectRedisMetrics();

      const metrics = await registry.getMetricsAsJSON();
      const connected = metrics.find(
        (m) => m.name === 'devos_redis_connected',
      );
      expect((connected as any)?.values?.[0]?.value).toBe(1);
    });

    it('should set redis_connected gauge to 0 when Redis is disconnected', async () => {
      mockRedisService.getConnectionStatus.mockReturnValue(false);

      await service.collectRedisMetrics();

      const metrics = await registry.getMetricsAsJSON();
      const connected = metrics.find(
        (m) => m.name === 'devos_redis_connected',
      );
      expect((connected as any)?.values?.[0]?.value).toBe(0);
    });

    it('should collect memory_used_bytes from Redis INFO', async () => {
      await service.collectRedisMetrics();

      const metrics = await registry.getMetricsAsJSON();
      const memory = metrics.find(
        (m) => m.name === 'devos_redis_memory_used_bytes',
      );
      expect(memory).toBeDefined();
      expect((memory as any)?.values?.[0]?.value).toBe(2048000);
    });

    it('should collect commands_processed_total from Redis INFO', async () => {
      await service.collectRedisMetrics();

      const metrics = await registry.getMetricsAsJSON();
      const commands = metrics.find(
        (m) => m.name === 'devos_redis_commands_processed_total',
      );
      expect(commands).toBeDefined();
      expect((commands as any)?.values?.[0]?.value).toBe(50000);
    });

    it('should collect connected_clients from Redis INFO', async () => {
      await service.collectRedisMetrics();

      const metrics = await registry.getMetricsAsJSON();
      const clients = metrics.find(
        (m) => m.name === 'devos_redis_connected_clients',
      );
      expect(clients).toBeDefined();
      expect((clients as any)?.values?.[0]?.value).toBe(5);
    });

    it('should collect keyspace_hits and keyspace_misses from Redis INFO', async () => {
      await service.collectRedisMetrics();

      const metrics = await registry.getMetricsAsJSON();
      const hits = metrics.find(
        (m) => m.name === 'devos_redis_keyspace_hits_total',
      );
      const misses = metrics.find(
        (m) => m.name === 'devos_redis_keyspace_misses_total',
      );
      expect((hits as any)?.values?.[0]?.value).toBe(30000);
      expect((misses as any)?.values?.[0]?.value).toBe(5000);
    });

    it('should handle Redis INFO command failure gracefully', async () => {
      mockRedisService.getInfo.mockResolvedValue(null);

      await service.collectRedisMetrics();

      const metrics = await registry.getMetricsAsJSON();
      const connected = metrics.find(
        (m) => m.name === 'devos_redis_connected',
      );
      expect((connected as any)?.values?.[0]?.value).toBe(0);
    });

    it('should handle Redis service error gracefully', async () => {
      mockRedisService.getInfo.mockRejectedValue(
        new Error('Connection lost'),
      );

      await expect(
        service.collectRedisMetrics(),
      ).resolves.not.toThrow();

      const metrics = await registry.getMetricsAsJSON();
      const connected = metrics.find(
        (m) => m.name === 'devos_redis_connected',
      );
      expect((connected as any)?.values?.[0]?.value).toBe(0);
    });
  });
});
