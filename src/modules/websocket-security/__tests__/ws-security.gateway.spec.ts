import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { WsSecurityGateway } from '../ws-security.gateway';
import { WsRoomGuard } from '../guards/ws-room.guard';
import { WsRateLimiterGuard } from '../guards/ws-rate-limiter.guard';
import { WsTokenRefreshHandler } from '../handlers/ws-token-refresh.handler';
import { WsReconnectionService } from '../services/ws-reconnection.service';
import { WsMonitoringService } from '../services/ws-monitoring.service';
import { RedisService } from '../../redis/redis.service';

describe('WsSecurityGateway', () => {
  let gateway: WsSecurityGateway;
  let wsRoomGuard: jest.Mocked<WsRoomGuard>;
  let wsRateLimiterGuard: jest.Mocked<WsRateLimiterGuard>;
  let wsTokenRefreshHandler: jest.Mocked<WsTokenRefreshHandler>;
  let wsReconnectionService: jest.Mocked<WsReconnectionService>;
  let wsMonitoringService: jest.Mocked<WsMonitoringService>;
  let mockServer: { use: jest.Mock };
  let mockClient: {
    id: string;
    data: Record<string, unknown>;
    handshake: { address: string; query: Record<string, string> };
    emit: jest.Mock;
    join: jest.Mock;
    leave: jest.Mock;
    disconnect: jest.Mock;
  };

  beforeEach(async () => {
    wsRoomGuard = {
      handleJoin: jest.fn().mockResolvedValue(true),
      isValidRoomFormat: jest.fn().mockReturnValue(true),
      extractWorkspaceId: jest.fn().mockReturnValue('ws-1'),
    } as unknown as jest.Mocked<WsRoomGuard>;

    wsRateLimiterGuard = {
      checkMessageRate: jest.fn().mockResolvedValue(true),
      checkJoinRate: jest.fn().mockResolvedValue(true),
      cleanup: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WsRateLimiterGuard>;

    wsTokenRefreshHandler = {
      handleRefresh: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn(),
    } as unknown as jest.Mocked<WsTokenRefreshHandler>;

    wsReconnectionService = {
      handleReconnection: jest.fn().mockResolvedValue(undefined),
      getTrackedRooms: jest.fn().mockResolvedValue([]),
      trackRoomSubscription: jest.fn().mockResolvedValue(undefined),
      removeRoomSubscription: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WsReconnectionService>;

    wsMonitoringService = {
      onConnect: jest.fn().mockResolvedValue(undefined),
      onDisconnect: jest.fn().mockResolvedValue(undefined),
      recordMessage: jest.fn(),
      recordRoomJoin: jest.fn(),
      recordRateLimitEvent: jest.fn(),
      auditRoomJoin: jest.fn().mockResolvedValue(undefined),
      auditRoomLeave: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WsMonitoringService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsSecurityGateway,
        {
          provide: JwtService,
          useValue: { verifyAsync: jest.fn(), signAsync: jest.fn() },
        },
        {
          provide: RedisService,
          useValue: { get: jest.fn(), set: jest.fn() },
        },
        { provide: WsRoomGuard, useValue: wsRoomGuard },
        { provide: WsRateLimiterGuard, useValue: wsRateLimiterGuard },
        { provide: WsTokenRefreshHandler, useValue: wsTokenRefreshHandler },
        { provide: WsReconnectionService, useValue: wsReconnectionService },
        { provide: WsMonitoringService, useValue: wsMonitoringService },
      ],
    }).compile();

    gateway = module.get<WsSecurityGateway>(WsSecurityGateway);

    mockServer = { use: jest.fn() };

    mockClient = {
      id: 'socket-1',
      data: { userId: 'user-1', workspaceId: 'ws-1', role: 'owner' },
      handshake: { address: '192.168.1.1', query: {} },
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      disconnect: jest.fn(),
    };
  });

  it('should apply auth middleware on initialization', () => {
    gateway.afterInit(mockServer as any);

    expect(mockServer.use).toHaveBeenCalledWith(expect.any(Function));
  });

  it('should delegate join event to room guard', async () => {
    await gateway.handleJoin(mockClient as any, { room: 'workspace:ws-1:kanban:board-1' });

    expect(wsRoomGuard.handleJoin).toHaveBeenCalledWith(
      mockClient,
      'workspace:ws-1:kanban:board-1',
    );
  });

  it('should track room subscription after successful join', async () => {
    wsRoomGuard.handleJoin.mockResolvedValue(true);

    await gateway.handleJoin(mockClient as any, { room: 'workspace:ws-1:kanban:board-1' });

    expect(wsReconnectionService.trackRoomSubscription).toHaveBeenCalledWith(
      'socket-1',
      'workspace:ws-1:kanban:board-1',
    );
  });

  it('should leave event remove socket from room', async () => {
    await gateway.handleLeave(mockClient as any, { room: 'workspace:ws-1:kanban:board-1' });

    expect(mockClient.leave).toHaveBeenCalledWith(
      'workspace:ws-1:kanban:board-1',
    );
  });

  it('should delegate auth:refresh event to token refresh handler', async () => {
    await gateway.handleAuthRefresh(mockClient as any, {
      refreshToken: 'test-refresh-token',
    });

    expect(wsTokenRefreshHandler.handleRefresh).toHaveBeenCalledWith(
      mockClient,
      { refreshToken: 'test-refresh-token' },
    );
  });

  it('should clean up rate limit state on disconnect', async () => {
    await gateway.handleDisconnect(mockClient as any);

    expect(wsRateLimiterGuard.cleanup).toHaveBeenCalledWith('socket-1');
  });

  it('should update monitoring on disconnect (connection count decrement)', async () => {
    await gateway.handleDisconnect(mockClient as any);

    expect(wsMonitoringService.onDisconnect).toHaveBeenCalledWith('ws-1');
  });

  it('should invoke reconnection service for reconnecting clients', async () => {
    const reconnectClient = {
      ...mockClient,
      handshake: {
        address: '192.168.1.1',
        query: { lastEventTimestamp: '1000' },
      },
    };
    wsReconnectionService.getTrackedRooms.mockResolvedValue([
      'workspace:ws-1:kanban:board-1',
    ]);

    await gateway.handleConnection(reconnectClient as any);

    expect(wsReconnectionService.handleReconnection).toHaveBeenCalledWith(
      reconnectClient,
      1000,
      ['workspace:ws-1:kanban:board-1'],
    );
  });

  it('should apply rate limiter to join events', async () => {
    wsRateLimiterGuard.checkJoinRate.mockResolvedValue(false);

    await gateway.handleJoin(mockClient as any, { room: 'workspace:ws-1:kanban:board-1' });

    expect(wsRoomGuard.handleJoin).not.toHaveBeenCalled();
  });

  it('should record room join metrics on successful join', async () => {
    wsRoomGuard.handleJoin.mockResolvedValue(true);

    await gateway.handleJoin(mockClient as any, { room: 'workspace:ws-1:kanban:board-1' });

    expect(wsMonitoringService.recordRoomJoin).toHaveBeenCalledWith('success');
  });

  it('should record forbidden room join metrics on failed join', async () => {
    wsRoomGuard.handleJoin.mockResolvedValue(false);

    await gateway.handleJoin(mockClient as any, { room: 'workspace:ws-1:kanban:board-1' });

    expect(wsMonitoringService.recordRoomJoin).toHaveBeenCalledWith('forbidden');
  });
});
