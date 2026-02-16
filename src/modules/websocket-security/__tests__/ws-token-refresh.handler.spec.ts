import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { WsTokenRefreshHandler } from '../handlers/ws-token-refresh.handler';
import { RedisService } from '../../redis/redis.service';

describe('WsTokenRefreshHandler', () => {
  let handler: WsTokenRefreshHandler;
  let jwtService: jest.Mocked<JwtService>;
  let redisService: jest.Mocked<RedisService>;
  let mockSocket: {
    id: string;
    data: Record<string, unknown>;
    emit: jest.Mock;
    disconnect: jest.Mock;
  };

  beforeEach(async () => {
    jwtService = {
      verifyAsync: jest.fn(),
      signAsync: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    redisService = {
      get: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<RedisService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsTokenRefreshHandler,
        { provide: JwtService, useValue: jwtService },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    handler = module.get<WsTokenRefreshHandler>(WsTokenRefreshHandler);

    mockSocket = {
      id: 'socket-1',
      data: { userId: 'user-1', workspaceId: 'ws-1', role: 'owner' },
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
  });

  afterEach(() => {
    handler.cleanup('socket-1');
    jest.clearAllTimers();
  });

  it('should generate new access token on valid refresh', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      workspaceId: 'ws-1',
      role: 'owner',
      jti: 'refresh-jti',
    });
    jwtService.signAsync.mockResolvedValue('new-access-token');

    await handler.handleRefresh(mockSocket, {
      refreshToken: 'valid-refresh',
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('auth:refreshed', {
      accessToken: 'new-access-token',
      expiresIn: expect.any(Number),
    });
  });

  it('should update socket.data.userId after token refresh', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-new',
      workspaceId: 'ws-2',
      role: 'admin',
    });
    jwtService.signAsync.mockResolvedValue('new-token');

    await handler.handleRefresh(mockSocket, {
      refreshToken: 'valid-refresh',
    });

    expect(mockSocket.data.userId).toBe('user-new');
  });

  it('should update socket.data.workspaceId after token refresh', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      workspaceId: 'ws-updated',
      role: 'developer',
    });
    jwtService.signAsync.mockResolvedValue('new-token');

    await handler.handleRefresh(mockSocket, {
      refreshToken: 'valid-refresh',
    });

    expect(mockSocket.data.workspaceId).toBe('ws-updated');
  });

  it('should reject expired refresh token with INVALID_REFRESH_TOKEN', async () => {
    const error = new Error('jwt expired');
    error.name = 'TokenExpiredError';
    jwtService.verifyAsync.mockRejectedValue(error);

    await handler.handleRefresh(mockSocket, {
      refreshToken: 'expired-refresh',
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('auth:refresh_failed', {
      code: 'INVALID_REFRESH_TOKEN',
      message: expect.any(String),
    });
  });

  it('should reject malformed refresh token', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt malformed'));

    await handler.handleRefresh(mockSocket, {
      refreshToken: 'malformed-token',
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('auth:refresh_failed', {
      code: 'INVALID_REFRESH_TOKEN',
      message: expect.any(String),
    });
  });

  it('should emit auth:expiring event before token expiry', async () => {
    jest.useFakeTimers();

    const emitFn = jest.fn();
    const testSocket = {
      id: 'socket-timer-1',
      emit: emitFn,
      disconnect: jest.fn(),
    };

    // Schedule with a short expiry (10 seconds)
    handler.scheduleExpiryWarning(testSocket, 10);

    // The warning fires at max(0, expiresIn*1000 - 300000) = 0ms for 10s expiry
    jest.advanceTimersByTime(1);

    expect(emitFn).toHaveBeenCalledWith('auth:expiring', {
      expiresIn: expect.any(Number),
    });

    handler.cleanup('socket-timer-1');
    jest.useRealTimers();
  });

  it('should disconnect socket after token expiry + grace period', async () => {
    jest.useFakeTimers();

    const disconnectFn = jest.fn();
    const testSocket = {
      id: 'socket-grace-1',
      emit: jest.fn(),
      disconnect: disconnectFn,
    };

    // Schedule with short expiry: expiresIn = 0.1 seconds = 100ms
    // Grace timer fires at: 100ms + 60000ms = 60100ms
    handler.scheduleExpiryWarning(testSocket, 0);

    // Advance past grace period (0 + 60000ms)
    jest.advanceTimersByTime(61000);

    expect(disconnectFn).toHaveBeenCalledWith(true);

    handler.cleanup('socket-grace-1');
    jest.useRealTimers();
  });

  it('should keep socket connected if refresh is received within grace period', async () => {
    jest.useFakeTimers();

    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      workspaceId: 'ws-1',
      role: 'owner',
    });
    jwtService.signAsync.mockResolvedValue('refreshed-token');

    // Schedule expiry
    handler.scheduleExpiryWarning(mockSocket, 1);

    // Refresh before grace period expires
    jest.advanceTimersByTime(500);
    await handler.handleRefresh(mockSocket, {
      refreshToken: 'valid-refresh',
    });

    // Advance past original grace period
    jest.advanceTimersByTime(62000);

    // Should NOT have been disconnected because refresh cleared the timer
    expect(mockSocket.disconnect).not.toHaveBeenCalled();

    handler.cleanup('socket-1');
    jest.useRealTimers();
  });

  it('should reject blacklisted refresh token', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      workspaceId: 'ws-1',
      role: 'owner',
      jti: 'blacklisted-jti',
    });
    redisService.get.mockResolvedValue('1');

    await handler.handleRefresh(mockSocket, {
      refreshToken: 'blacklisted-refresh',
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('auth:refresh_failed', {
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Refresh token has been revoked',
    });
  });
});
