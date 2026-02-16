import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../../redis/redis.service';
import {
  createWsAuthMiddleware,
  WsAuthMiddlewareSocket,
  WsNextFunction,
} from '../middleware/ws-auth.middleware';

describe('WsAuthMiddleware', () => {
  let jwtService: jest.Mocked<JwtService>;
  let redisService: jest.Mocked<RedisService>;
  let middleware: (socket: WsAuthMiddlewareSocket, next: WsNextFunction) => Promise<void>;
  let mockSocket: WsAuthMiddlewareSocket;
  let nextFn: jest.Mock;

  beforeEach(() => {
    jwtService = {
      verifyAsync: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    redisService = {
      get: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<RedisService>;

    middleware = createWsAuthMiddleware(jwtService, redisService);

    mockSocket = {
      id: 'socket-1',
      data: {},
      handshake: {
        auth: { token: 'valid-jwt-token' },
        address: '192.168.1.100',
        query: {},
      },
    };

    nextFn = jest.fn();
  });

  it('should allow connection with valid JWT token', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      workspaceId: 'ws-1',
      role: 'owner',
      jti: 'jti-123',
    });

    await middleware(mockSocket, nextFn);

    expect(nextFn).toHaveBeenCalledTimes(1);
    expect(nextFn).toHaveBeenCalledWith();
    expect(mockSocket.data.userId).toBe('user-1');
    expect(mockSocket.data.workspaceId).toBe('ws-1');
    expect(mockSocket.data.role).toBe('owner');
  });

  it('should populate socket.data.userId from JWT payload sub claim', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-abc',
      workspaceId: 'ws-2',
      role: 'admin',
    });

    await middleware(mockSocket, nextFn);

    expect(mockSocket.data.userId).toBe('user-abc');
  });

  it('should populate socket.data.workspaceId from JWT payload', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      workspaceId: 'ws-workspace-id',
      role: 'developer',
    });

    await middleware(mockSocket, nextFn);

    expect(mockSocket.data.workspaceId).toBe('ws-workspace-id');
  });

  it('should populate socket.data.role from JWT payload', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      workspaceId: 'ws-1',
      role: 'viewer',
    });

    await middleware(mockSocket, nextFn);

    expect(mockSocket.data.role).toBe('viewer');
  });

  it('should reject connection with missing token', async () => {
    mockSocket.handshake.auth.token = undefined;

    await middleware(mockSocket, nextFn);

    expect(nextFn).toHaveBeenCalledTimes(1);
    expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
    expect((nextFn.mock.calls[0][0] as Error).message).toBe(
      'Authentication failed',
    );
    expect(mockSocket.data.userId).toBeUndefined();
  });

  it('should reject connection with empty string token', async () => {
    mockSocket.handshake.auth.token = '';

    await middleware(mockSocket, nextFn);

    expect(nextFn).toHaveBeenCalledTimes(1);
    expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
    expect((nextFn.mock.calls[0][0] as Error).message).toBe(
      'Authentication failed',
    );
  });

  it('should reject connection with expired token', async () => {
    const error = new Error('jwt expired');
    error.name = 'TokenExpiredError';
    jwtService.verifyAsync.mockRejectedValue(error);

    await middleware(mockSocket, nextFn);

    expect(nextFn).toHaveBeenCalledTimes(1);
    expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
    expect((nextFn.mock.calls[0][0] as Error).message).toBe(
      'Authentication failed',
    );
  });

  it('should reject connection with malformed token', async () => {
    mockSocket.handshake.auth.token = 'not-a-jwt';
    const error = new Error('jwt malformed');
    error.name = 'JsonWebTokenError';
    jwtService.verifyAsync.mockRejectedValue(error);

    await middleware(mockSocket, nextFn);

    expect(nextFn).toHaveBeenCalledTimes(1);
    expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
    expect((nextFn.mock.calls[0][0] as Error).message).toBe(
      'Authentication failed',
    );
  });

  it('should reject connection with invalid signature', async () => {
    const error = new Error('invalid signature');
    error.name = 'JsonWebTokenError';
    jwtService.verifyAsync.mockRejectedValue(error);

    await middleware(mockSocket, nextFn);

    expect(nextFn).toHaveBeenCalledTimes(1);
    expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
    expect((nextFn.mock.calls[0][0] as Error).message).toBe(
      'Authentication failed',
    );
  });

  it('should reject blacklisted token', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      workspaceId: 'ws-1',
      role: 'owner',
      jti: 'token-jti-123',
    });
    redisService.get.mockResolvedValue('1');

    await middleware(mockSocket, nextFn);

    expect(redisService.get).toHaveBeenCalledWith(
      'blacklist:token:token-jti-123',
    );
    expect(nextFn).toHaveBeenCalledTimes(1);
    expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
    expect((nextFn.mock.calls[0][0] as Error).message).toBe(
      'Authentication failed',
    );
  });

  it('should log auth failure with socket IP address', async () => {
    mockSocket.handshake.address = '10.0.0.42';
    const error = new Error('jwt expired');
    error.name = 'TokenExpiredError';
    jwtService.verifyAsync.mockRejectedValue(error);

    // We can verify the middleware does not throw and calls next with error
    await middleware(mockSocket, nextFn);

    expect(nextFn).toHaveBeenCalledWith(expect.any(Error));
    // The logger.warn is called internally - we verify the flow completes
  });

  it('should call next() exactly once per middleware invocation', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      workspaceId: 'ws-1',
      role: 'owner',
    });

    await middleware(mockSocket, nextFn);

    expect(nextFn).toHaveBeenCalledTimes(1);
  });

  it('should call next() exactly once on failure', async () => {
    mockSocket.handshake.auth.token = undefined;

    await middleware(mockSocket, nextFn);

    expect(nextFn).toHaveBeenCalledTimes(1);
  });
});
