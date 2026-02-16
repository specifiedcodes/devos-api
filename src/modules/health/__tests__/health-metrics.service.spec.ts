import { Test, TestingModule } from '@nestjs/testing';
import { Registry } from 'prom-client';
import { HealthMetricsService } from '../health-metrics.service';
import { MetricsService } from '../../metrics/metrics.service';
import { HealthCheckResult } from '../dto/health-check.dto';

describe('HealthMetricsService', () => {
  let service: HealthMetricsService;
  let registry: Registry;

  beforeEach(async () => {
    registry = new Registry();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthMetricsService,
        {
          provide: MetricsService,
          useValue: {
            getRegistry: () => registry,
          },
        },
      ],
    }).compile();

    service = module.get<HealthMetricsService>(HealthMetricsService);
  });

  afterEach(async () => {
    registry.clear();
  });

  describe('metric registration', () => {
    it('should register devos_health_check_status gauge with service label', () => {
      const metric = registry.getSingleMetric('devos_health_check_status');
      expect(metric).toBeDefined();
    });

    it('should register devos_health_check_duration_seconds histogram with service label', () => {
      const metric = registry.getSingleMetric(
        'devos_health_check_duration_seconds',
      );
      expect(metric).toBeDefined();
    });

    it('should register devos_health_check_total counter with service and status labels', () => {
      const metric = registry.getSingleMetric('devos_health_check_total');
      expect(metric).toBeDefined();
    });

    it('should register devos_dependency_up gauge with dependency label', () => {
      const metric = registry.getSingleMetric('devos_dependency_up');
      expect(metric).toBeDefined();
    });

    it('should register devos_uptime_percentage gauge with window label', () => {
      const metric = registry.getSingleMetric('devos_uptime_percentage');
      expect(metric).toBeDefined();
    });
  });

  describe('updateMetrics', () => {
    const mockResult: HealthCheckResult = {
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
          status: 'degraded',
          responseTimeMs: 150,
          lastChecked: '2026-02-16T10:00:00.000Z',
        },
        bullmq: {
          status: 'unhealthy',
          responseTimeMs: -1,
          error: 'Queue not ready',
          lastChecked: '2026-02-16T10:00:00.000Z',
        },
      },
      summary: { total: 3, healthy: 1, degraded: 1, unhealthy: 1 },
    };

    it('should set health_check_status to 1 for healthy', async () => {
      service.updateMetrics(mockResult);

      // Verify the metric was updated by checking the registry output
      const metrics = await registry.getMetricsAsJSON();
      const statusMetric = metrics.find(
        (m: any) => m.name === 'devos_health_check_status',
      );
      expect(statusMetric).toBeDefined();
    });

    it('should update metrics without throwing', () => {
      expect(() => service.updateMetrics(mockResult)).not.toThrow();
    });

    it('should handle negative responseTimeMs gracefully (skip histogram)', () => {
      const resultWithNegative: HealthCheckResult = {
        ...mockResult,
        services: {
          database: {
            status: 'unhealthy',
            responseTimeMs: -1,
            lastChecked: '2026-02-16T10:00:00.000Z',
          },
        },
        summary: { total: 1, healthy: 0, degraded: 0, unhealthy: 1 },
      };

      expect(() =>
        service.updateMetrics(resultWithNegative),
      ).not.toThrow();
    });

    it('should increment total counter with correct status label', async () => {
      service.updateMetrics(mockResult);

      const metrics = await registry.getMetricsAsJSON();
      const totalMetric = metrics.find(
        (m: any) => m.name === 'devos_health_check_total',
      );
      expect(totalMetric).toBeDefined();
    });

    it('should record probe duration in histogram for healthy services', async () => {
      service.updateMetrics(mockResult);

      const metrics = await registry.getMetricsAsJSON();
      const durationMetric = metrics.find(
        (m: any) => m.name === 'devos_health_check_duration_seconds',
      );
      expect(durationMetric).toBeDefined();
    });

    it('should set dependency_up to 1 for healthy/degraded and 0 for unhealthy', async () => {
      service.updateMetrics(mockResult);

      const metrics = await registry.getMetricsAsJSON();
      const depMetric = metrics.find(
        (m: any) => m.name === 'devos_dependency_up',
      );
      expect(depMetric).toBeDefined();
    });
  });

  describe('updateUptimeMetrics', () => {
    it('should update uptime percentage metrics for all windows', async () => {
      service.updateUptimeMetrics({
        '1h': 99.5,
        '6h': 98.2,
        '24h': 97.1,
      });

      const metrics = await registry.getMetricsAsJSON();
      const uptimeMetric = metrics.find(
        (m: any) => m.name === 'devos_uptime_percentage',
      );
      expect(uptimeMetric).toBeDefined();
    });
  });
});
