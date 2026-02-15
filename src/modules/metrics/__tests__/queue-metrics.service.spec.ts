import { Registry } from 'prom-client';
import { QueueMetricsService } from '../services/queue-metrics.service';
import { MetricsService } from '../metrics.service';

describe('QueueMetricsService', () => {
  let service: QueueMetricsService;
  let registry: Registry;
  let mockQueue: any;

  beforeEach(() => {
    registry = new Registry();
    const metricsService = {
      getRegistry: () => registry,
    } as MetricsService;

    mockQueue = {
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 1,
      }),
    };

    service = new QueueMetricsService(metricsService, mockQueue);
  });

  afterEach(async () => {
    await registry.clear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('collectQueueMetrics', () => {
    it('should collect queue_size gauge with waiting status', async () => {
      await service.collectQueueMetrics();

      const metrics = await registry.getMetricsAsJSON();
      const queueSize = metrics.find(
        (m) => m.name === 'devos_bullmq_queue_size',
      );
      expect(queueSize).toBeDefined();
      const waitingValue = (queueSize as any)?.values?.find(
        (v: any) =>
          v.labels.queue_name === 'agent-tasks' &&
          v.labels.status === 'waiting',
      );
      expect(waitingValue?.value).toBe(5);
    });

    it('should collect queue_size gauge with active status', async () => {
      await service.collectQueueMetrics();

      const metrics = await registry.getMetricsAsJSON();
      const queueSize = metrics.find(
        (m) => m.name === 'devos_bullmq_queue_size',
      );
      const activeValue = (queueSize as any)?.values?.find(
        (v: any) =>
          v.labels.queue_name === 'agent-tasks' &&
          v.labels.status === 'active',
      );
      expect(activeValue?.value).toBe(2);
    });

    it('should collect queue_size gauge with completed status', async () => {
      await service.collectQueueMetrics();

      const metrics = await registry.getMetricsAsJSON();
      const queueSize = metrics.find(
        (m) => m.name === 'devos_bullmq_queue_size',
      );
      const completedValue = (queueSize as any)?.values?.find(
        (v: any) =>
          v.labels.queue_name === 'agent-tasks' &&
          v.labels.status === 'completed',
      );
      expect(completedValue?.value).toBe(100);
    });

    it('should collect queue_size gauge with failed status', async () => {
      await service.collectQueueMetrics();

      const metrics = await registry.getMetricsAsJSON();
      const queueSize = metrics.find(
        (m) => m.name === 'devos_bullmq_queue_size',
      );
      const failedValue = (queueSize as any)?.values?.find(
        (v: any) =>
          v.labels.queue_name === 'agent-tasks' &&
          v.labels.status === 'failed',
      );
      expect(failedValue?.value).toBe(3);
    });

    it('should collect queue_size gauge with delayed status', async () => {
      await service.collectQueueMetrics();

      const metrics = await registry.getMetricsAsJSON();
      const queueSize = metrics.find(
        (m) => m.name === 'devos_bullmq_queue_size',
      );
      const delayedValue = (queueSize as any)?.values?.find(
        (v: any) =>
          v.labels.queue_name === 'agent-tasks' &&
          v.labels.status === 'delayed',
      );
      expect(delayedValue?.value).toBe(1);
    });

    it('should handle queue access errors gracefully', async () => {
      mockQueue.getJobCounts.mockRejectedValue(
        new Error('Queue unavailable'),
      );

      await expect(
        service.collectQueueMetrics(),
      ).resolves.not.toThrow();

      const metrics = await registry.getMetricsAsJSON();
      const queueSize = metrics.find(
        (m) => m.name === 'devos_bullmq_queue_size',
      );
      // All statuses should be set to 0 on error
      const waitingValue = (queueSize as any)?.values?.find(
        (v: any) =>
          v.labels.queue_name === 'agent-tasks' &&
          v.labels.status === 'waiting',
      );
      expect(waitingValue?.value).toBe(0);
    });
  });

  describe('recordJobCompletion', () => {
    it('should record job_duration_seconds when job completes', async () => {
      service.recordJobCompletion(
        'agent-tasks',
        'spawn_agent',
        45.5,
        'completed',
      );

      const metricsText = await registry.metrics();
      expect(metricsText).toContain('devos_bullmq_job_duration_seconds');
      expect(metricsText).toContain('queue_name="agent-tasks"');
      expect(metricsText).toContain('job_type="spawn_agent"');
    });

    it('should increment jobs_processed_total on job completion', async () => {
      service.recordJobCompletion(
        'agent-tasks',
        'spawn_agent',
        10,
        'completed',
      );

      const metricsText = await registry.metrics();
      expect(metricsText).toContain('devos_bullmq_jobs_processed_total');
      expect(metricsText).toContain('status="completed"');
    });

    it('should increment jobs_processed_total on job failure', async () => {
      service.recordJobCompletion(
        'agent-tasks',
        'spawn_agent',
        5,
        'failed',
      );

      const metricsText = await registry.metrics();
      expect(metricsText).toContain('devos_bullmq_jobs_processed_total');
      expect(metricsText).toContain('status="failed"');
    });
  });
});
