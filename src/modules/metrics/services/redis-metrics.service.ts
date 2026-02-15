import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Counter, Gauge } from 'prom-client';
import { RedisService } from '../../redis/redis.service';
import { MetricsService } from '../metrics.service';

/**
 * RedisMetricsService
 * Story 14.1: Prometheus Metrics Exporter (AC5)
 *
 * Collects Redis metrics via INFO command on periodic basis (every 15 seconds).
 */
@Injectable()
export class RedisMetricsService {
  private readonly logger = new Logger(RedisMetricsService.name);

  private readonly redisConnected: Gauge;
  private readonly redisMemoryUsed: Gauge;
  private readonly redisCommandsProcessed: Gauge;
  private readonly redisConnectedClients: Gauge;
  private readonly redisKeyspaceHits: Gauge;
  private readonly redisKeyspaceMisses: Gauge;

  constructor(
    private readonly metricsService: MetricsService,
    private readonly redisService: RedisService,
  ) {
    const registry = this.metricsService.getRegistry();

    this.redisConnected = new Gauge({
      name: 'devos_redis_connected',
      help: 'Redis connection status (1=connected, 0=disconnected)',
      registers: [registry],
    });

    this.redisMemoryUsed = new Gauge({
      name: 'devos_redis_memory_used_bytes',
      help: 'Redis memory usage in bytes',
      registers: [registry],
    });

    this.redisCommandsProcessed = new Gauge({
      name: 'devos_redis_commands_processed_total',
      help: 'Total Redis commands processed',
      registers: [registry],
    });

    this.redisConnectedClients = new Gauge({
      name: 'devos_redis_connected_clients',
      help: 'Number of connected Redis clients',
      registers: [registry],
    });

    this.redisKeyspaceHits = new Gauge({
      name: 'devos_redis_keyspace_hits_total',
      help: 'Total Redis keyspace hits',
      registers: [registry],
    });

    this.redisKeyspaceMisses = new Gauge({
      name: 'devos_redis_keyspace_misses_total',
      help: 'Total Redis keyspace misses',
      registers: [registry],
    });
  }

  /**
   * Collect Redis metrics every 15 seconds
   */
  @Interval(15000)
  async collectRedisMetrics(): Promise<void> {
    try {
      const isConnected = this.redisService.getConnectionStatus();
      this.redisConnected.set(isConnected ? 1 : 0);

      if (!isConnected) {
        return;
      }

      const info = await this.redisService.getInfo();
      if (!info) {
        this.redisConnected.set(0);
        return;
      }

      this.parseAndSetMetrics(info);
    } catch (error) {
      this.logger.warn('Failed to collect Redis metrics', error);
      this.redisConnected.set(0);
    }
  }

  private parseAndSetMetrics(info: string): void {
    const usedMemory = this.extractInfoValue(info, 'used_memory');
    if (usedMemory !== null) {
      this.redisMemoryUsed.set(usedMemory);
    }

    const commandsProcessed = this.extractInfoValue(
      info,
      'total_commands_processed',
    );
    if (commandsProcessed !== null) {
      this.redisCommandsProcessed.set(commandsProcessed);
    }

    const connectedClients = this.extractInfoValue(info, 'connected_clients');
    if (connectedClients !== null) {
      this.redisConnectedClients.set(connectedClients);
    }

    const keyspaceHits = this.extractInfoValue(info, 'keyspace_hits');
    if (keyspaceHits !== null) {
      this.redisKeyspaceHits.set(keyspaceHits);
    }

    const keyspaceMisses = this.extractInfoValue(info, 'keyspace_misses');
    if (keyspaceMisses !== null) {
      this.redisKeyspaceMisses.set(keyspaceMisses);
    }
  }

  /**
   * Extracts a numeric value from Redis INFO output
   */
  private extractInfoValue(info: string, key: string): number | null {
    const regex = new RegExp(`^${key}:(\\d+)`, 'm');
    const match = info.match(regex);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
    return null;
  }
}
