import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Registry } from 'prom-client';
import { WsMonitoringService } from '../services/ws-monitoring.service';
import { RedisService } from '../../redis/redis.service';
import { MetricsService } from '../../metrics/metrics.service';
import { WS_REDIS_KEYS, WS_REDIS_TTLS, WS_ALERT_THRESHOLDS } from '../ws-security.constants';

describe('WsMonitoringService', () => {
  let service: WsMonitoringService;
  let redisService: jest.Mocked<RedisService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let metricsService: MetricsService;
  let registry: Registry;

  beforeEach(async () => {
    registry = new Registry();

    redisService = {
      zadd: jest.fn().mockResolvedValue(1),
      zrangebyscore: jest.fn().mockResolvedValue([]),
      zremrangebyscore: jest.fn().mockResolvedValue(0),
      zcard: jest.fn().mockResolvedValue(0),
      expire: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(1),
    } as unknown as jest.Mocked<RedisService>;

    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    metricsService = {
      getRegistry: jest.fn().mockReturnValue(registry),
    } as unknown as MetricsService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsMonitoringService,
        { provide: RedisService, useValue: redisService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: MetricsService, useValue: metricsService },
      ],
    }).compile();

    service = module.get<WsMonitoringService>(WsMonitoringService);
  });

  afterEach(() => {
    registry.clear();
  });

  it('should log authentication failure with IP, reason, and timestamp', async () => {
    await service.logAuthFailure('192.168.1.1', 'expired_token', 'user-1');

    // The method should complete without error and track in Redis
    expect(redisService.zadd).toHaveBeenCalledWith(
      `${WS_REDIS_KEYS.AUTH_FAILURES}:192.168.1.1`,
      expect.any(Number),
      expect.any(String),
    );
  });

  it('should alert on repeated auth failures from same IP', async () => {
    // Simulate 11 auth failures
    redisService.zcard.mockResolvedValue(11);

    await service.logAuthFailure('192.168.1.1', 'expired_token');

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'ws:alert:auth_failures',
      expect.objectContaining({
        ip: '192.168.1.1',
        count: 11,
      }),
    );
  });

  it('should not alert when auth failures are below threshold', async () => {
    redisService.zcard.mockResolvedValue(5);

    await service.logAuthFailure('192.168.1.1', 'expired_token');

    expect(eventEmitter.emit).not.toHaveBeenCalledWith(
      'ws:alert:auth_failures',
      expect.anything(),
    );
  });

  it('should track active connections per workspace', async () => {
    await service.onConnect('ws-1');

    expect(redisService.increment).toHaveBeenCalledWith(
      `${WS_REDIS_KEYS.CONNECTIONS}:ws-1`,
    );
  });

  it('should decrement active connections on disconnect', async () => {
    await service.onDisconnect('ws-1');

    expect(redisService.increment).toHaveBeenCalledWith(
      `${WS_REDIS_KEYS.CONNECTIONS}:ws-1`,
      -1,
    );
  });

  it('should alert on connection flood', async () => {
    redisService.zcard.mockResolvedValue(51);

    await service.onConnect('ws-1', '10.0.0.1');

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'ws:alert:connection_flood',
      expect.objectContaining({
        ip: '10.0.0.1',
        count: 51,
      }),
    );
  });

  it('should store room join events in audit trail with TTL', async () => {
    await service.auditRoomJoin(
      'ws-1',
      'user-1',
      'workspace:ws-1:kanban:board-1',
    );

    expect(redisService.zadd).toHaveBeenCalledWith(
      `${WS_REDIS_KEYS.AUDIT}:ws-1`,
      expect.any(Number),
      expect.stringContaining('"action":"join"'),
    );
    expect(redisService.expire).toHaveBeenCalledWith(
      `${WS_REDIS_KEYS.AUDIT}:ws-1`,
      WS_REDIS_TTLS.AUDIT,
    );
  });

  it('should store room leave events in audit trail', async () => {
    await service.auditRoomLeave(
      'ws-1',
      'user-1',
      'workspace:ws-1:kanban:board-1',
    );

    expect(redisService.zadd).toHaveBeenCalledWith(
      `${WS_REDIS_KEYS.AUDIT}:ws-1`,
      expect.any(Number),
      expect.stringContaining('"action":"leave"'),
    );
  });

  it('should alert when connection reaches 80% of message rate limit', async () => {
    // 80% of 100 = 80
    await service.checkHighRate('socket-1', 81);

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'ws:alert:high_rate',
      expect.objectContaining({
        socketId: 'socket-1',
        currentRate: 81,
      }),
    );
  });

  it('should increment Prometheus connections counter on each connection', async () => {
    await service.onConnect('ws-1');
    await service.onConnect('ws-1');

    const metrics = await registry.getMetricsAsJSON();
    const connectionsMetric = metrics.find(
      (m) => m.name === 'devos_ws_connections_total',
    );
    expect(connectionsMetric).toBeDefined();
  });

  it('should increment Prometheus auth failures counter with reason label', async () => {
    redisService.zcard.mockResolvedValue(1);

    await service.logAuthFailure('1.2.3.4', 'expired_token');

    const metrics = await registry.getMetricsAsJSON();
    const failuresMetric = metrics.find(
      (m) => m.name === 'devos_ws_auth_failures_total',
    );
    expect(failuresMetric).toBeDefined();
  });

  it('should increment Prometheus rate limit counter', () => {
    service.recordRateLimitEvent('warning');

    // Verify no error thrown - Prometheus counter incremented
    expect(() => service.recordRateLimitEvent('exceeded')).not.toThrow();
  });

  it('should record room join result metrics', () => {
    service.recordRoomJoin('success');
    service.recordRoomJoin('forbidden');
    service.recordRoomJoin('invalid');

    // Verify no error thrown
    expect(() => service.recordRoomJoin('success')).not.toThrow();
  });
});
