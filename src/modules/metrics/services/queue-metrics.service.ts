import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Interval } from '@nestjs/schedule';
import { Queue } from 'bull';
import { Counter, Gauge, Histogram } from 'prom-client';
import { MetricsService } from '../metrics.service';

/**
 * QueueMetricsService
 * Story 14.1: Prometheus Metrics Exporter (AC6)
 *
 * Collects BullMQ queue metrics on periodic basis (every 15 seconds).
 */
@Injectable()
export class QueueMetricsService {
  private readonly logger = new Logger(QueueMetricsService.name);

  private readonly queueSize: Gauge;
  private readonly jobDuration: Histogram;
  private readonly jobsProcessed: Counter;

  constructor(
    private readonly metricsService: MetricsService,
    @InjectQueue('agent-tasks') private readonly agentQueue: Queue,
  ) {
    const registry = this.metricsService.getRegistry();

    this.queueSize = new Gauge({
      name: 'devos_bullmq_queue_size',
      help: 'Number of jobs in BullMQ queue by status',
      labelNames: ['queue_name', 'status'],
      registers: [registry],
    });

    this.jobDuration = new Histogram({
      name: 'devos_bullmq_job_duration_seconds',
      help: 'Duration of BullMQ jobs in seconds',
      labelNames: ['queue_name', 'job_type'],
      buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300, 600],
      registers: [registry],
    });

    this.jobsProcessed = new Counter({
      name: 'devos_bullmq_jobs_processed_total',
      help: 'Total number of processed BullMQ jobs',
      labelNames: ['queue_name', 'status'],
      registers: [registry],
    });
  }

  /**
   * Collect queue metrics every 15 seconds
   */
  @Interval(15000)
  async collectQueueMetrics(): Promise<void> {
    try {
      await this.collectQueueStats('agent-tasks', this.agentQueue);
    } catch (error) {
      this.logger.warn('Failed to collect BullMQ queue metrics', error);
    }
  }

  private async collectQueueStats(
    queueName: string,
    queue: Queue,
  ): Promise<void> {
    try {
      const counts = await queue.getJobCounts();

      this.queueSize.set(
        { queue_name: queueName, status: 'waiting' },
        counts.waiting || 0,
      );
      this.queueSize.set(
        { queue_name: queueName, status: 'active' },
        counts.active || 0,
      );
      this.queueSize.set(
        { queue_name: queueName, status: 'completed' },
        counts.completed || 0,
      );
      this.queueSize.set(
        { queue_name: queueName, status: 'failed' },
        counts.failed || 0,
      );
      this.queueSize.set(
        { queue_name: queueName, status: 'delayed' },
        counts.delayed || 0,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to collect queue stats for ${queueName}`,
        error,
      );
      // Set to 0 on error
      const statuses = ['waiting', 'active', 'completed', 'failed', 'delayed'];
      for (const status of statuses) {
        this.queueSize.set({ queue_name: queueName, status }, 0);
      }
    }
  }

  /**
   * Record a job completion with duration
   */
  recordJobCompletion(
    queueName: string,
    jobType: string,
    durationSeconds: number,
    status: 'completed' | 'failed',
  ): void {
    this.jobDuration.observe(
      { queue_name: queueName, job_type: jobType },
      durationSeconds,
    );
    this.jobsProcessed.inc({ queue_name: queueName, status });
  }
}
