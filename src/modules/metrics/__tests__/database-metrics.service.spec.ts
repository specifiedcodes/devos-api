import { Registry } from 'prom-client';
import { DatabaseMetricsService } from '../services/database-metrics.service';
import { MetricsService } from '../metrics.service';
import { DataSource } from 'typeorm';

describe('DatabaseMetricsService', () => {
  let service: DatabaseMetricsService;
  let registry: Registry;
  let mockDataSource: any;

  beforeEach(() => {
    registry = new Registry();
    const metricsService = {
      getRegistry: () => registry,
    } as MetricsService;

    mockDataSource = {
      isInitialized: true,
      driver: {
        master: {
          totalCount: 10,
          idleCount: 7,
          waitingCount: 2,
        },
      },
    };

    service = new DatabaseMetricsService(metricsService, mockDataSource as DataSource);
  });

  afterEach(async () => {
    await registry.clear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('collectPoolMetrics', () => {
    it('should collect pool_size gauge from TypeORM DataSource', async () => {
      await service.collectPoolMetrics();

      const metrics = await registry.getMetricsAsJSON();
      const poolSize = metrics.find(
        (m) => m.name === 'devos_database_pool_size',
      );
      expect(poolSize).toBeDefined();
      expect((poolSize as any)?.values?.[0]?.value).toBe(10);
    });

    it('should collect pool_active gauge from connection pool', async () => {
      await service.collectPoolMetrics();

      const metrics = await registry.getMetricsAsJSON();
      const poolActive = metrics.find(
        (m) => m.name === 'devos_database_pool_active',
      );
      expect(poolActive).toBeDefined();
      // active = totalCount - idleCount = 10 - 7 = 3
      expect((poolActive as any)?.values?.[0]?.value).toBe(3);
    });

    it('should collect pool_idle gauge from connection pool', async () => {
      await service.collectPoolMetrics();

      const metrics = await registry.getMetricsAsJSON();
      const poolIdle = metrics.find(
        (m) => m.name === 'devos_database_pool_idle',
      );
      expect(poolIdle).toBeDefined();
      expect((poolIdle as any)?.values?.[0]?.value).toBe(7);
    });

    it('should collect pool_waiting gauge from connection pool', async () => {
      await service.collectPoolMetrics();

      const metrics = await registry.getMetricsAsJSON();
      const poolWaiting = metrics.find(
        (m) => m.name === 'devos_database_pool_waiting',
      );
      expect(poolWaiting).toBeDefined();
      expect((poolWaiting as any)?.values?.[0]?.value).toBe(2);
    });

    it('should handle database unreachable gracefully (sets metrics to 0)', async () => {
      mockDataSource.isInitialized = false;

      await service.collectPoolMetrics();

      const metrics = await registry.getMetricsAsJSON();
      const poolSize = metrics.find(
        (m) => m.name === 'devos_database_pool_size',
      );
      expect((poolSize as any)?.values?.[0]?.value).toBe(0);
    });

    it('should handle missing pool gracefully', async () => {
      mockDataSource.driver = {};

      await service.collectPoolMetrics();

      const metrics = await registry.getMetricsAsJSON();
      const poolSize = metrics.find(
        (m) => m.name === 'devos_database_pool_size',
      );
      expect((poolSize as any)?.values?.[0]?.value).toBe(0);
    });
  });

  describe('recordQueryDuration', () => {
    it('should record query duration in histogram with operation label', async () => {
      service.recordQueryDuration('select', 0.045);

      const metricsText = await registry.metrics();
      expect(metricsText).toContain('devos_database_query_duration_seconds');
      expect(metricsText).toContain('operation="select"');
    });

    it('should handle different operation types', async () => {
      service.recordQueryDuration('insert', 0.01);
      service.recordQueryDuration('update', 0.02);
      service.recordQueryDuration('delete', 0.005);

      const metricsText = await registry.metrics();
      expect(metricsText).toContain('operation="insert"');
      expect(metricsText).toContain('operation="update"');
      expect(metricsText).toContain('operation="delete"');
    });
  });
});
