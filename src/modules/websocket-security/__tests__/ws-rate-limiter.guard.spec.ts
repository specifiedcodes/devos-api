import { Test, TestingModule } from '@nestjs/testing';
import { WsRateLimiterGuard } from '../guards/ws-rate-limiter.guard';
import { RedisService } from '../../redis/redis.service';
import { WS_REDIS_KEYS, WS_REDIS_TTLS } from '../ws-security.constants';

describe('WsRateLimiterGuard', () => {
  let guard: WsRateLimiterGuard;
  let redisService: jest.Mocked<RedisService>;
  let mockSocket: {
    id: string;
    emit: jest.Mock;
    disconnect: jest.Mock;
  };

  beforeEach(async () => {
    redisService = {
      zadd: jest.fn().mockResolvedValue(1),
      zrangebyscore: jest.fn().mockResolvedValue([]),
      zremrangebyscore: jest.fn().mockResolvedValue(0),
      zcard: jest.fn().mockResolvedValue(0),
      expire: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RedisService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsRateLimiterGuard,
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    guard = module.get<WsRateLimiterGuard>(WsRateLimiterGuard);

    mockSocket = {
      id: 'socket-1',
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
  });

  it('should allow messages under the rate limit', async () => {
    redisService.zcard.mockResolvedValue(99); // under 100 limit (before adding)

    const result = await guard.checkMessageRate(mockSocket);

    expect(result).toBe(true);
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('should warn on first violation (101st message)', async () => {
    // zcard returns 100 (at limit, before adding) then 1 for violation count
    redisService.zcard
      .mockResolvedValueOnce(100) // message count - at limit
      .mockResolvedValueOnce(1); // violation count - first violation

    const result = await guard.checkMessageRate(mockSocket);

    expect(result).toBe(false);
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'rate_limit:warning',
      expect.objectContaining({
        type: 'message',
        limit: 100,
        remaining: 0,
        resetAt: expect.any(Number),
      }),
    );
  });

  it('should drop messages on second violation', async () => {
    redisService.zcard
      .mockResolvedValueOnce(100) // message count - at limit
      .mockResolvedValueOnce(2); // violation count - second violation

    const result = await guard.checkMessageRate(mockSocket);

    expect(result).toBe(false);
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'rate_limit:exceeded',
      expect.objectContaining({
        type: 'message',
      }),
    );
  });

  it('should ban on third violation within 5 minutes', async () => {
    redisService.zcard
      .mockResolvedValueOnce(100) // message count - at limit
      .mockResolvedValueOnce(3); // violation count - third violation

    const result = await guard.checkMessageRate(mockSocket);

    expect(result).toBe(false);
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'rate_limit:banned',
      expect.objectContaining({
        type: 'message',
        banDuration: WS_REDIS_TTLS.BAN_DURATION,
      }),
    );
    expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    expect(redisService.set).toHaveBeenCalledWith(
      `${WS_REDIS_KEYS.BANNED}:socket-1`,
      '1',
      WS_REDIS_TTLS.BAN_DURATION,
    );
  });

  it('should enforce room join rate limit', async () => {
    redisService.zcard
      .mockResolvedValueOnce(50) // join count - at 50 limit
      .mockResolvedValueOnce(1); // violation count

    const result = await guard.checkJoinRate(mockSocket);

    expect(result).toBe(false);
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'rate_limit:warning',
      expect.objectContaining({
        type: 'join',
        limit: 50,
      }),
    );
  });

  it('should enforce broadcast rate limit per room', async () => {
    redisService.zcard
      .mockResolvedValueOnce(20) // broadcast count - at 20/sec limit
      .mockResolvedValueOnce(1); // violation count

    const result = await guard.checkBroadcastRate(
      mockSocket,
      'workspace:ws-1:kanban:board-1',
    );

    expect(result).toBe(false);
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'rate_limit:warning',
      expect.objectContaining({
        type: 'broadcast',
        limit: 20,
      }),
    );
  });

  it('should verify rate limit counters reset after window expires', async () => {
    // First check: at limit
    redisService.zcard
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(1);

    await guard.checkMessageRate(mockSocket);

    // After window: under limit (zremrangebyscore cleared old entries)
    redisService.zcard.mockResolvedValue(5);

    const result = await guard.checkMessageRate(mockSocket);

    expect(result).toBe(true);
  });

  it('should check if socket is banned', async () => {
    redisService.get.mockResolvedValue('1');

    const result = await guard.isBanned('socket-1');

    expect(result).toBe(true);
    expect(redisService.get).toHaveBeenCalledWith(
      `${WS_REDIS_KEYS.BANNED}:socket-1`,
    );
  });

  it('should return false for non-banned socket', async () => {
    redisService.get.mockResolvedValue(null);

    const result = await guard.isBanned('socket-2');

    expect(result).toBe(false);
  });

  it('should have different rate limits for different socket connections', async () => {
    const socket2 = { id: 'socket-2', emit: jest.fn(), disconnect: jest.fn() };

    redisService.zcard.mockResolvedValue(50); // under limit

    await guard.checkMessageRate(mockSocket);
    await guard.checkMessageRate(socket2);

    // Verify different keys used
    const zaddCalls = redisService.zadd.mock.calls;
    const keys = zaddCalls.map((call) => call[0]);
    expect(keys).toContain(`${WS_REDIS_KEYS.RATE_MSG}:socket-1`);
    expect(keys).toContain(`${WS_REDIS_KEYS.RATE_MSG}:socket-2`);
  });

  it('should include remaining count and resetAt in warning', async () => {
    redisService.zcard
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(1);

    await guard.checkMessageRate(mockSocket);

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'rate_limit:warning',
      expect.objectContaining({
        remaining: 0,
        resetAt: expect.any(Number),
      }),
    );
  });

  it('should clean up rate limit state on disconnect', async () => {
    await guard.cleanup('socket-1');

    expect(redisService.del).toHaveBeenCalledWith(
      `${WS_REDIS_KEYS.RATE_MSG}:socket-1`,
      `${WS_REDIS_KEYS.RATE_JOIN}:socket-1`,
      `${WS_REDIS_KEYS.VIOLATIONS}:socket-1`,
    );
  });
});
