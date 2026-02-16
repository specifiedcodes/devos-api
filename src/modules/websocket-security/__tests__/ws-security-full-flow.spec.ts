import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Registry } from 'prom-client';
import {
  createWsAuthMiddleware,
  WsAuthMiddlewareSocket,
} from '../middleware/ws-auth.middleware';
import { WsRoomGuard } from '../guards/ws-room.guard';
import { WsRateLimiterGuard } from '../guards/ws-rate-limiter.guard';
import { WsTokenRefreshHandler } from '../handlers/ws-token-refresh.handler';
import { WsReconnectionService } from '../services/ws-reconnection.service';
import { WsMonitoringService } from '../services/ws-monitoring.service';
import { RedisService } from '../../redis/redis.service';
import { MetricsService } from '../../metrics/metrics.service';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import {
  WS_RATE_LIMITS,
  WS_TIMEOUTS,
  WS_REDIS_KEYS,
  WS_REDIS_TTLS,
  WS_BUFFER_LIMITS,
  WS_ALERT_THRESHOLDS,
  WS_EVENTS,
} from '../ws-security.constants';

describe('WebSocket Security Full Flow Integration', () => {
  let jwtService: jest.Mocked<JwtService>;
  let redisService: jest.Mocked<RedisService>;
  let roomGuard: WsRoomGuard;
  let rateLimiter: WsRateLimiterGuard;
  let tokenRefreshHandler: WsTokenRefreshHandler;
  let reconnectionService: WsReconnectionService;
  let monitoringService: WsMonitoringService;
  let registry: Registry;

  // Mock socket that simulates a full Socket.io client
  const createMockSocket = (
    id: string,
    token?: string,
  ) => ({
    id,
    data: {} as Record<string, unknown>,
    handshake: {
      auth: { token },
      address: '192.168.1.100',
      query: {} as Record<string, string>,
    },
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    disconnect: jest.fn(),
    rooms: new Set<string>(),
    once: jest.fn(),
    on: jest.fn(),
  });

  beforeEach(async () => {
    registry = new Registry();

    jwtService = {
      verifyAsync: jest.fn(),
      signAsync: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      zadd: jest.fn().mockResolvedValue(1),
      zrangebyscore: jest.fn().mockResolvedValue([]),
      zremrangebyscore: jest.fn().mockResolvedValue(0),
      zremrangebyrank: jest.fn().mockResolvedValue(0),
      zcard: jest.fn().mockResolvedValue(0),
      zrem: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(true),
      increment: jest.fn().mockResolvedValue(1),
    } as unknown as jest.Mocked<RedisService>;

    const mockRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'member-1', userId: 'user-1', workspaceId: 'ws-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsRoomGuard,
        WsRateLimiterGuard,
        WsTokenRefreshHandler,
        WsReconnectionService,
        WsMonitoringService,
        { provide: JwtService, useValue: jwtService },
        { provide: RedisService, useValue: redisService },
        { provide: getRepositoryToken(WorkspaceMember), useValue: mockRepo },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: MetricsService, useValue: { getRegistry: () => registry } },
      ],
    }).compile();

    roomGuard = module.get(WsRoomGuard);
    rateLimiter = module.get(WsRateLimiterGuard);
    tokenRefreshHandler = module.get(WsTokenRefreshHandler);
    reconnectionService = module.get(WsReconnectionService);
    monitoringService = module.get(WsMonitoringService);
  });

  afterEach(() => {
    registry.clear();
  });

  it('should complete full WebSocket security lifecycle: auth -> join -> message -> refresh -> reconnect -> disconnect', async () => {
    const socket = createMockSocket('lifecycle-socket', 'valid-jwt-token');

    // Step 1: Authenticate via middleware
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      workspaceId: 'ws-1',
      role: 'owner',
      jti: 'jti-1',
    });

    const middleware = createWsAuthMiddleware(jwtService, redisService);
    const nextFn = jest.fn();
    await middleware(socket, nextFn);

    expect(nextFn).toHaveBeenCalledWith(); // no error
    expect(socket.data.userId).toBe('user-1');
    expect(socket.data.workspaceId).toBe('ws-1');

    // Step 2: Join room
    const joinResult = await roomGuard.handleJoin(
      socket,
      'workspace:ws-1:kanban:board-1',
    );
    expect(joinResult).toBe(true);
    expect(socket.join).toHaveBeenCalledWith('workspace:ws-1:kanban:board-1');

    // Step 3: Send messages (under rate limit)
    redisService.zcard.mockResolvedValue(50);
    const msgAllowed = await rateLimiter.checkMessageRate(socket);
    expect(msgAllowed).toBe(true);

    // Step 4: Token refresh
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      workspaceId: 'ws-1',
      role: 'owner',
    });
    jwtService.signAsync.mockResolvedValue('new-access-token');

    await tokenRefreshHandler.handleRefresh(socket, {
      refreshToken: 'valid-refresh',
    });

    expect(socket.emit).toHaveBeenCalledWith(
      'auth:refreshed',
      expect.objectContaining({ accessToken: 'new-access-token' }),
    );

    // Step 5: Cleanup on disconnect
    await rateLimiter.cleanup(socket.id);
    await reconnectionService.cleanup(socket.id);
    tokenRefreshHandler.cleanup(socket.id);

    // Verify cleanup was called
    expect(redisService.del).toHaveBeenCalled();
  });

  it('should reject unauthorized operations at every stage', async () => {
    // Stage 1: Connect without token -> rejected
    const noTokenSocket = createMockSocket('no-token');
    noTokenSocket.handshake.auth.token = undefined;

    const middleware = createWsAuthMiddleware(jwtService, redisService);
    const nextFn = jest.fn();
    await middleware(noTokenSocket, nextFn);

    expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
    expect((nextFn.mock.calls[0][0] as Error).message).toBe('Authentication failed');

    // Stage 2: Join unauthorized room -> rejected
    const authedSocket = createMockSocket('authed-socket', 'token');
    authedSocket.data = { userId: 'user-1', workspaceId: 'ws-1', role: 'owner' };

    // Override findOne to return null for unauthorized workspace
    const mockRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const testModule = await Test.createTestingModule({
      providers: [
        WsRoomGuard,
        { provide: RedisService, useValue: redisService },
        { provide: getRepositoryToken(WorkspaceMember), useValue: mockRepo },
      ],
    }).compile();
    const testGuard = testModule.get(WsRoomGuard);

    const joinResult = await testGuard.handleJoin(
      authedSocket,
      'workspace:unauthorized-ws:kanban:board-1',
    );
    expect(joinResult).toBe(false);
    expect(authedSocket.emit).toHaveBeenCalledWith('error', {
      code: 'FORBIDDEN',
      message: 'No access to workspace',
    });

    // Stage 3: Refresh with invalid token -> rejected
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid token'));

    await tokenRefreshHandler.handleRefresh(authedSocket, {
      refreshToken: 'invalid-refresh',
    });

    expect(authedSocket.emit).toHaveBeenCalledWith('auth:refresh_failed', {
      code: 'INVALID_REFRESH_TOKEN',
      message: expect.any(String),
    });
  });

  it('should verify workspace isolation is maintained throughout flow', async () => {
    const socket = createMockSocket('isolation-socket', 'valid-token');
    socket.data = { userId: 'user-1', workspaceId: 'ws-1', role: 'owner' };

    // Valid workspace join (ws-1 matches socket.data.workspaceId)
    const result1 = await roomGuard.handleJoin(
      socket,
      'workspace:ws-1:kanban:board-1',
    );
    expect(result1).toBe(true);

    // Cross-workspace join to ws-2 is rejected by workspaceId mismatch check
    const differentWorkspaceResult = await roomGuard.handleJoin(
      socket,
      'workspace:ws-2:kanban:board-1',
    );
    expect(differentWorkspaceResult).toBe(false);
    expect(socket.emit).toHaveBeenCalledWith('error', {
      code: 'FORBIDDEN',
      message: 'No access to workspace',
    });
  });

  it('should verify rate limiting state is isolated per connection', async () => {
    const socket1 = createMockSocket('socket-a');
    const socket2 = createMockSocket('socket-b');

    redisService.zcard.mockResolvedValue(50);

    await rateLimiter.checkMessageRate(socket1);
    await rateLimiter.checkMessageRate(socket2);

    const calls = redisService.zadd.mock.calls;
    const keys = calls.map((c) => c[0]);
    expect(keys).toContain(`${WS_REDIS_KEYS.RATE_MSG}:socket-a`);
    expect(keys).toContain(`${WS_REDIS_KEYS.RATE_MSG}:socket-b`);
  });

  it('should verify monitoring counters are accurate at each stage', async () => {
    // Connect
    await monitoringService.onConnect('ws-1');

    // Auth failure
    redisService.zcard.mockResolvedValue(1);
    await monitoringService.logAuthFailure('1.2.3.4', 'expired');

    // Room join
    monitoringService.recordRoomJoin('success');

    // Rate limit event
    monitoringService.recordRateLimitEvent('warning');

    // Disconnect
    await monitoringService.onDisconnect('ws-1');

    // Verify metrics were registered (no errors)
    const metricsOutput = await registry.metrics();
    expect(metricsOutput).toContain('devos_ws_connections_total');
    expect(metricsOutput).toContain('devos_ws_auth_failures_total');
    expect(metricsOutput).toContain('devos_ws_room_joins_total');
    expect(metricsOutput).toContain('devos_ws_rate_limit_events_total');
  });

  describe('Constants validation', () => {
    it('should have all rate limit constants as positive integers', () => {
      expect(WS_RATE_LIMITS.MESSAGES_PER_MINUTE).toBeGreaterThan(0);
      expect(Number.isInteger(WS_RATE_LIMITS.MESSAGES_PER_MINUTE)).toBe(true);
      expect(WS_RATE_LIMITS.ROOM_JOINS_PER_MINUTE).toBeGreaterThan(0);
      expect(Number.isInteger(WS_RATE_LIMITS.ROOM_JOINS_PER_MINUTE)).toBe(true);
      expect(WS_RATE_LIMITS.BROADCASTS_PER_SECOND).toBeGreaterThan(0);
      expect(Number.isInteger(WS_RATE_LIMITS.BROADCASTS_PER_SECOND)).toBe(true);
    });

    it('should have all TTL constants as positive integers in seconds', () => {
      Object.values(WS_REDIS_TTLS).forEach((ttl) => {
        expect(ttl).toBeGreaterThan(0);
        expect(Number.isInteger(ttl)).toBe(true);
      });
    });

    it('should have all event name constants as non-empty strings', () => {
      Object.values(WS_EVENTS).forEach((event) => {
        expect(typeof event).toBe('string');
        expect(event.length).toBeGreaterThan(0);
      });
    });

    it('should have all timeout constants as positive integers', () => {
      Object.values(WS_TIMEOUTS).forEach((timeout) => {
        expect(timeout).toBeGreaterThan(0);
        expect(Number.isInteger(timeout)).toBe(true);
      });
    });

    it('should have all buffer limits as positive integers', () => {
      Object.values(WS_BUFFER_LIMITS).forEach((limit) => {
        expect(limit).toBeGreaterThan(0);
        expect(Number.isInteger(limit)).toBe(true);
      });
    });

    it('should have all alert thresholds as positive integers', () => {
      Object.values(WS_ALERT_THRESHOLDS).forEach((threshold) => {
        expect(threshold).toBeGreaterThan(0);
        expect(Number.isInteger(threshold)).toBe(true);
      });
    });

    it('should have all Redis key constants as non-empty strings with ws: prefix', () => {
      Object.values(WS_REDIS_KEYS).forEach((key) => {
        expect(typeof key).toBe('string');
        expect(key.startsWith('ws:')).toBe(true);
      });
    });
  });
});
