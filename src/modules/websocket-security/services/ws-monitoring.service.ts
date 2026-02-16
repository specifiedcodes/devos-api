import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Counter, Gauge } from 'prom-client';
import { RedisService } from '../../redis/redis.service';
import { MetricsService } from '../../metrics/metrics.service';
import {
  WS_REDIS_KEYS,
  WS_REDIS_TTLS,
  WS_ALERT_THRESHOLDS,
  WS_RATE_LIMITS,
} from '../ws-security.constants';

/**
 * WebSocket Monitoring and Alerting Service
 * Story 15.7: WebSocket Security Hardening (AC6)
 *
 * Handles authentication failure logging and alerting, connection
 * pattern tracking, anomaly detection, room audit trails, and
 * Prometheus metrics exposure.
 */
@Injectable()
export class WsMonitoringService {
  private readonly logger = new Logger(WsMonitoringService.name);

  // Prometheus metrics
  private readonly connectionsTotal: Counter;
  private readonly activeConnections: Gauge;
  private readonly messagesTotal: Counter;
  private readonly authFailuresTotal: Counter;
  private readonly roomJoinsTotal: Counter;
  private readonly rateLimitEventsTotal: Counter;

  constructor(
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly metricsService: MetricsService,
  ) {
    const registry = this.metricsService.getRegistry();

    this.connectionsTotal = new Counter({
      name: 'devos_ws_connections_total',
      help: 'Total WebSocket connections by status',
      labelNames: ['status'],
      registers: [registry],
    });

    this.activeConnections = new Gauge({
      name: 'devos_ws_active_connections',
      help: 'Current active WebSocket connections by workspace',
      labelNames: ['workspace'],
      registers: [registry],
    });

    this.messagesTotal = new Counter({
      name: 'devos_ws_messages_total',
      help: 'Total WebSocket messages processed by event type',
      labelNames: ['event_type'],
      registers: [registry],
    });

    this.authFailuresTotal = new Counter({
      name: 'devos_ws_auth_failures_total',
      help: 'WebSocket authentication failures by reason',
      labelNames: ['reason'],
      registers: [registry],
    });

    this.roomJoinsTotal = new Counter({
      name: 'devos_ws_room_joins_total',
      help: 'Room join operations by result',
      labelNames: ['result'],
      registers: [registry],
    });

    this.rateLimitEventsTotal = new Counter({
      name: 'devos_ws_rate_limit_events_total',
      help: 'Rate limit events by type',
      labelNames: ['type'],
      registers: [registry],
    });
  }

  /**
   * Logs an authentication failure and checks for alert thresholds.
   */
  async logAuthFailure(
    ip: string,
    reason: string,
    userId?: string,
  ): Promise<void> {
    this.logger.warn(
      `WebSocket auth failure: IP=${ip}, reason=${reason}, userId=${userId || 'unknown'}`,
    );

    // Increment Prometheus counter
    this.authFailuresTotal.inc({ reason });
    this.connectionsTotal.inc({ status: 'auth_failure' });

    // Track failures per IP in Redis
    const key = `${WS_REDIS_KEYS.AUTH_FAILURES}:${ip}`;
    const now = Date.now();
    await this.redisService.zadd(key, now, `${now}`);
    await this.redisService.expire(key, WS_ALERT_THRESHOLDS.AUTH_FAILURE_WINDOW);

    // Clean old entries
    await this.redisService.zremrangebyscore(
      key,
      '-inf',
      now - WS_ALERT_THRESHOLDS.AUTH_FAILURE_WINDOW * 1000,
    );

    // Check threshold
    const count = await this.redisService.zcard(key);
    if (count >= WS_ALERT_THRESHOLDS.AUTH_FAILURES_PER_IP) {
      this.eventEmitter.emit('ws:alert:auth_failures', {
        ip,
        count,
        window: WS_ALERT_THRESHOLDS.AUTH_FAILURE_WINDOW,
        timestamp: now,
      });
      this.logger.error(
        `ALERT: ${count} auth failures from IP ${ip} within ${WS_ALERT_THRESHOLDS.AUTH_FAILURE_WINDOW}s`,
      );
    }
  }

  /**
   * Tracks a successful connection.
   */
  async onConnect(workspaceId: string, ip?: string): Promise<void> {
    this.connectionsTotal.inc({ status: 'success' });
    this.activeConnections.inc({ workspace: workspaceId });

    // Track in Redis
    await this.redisService.increment(
      `${WS_REDIS_KEYS.CONNECTIONS}:${workspaceId}`,
    );

    // Check connection flood if IP provided
    if (ip) {
      await this.checkConnectionFlood(ip);
    }
  }

  /**
   * Tracks a disconnection.
   */
  async onDisconnect(workspaceId: string): Promise<void> {
    this.activeConnections.dec({ workspace: workspaceId });

    await this.redisService.increment(
      `${WS_REDIS_KEYS.CONNECTIONS}:${workspaceId}`,
      -1,
    );
  }

  /**
   * Records a message event.
   */
  recordMessage(eventType: string): void {
    this.messagesTotal.inc({ event_type: eventType });
  }

  /**
   * Records a room join result.
   */
  recordRoomJoin(result: 'success' | 'forbidden' | 'invalid'): void {
    this.roomJoinsTotal.inc({ result });
  }

  /**
   * Records a rate limit event.
   */
  recordRateLimitEvent(type: 'warning' | 'exceeded' | 'banned'): void {
    this.rateLimitEventsTotal.inc({ type });
    this.connectionsTotal.inc({ status: 'rate_limited' });
  }

  /**
   * Stores a room join event in the audit trail.
   */
  async auditRoomJoin(
    workspaceId: string,
    userId: string,
    room: string,
  ): Promise<void> {
    const key = `${WS_REDIS_KEYS.AUDIT}:${workspaceId}`;
    const entry = JSON.stringify({
      action: 'join',
      userId,
      room,
      timestamp: Date.now(),
    });

    await this.redisService.zadd(key, Date.now(), entry);
    await this.redisService.expire(key, WS_REDIS_TTLS.AUDIT);
  }

  /**
   * Stores a room leave event in the audit trail.
   */
  async auditRoomLeave(
    workspaceId: string,
    userId: string,
    room: string,
  ): Promise<void> {
    const key = `${WS_REDIS_KEYS.AUDIT}:${workspaceId}`;
    const entry = JSON.stringify({
      action: 'leave',
      userId,
      room,
      timestamp: Date.now(),
    });

    await this.redisService.zadd(key, Date.now(), entry);
    await this.redisService.expire(key, WS_REDIS_TTLS.AUDIT);
  }

  /**
   * Checks for high message rate (80% of limit) and alerts.
   */
  async checkHighRate(socketId: string, currentRate: number): Promise<void> {
    const threshold =
      WS_RATE_LIMITS.MESSAGES_PER_MINUTE *
      (WS_ALERT_THRESHOLDS.HIGH_RATE_PERCENT / 100);

    if (currentRate >= threshold) {
      this.eventEmitter.emit('ws:alert:high_rate', {
        socketId,
        currentRate,
        threshold,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Detects connection floods from a single IP.
   */
  private async checkConnectionFlood(ip: string): Promise<void> {
    const key = `${WS_REDIS_KEYS.CONN_TRACKING}:${ip}`;
    const now = Date.now();

    await this.redisService.zadd(key, now, `${now}`);
    await this.redisService.expire(
      key,
      WS_ALERT_THRESHOLDS.CONNECTION_FLOOD_WINDOW,
    );

    // Clean old entries
    await this.redisService.zremrangebyscore(
      key,
      '-inf',
      now - WS_ALERT_THRESHOLDS.CONNECTION_FLOOD_WINDOW * 1000,
    );

    const count = await this.redisService.zcard(key);
    if (count >= WS_ALERT_THRESHOLDS.CONNECTION_FLOOD) {
      this.eventEmitter.emit('ws:alert:connection_flood', {
        ip,
        count,
        window: WS_ALERT_THRESHOLDS.CONNECTION_FLOOD_WINDOW,
        timestamp: now,
      });
      this.logger.error(
        `ALERT: Connection flood detected from IP ${ip}: ${count} connections in ${WS_ALERT_THRESHOLDS.CONNECTION_FLOOD_WINDOW}s`,
      );
    }
  }
}
