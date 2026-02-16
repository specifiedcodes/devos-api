import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { RedisService } from '../redis/redis.service';
import {
  HealthProbeResult,
  HealthCheckResult,
} from './dto/health-check.dto';

/**
 * HealthCheckService
 * Story 14.5: Health Check Dashboard (AC2)
 *
 * Wraps individual dependency probes with configurable timeouts.
 * Each probe is wrapped in Promise.race() with a timeout.
 * Probes run in parallel via Promise.allSettled().
 * Results are cached for 10 seconds to prevent probe storms.
 */
@Injectable()
export class HealthCheckService {
  private readonly logger = new Logger(HealthCheckService.name);
  private readonly probeTimeout: number;
  private readonly cacheTtlMs: number;
  private cachedResult: HealthCheckResult | null = null;
  private cacheTimestamp = 0;

  // Lazily-initialized Neo4j driver (reused across probes)
  private neo4jDriver: any = null;

  // Thresholds for response time categorization
  private readonly thresholds = {
    database: { degraded: 100, unhealthy: 500 },
    redis: { degraded: 50, unhealthy: 200 },
    bullmq: { failedJobThreshold: 100 },
    neo4j: { degraded: 200, unhealthy: 1000 },
  };

  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    @InjectQueue('agent-tasks') private readonly agentQueue: Queue,
    private readonly configService: ConfigService,
  ) {
    this.probeTimeout = this.configService.get<number>(
      'HEALTH_PROBE_TIMEOUT_MS',
      5000,
    );
    this.cacheTtlMs = this.configService.get<number>(
      'HEALTH_CACHE_TTL_MS',
      10000,
    );
  }

  /**
   * Run all health probes and return comprehensive result.
   * Results are cached for cacheTtlMs to prevent probe storms.
   */
  async checkHealth(): Promise<HealthCheckResult> {
    const now = Date.now();

    // Return cached result if within TTL
    if (this.cachedResult && now - this.cacheTimestamp < this.cacheTtlMs) {
      return this.cachedResult;
    }

    const timestamp = new Date().toISOString();
    const probes = await Promise.allSettled([
      this.probeDatabase(),
      this.probeRedis(),
      this.probeBullMQ(),
      this.probeNeo4j(),
    ]);

    const services: Record<string, HealthProbeResult> = {};
    const probeNames = ['database', 'redis', 'bullmq', 'neo4j'];

    probes.forEach((result, index) => {
      const name = probeNames[index];
      if (result.status === 'fulfilled') {
        services[name] = result.value;
      } else {
        services[name] = {
          status: 'unhealthy',
          responseTimeMs: -1,
          error: result.reason?.message || 'Probe failed',
          lastChecked: timestamp,
        };
      }
    });

    // Calculate summary
    const summary = {
      total: probeNames.length,
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
    };

    for (const probe of Object.values(services)) {
      summary[probe.status]++;
    }

    // Overall status = worst individual status
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (summary.unhealthy > 0) {
      overallStatus = 'unhealthy';
    } else if (summary.degraded > 0) {
      overallStatus = 'degraded';
    }

    const result: HealthCheckResult = {
      status: overallStatus,
      timestamp,
      uptime: process.uptime(),
      version: process.env.npm_package_version || '0.1.0',
      services,
      summary,
    };

    // Cache the result
    this.cachedResult = result;
    this.cacheTimestamp = now;

    return result;
  }

  /**
   * Check only critical dependencies (for readiness probe).
   * Returns subset: database, redis, bullmq.
   */
  async checkReadiness(): Promise<Record<string, HealthProbeResult>> {
    const probes = await Promise.allSettled([
      this.probeDatabase(),
      this.probeRedis(),
      this.probeBullMQ(),
    ]);

    const timestamp = new Date().toISOString();
    const checks: Record<string, HealthProbeResult> = {};
    const probeNames = ['database', 'redis', 'bullmq'];

    probes.forEach((result, index) => {
      const name = probeNames[index];
      if (result.status === 'fulfilled') {
        checks[name] = result.value;
      } else {
        checks[name] = {
          status: 'unhealthy',
          responseTimeMs: -1,
          error: result.reason?.message || 'Probe failed',
          lastChecked: timestamp,
        };
      }
    });

    return checks;
  }

  /**
   * Check a single dependency by name.
   */
  async checkDependency(name: string): Promise<HealthProbeResult | null> {
    switch (name) {
      case 'database':
        return this.probeDatabase();
      case 'redis':
        return this.probeRedis();
      case 'bullmq':
        return this.probeBullMQ();
      case 'neo4j':
        return this.probeNeo4j();
      default:
        return null;
    }
  }

  /**
   * Wrap a probe function with a timeout using Promise.race().
   */
  private async withTimeout<T>(
    probe: Promise<T>,
    timeoutMs: number = this.probeTimeout,
  ): Promise<T> {
    return Promise.race([
      probe,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Probe timeout')), timeoutMs),
      ),
    ]);
  }

  /**
   * PostgreSQL probe: SELECT 1 via TypeORM DataSource.
   * Healthy: < 100ms, Degraded: < 500ms, Unhealthy: timeout or error.
   */
  private async probeDatabase(): Promise<HealthProbeResult> {
    const startTime = Date.now();
    try {
      await this.withTimeout(this.dataSource.query('SELECT 1'));
      const responseTimeMs = Date.now() - startTime;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (responseTimeMs >= this.thresholds.database.unhealthy) {
        status = 'unhealthy';
      } else if (responseTimeMs >= this.thresholds.database.degraded) {
        status = 'degraded';
      }

      return {
        status,
        responseTimeMs,
        lastChecked: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        status: 'unhealthy',
        responseTimeMs: Date.now() - startTime,
        error: err?.message || 'Database probe failed',
        lastChecked: new Date().toISOString(),
      };
    }
  }

  /**
   * Redis probe: PING via RedisService.
   * Healthy: < 50ms, Degraded: < 200ms, Unhealthy: timeout or error.
   */
  private async probeRedis(): Promise<HealthProbeResult> {
    const startTime = Date.now();
    try {
      const isHealthy = await this.withTimeout(this.redisService.healthCheck());
      const responseTimeMs = Date.now() - startTime;

      if (!isHealthy) {
        return {
          status: 'unhealthy',
          responseTimeMs,
          error: 'Redis PING failed',
          lastChecked: new Date().toISOString(),
        };
      }

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (responseTimeMs >= this.thresholds.redis.unhealthy) {
        status = 'unhealthy';
      } else if (responseTimeMs >= this.thresholds.redis.degraded) {
        status = 'degraded';
      }

      return {
        status,
        responseTimeMs,
        lastChecked: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        status: 'unhealthy',
        responseTimeMs: Date.now() - startTime,
        error: err?.message || 'Redis probe failed',
        lastChecked: new Date().toISOString(),
      };
    }
  }

  /**
   * BullMQ probe: Queue isReady() + job counts.
   * Healthy: Queue ready, failed < 100. Degraded: Queue ready, failed >= 100. Unhealthy: not ready.
   */
  private async probeBullMQ(): Promise<HealthProbeResult> {
    const startTime = Date.now();
    try {
      await this.withTimeout(this.agentQueue.isReady());
      const jobCounts = await this.withTimeout(this.agentQueue.getJobCounts());
      const responseTimeMs = Date.now() - startTime;

      const failedCount = jobCounts.failed || 0;
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (failedCount >= this.thresholds.bullmq.failedJobThreshold) {
        status = 'degraded';
      }

      return {
        status,
        responseTimeMs,
        details: {
          waiting: jobCounts.waiting || 0,
          active: jobCounts.active || 0,
          completed: jobCounts.completed || 0,
          failed: failedCount,
          delayed: jobCounts.delayed || 0,
        },
        lastChecked: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        status: 'unhealthy',
        responseTimeMs: Date.now() - startTime,
        error: err?.message || 'BullMQ probe failed',
        lastChecked: new Date().toISOString(),
      };
    }
  }

  /**
   * Get or lazily create the Neo4j driver instance (reused across probes).
   * The driver manages its own connection pool, so we only need one.
   */
  private async getNeo4jDriver(): Promise<any> {
    if (this.neo4jDriver) {
      return this.neo4jDriver;
    }

    const neo4j = await import('neo4j-driver');
    const uri = this.configService.get<string>(
      'NEO4J_URI',
      'bolt://localhost:7687',
    );
    const user = this.configService.get<string>('NEO4J_USER', 'neo4j');
    const password = this.configService.get<string>(
      'NEO4J_PASSWORD',
      'neo4j_password',
    );

    this.neo4jDriver = neo4j.default.driver(
      uri,
      neo4j.default.auth.basic(user, password),
    );

    return this.neo4jDriver;
  }

  /**
   * Neo4j probe: RETURN 1 via neo4j-driver session.
   * Healthy: < 200ms, Degraded: < 1000ms, Unhealthy: timeout or error.
   * Reuses a single Neo4j driver instance to avoid connection churn.
   */
  private async probeNeo4j(): Promise<HealthProbeResult> {
    const startTime = Date.now();
    let session: any;

    try {
      const driver = await this.getNeo4jDriver();
      session = driver.session();
      await this.withTimeout(session.run('RETURN 1'));
      const responseTimeMs = Date.now() - startTime;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (responseTimeMs >= this.thresholds.neo4j.unhealthy) {
        status = 'unhealthy';
      } else if (responseTimeMs >= this.thresholds.neo4j.degraded) {
        status = 'degraded';
      }

      return {
        status,
        responseTimeMs,
        lastChecked: new Date().toISOString(),
      };
    } catch (err: any) {
      // If the driver itself is broken, reset it so a fresh one is created next time
      this.neo4jDriver = null;
      return {
        status: 'unhealthy',
        responseTimeMs: Date.now() - startTime,
        error: err?.message || 'Neo4j probe failed',
        lastChecked: new Date().toISOString(),
      };
    } finally {
      try {
        if (session) await session.close();
      } catch {
        // Ignore session cleanup errors
      }
    }
  }
}
