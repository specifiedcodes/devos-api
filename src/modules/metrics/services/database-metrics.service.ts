import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Gauge, Histogram } from 'prom-client';
import { DataSource } from 'typeorm';
import { MetricsService } from '../metrics.service';

/**
 * DatabaseMetricsService
 * Story 14.1: Prometheus Metrics Exporter (AC4)
 *
 * Collects TypeORM/PostgreSQL connection pool metrics via periodic polling (every 15 seconds).
 */
@Injectable()
export class DatabaseMetricsService {
  private readonly logger = new Logger(DatabaseMetricsService.name);

  private readonly poolSize: Gauge;
  private readonly poolActive: Gauge;
  private readonly poolIdle: Gauge;
  private readonly poolWaiting: Gauge;
  private readonly queryDuration: Histogram;

  constructor(
    private readonly metricsService: MetricsService,
    private readonly dataSource: DataSource,
  ) {
    const registry = this.metricsService.getRegistry();

    this.poolSize = new Gauge({
      name: 'devos_database_pool_size',
      help: 'Current database connection pool size',
      registers: [registry],
    });

    this.poolActive = new Gauge({
      name: 'devos_database_pool_active',
      help: 'Active database connections',
      registers: [registry],
    });

    this.poolIdle = new Gauge({
      name: 'devos_database_pool_idle',
      help: 'Idle database connections',
      registers: [registry],
    });

    this.poolWaiting = new Gauge({
      name: 'devos_database_pool_waiting',
      help: 'Queries waiting for a database connection',
      registers: [registry],
    });

    this.queryDuration = new Histogram({
      name: 'devos_database_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [registry],
    });
  }

  /**
   * Collect pool metrics every 15 seconds
   */
  @Interval(15000)
  async collectPoolMetrics(): Promise<void> {
    try {
      if (!this.dataSource.isInitialized) {
        this.setPoolMetricsToZero();
        return;
      }

      // Access the underlying pg pool through TypeORM's driver.
      // TypeORM does not expose pool stats in its public API, so we access
      // the internal pg Pool via driver.master (PostgresDriver internals).
      // The optional chaining + null check below guards against internal changes.
      const driver = this.dataSource.driver as any;
      const pool = driver?.master;

      if (pool) {
        this.poolSize.set(pool.totalCount ?? 0);
        this.poolActive.set(
          (pool.totalCount ?? 0) - (pool.idleCount ?? 0),
        );
        this.poolIdle.set(pool.idleCount ?? 0);
        this.poolWaiting.set(pool.waitingCount ?? 0);
      } else {
        this.setPoolMetricsToZero();
      }
    } catch (error) {
      this.logger.warn('Failed to collect database pool metrics', error);
      this.setPoolMetricsToZero();
    }
  }

  /**
   * Record a query duration observation
   * @param operation - The SQL operation type (select, insert, update, delete)
   * @param durationSeconds - Duration in seconds
   */
  recordQueryDuration(operation: string, durationSeconds: number): void {
    this.queryDuration.observe({ operation }, durationSeconds);
  }

  private setPoolMetricsToZero(): void {
    this.poolSize.set(0);
    this.poolActive.set(0);
    this.poolIdle.set(0);
    this.poolWaiting.set(0);
  }
}
