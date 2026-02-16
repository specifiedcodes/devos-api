import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WsReconnectionService } from '../services/ws-reconnection.service';
import { WsRoomGuard } from '../guards/ws-room.guard';
import { RedisService } from '../../redis/redis.service';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { WS_REDIS_KEYS, WS_REDIS_TTLS } from '../ws-security.constants';

describe('WsReconnectionService', () => {
  let service: WsReconnectionService;
  let redisService: jest.Mocked<RedisService>;
  let wsRoomGuard: jest.Mocked<WsRoomGuard>;
  let mockSocket: {
    id: string;
    data: Record<string, unknown>;
    emit: jest.Mock;
    join: jest.Mock;
  };

  beforeEach(async () => {
    redisService = {
      zadd: jest.fn().mockResolvedValue(1),
      zrangebyscore: jest.fn().mockResolvedValue([]),
      zremrangebyscore: jest.fn().mockResolvedValue(0),
      zremrangebyrank: jest.fn().mockResolvedValue(0),
      zcard: jest.fn().mockResolvedValue(0),
      zrem: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RedisService>;

    const mockRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'member-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsReconnectionService,
        WsRoomGuard,
        { provide: RedisService, useValue: redisService },
        { provide: getRepositoryToken(WorkspaceMember), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<WsReconnectionService>(WsReconnectionService);
    wsRoomGuard = module.get(WsRoomGuard) as jest.Mocked<WsRoomGuard>;

    mockSocket = {
      id: 'socket-1',
      data: { userId: 'user-1', workspaceId: 'ws-1', role: 'owner' },
      emit: jest.fn(),
      join: jest.fn(),
    };
  });

  it('should store events in Redis sorted set with timestamp as score', async () => {
    const event = { event: 'kanban:update', data: { cardId: '1' } };
    const beforeTs = Date.now();

    await service.bufferEvent('workspace:ws-1:kanban:board-1', event);

    expect(redisService.zadd).toHaveBeenCalledWith(
      `${WS_REDIS_KEYS.EVENT_BUFFER}:workspace:ws-1:kanban:board-1`,
      expect.any(Number),
      expect.stringContaining('"event":"kanban:update"'),
    );

    const scoreArg = (redisService.zadd.mock.calls[0] as unknown[])[1] as number;
    expect(scoreArg).toBeGreaterThanOrEqual(beforeTs);
  });

  it('should prune events older than 5 minutes from buffer', async () => {
    const beforeTs = Date.now();

    await service.pruneBuffer('workspace:ws-1:kanban:board-1');

    expect(redisService.zremrangebyscore).toHaveBeenCalledWith(
      `${WS_REDIS_KEYS.EVENT_BUFFER}:workspace:ws-1:kanban:board-1`,
      '-inf',
      expect.any(Number),
    );

    const cutoff = (redisService.zremrangebyscore.mock.calls[0] as unknown[])[2] as number;
    // Cutoff should be approximately 5 minutes ago
    expect(cutoff).toBeLessThanOrEqual(beforeTs);
    expect(cutoff).toBeGreaterThan(beforeTs - 310000); // within ~5.1 min margin
  });

  it('should limit buffer to 500 events per room', async () => {
    redisService.zcard.mockResolvedValue(510);

    await service.enforceBufferLimit('workspace:ws-1:kanban:board-1');

    // Should remove the oldest 10 events (510 - 500 = 10, rank 0 to 9)
    expect(redisService.zremrangebyrank).toHaveBeenCalledWith(
      `${WS_REDIS_KEYS.EVENT_BUFFER}:workspace:ws-1:kanban:board-1`,
      0,
      9,
    );
  });

  it('should replay missed events on reconnection', async () => {
    const events = [
      JSON.stringify({
        event: 'kanban:update',
        data: { cardId: '1' },
        room: 'workspace:ws-1:kanban:board-1',
        timestamp: 1000,
      }),
      JSON.stringify({
        event: 'kanban:update',
        data: { cardId: '2' },
        room: 'workspace:ws-1:kanban:board-1',
        timestamp: 2000,
      }),
      JSON.stringify({
        event: 'kanban:move',
        data: { cardId: '3' },
        room: 'workspace:ws-1:kanban:board-1',
        timestamp: 3000,
      }),
      JSON.stringify({
        event: 'kanban:update',
        data: { cardId: '4' },
        room: 'workspace:ws-1:kanban:board-1',
        timestamp: 4000,
      }),
      JSON.stringify({
        event: 'kanban:delete',
        data: { cardId: '5' },
        room: 'workspace:ws-1:kanban:board-1',
        timestamp: 5000,
      }),
    ];

    redisService.zrangebyscore.mockResolvedValue(events);

    await service.handleReconnection(mockSocket, 500, [
      'workspace:ws-1:kanban:board-1',
    ]);

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'reconnection:replay_start',
      { room: 'workspace:ws-1:kanban:board-1', count: 5 },
    );
  });

  it('should emit reconnection:replay_start before replay with correct count', async () => {
    const events = [
      JSON.stringify({
        event: 'test',
        data: {},
        room: 'workspace:ws-1:kanban:board-1',
        timestamp: 1000,
      }),
      JSON.stringify({
        event: 'test2',
        data: {},
        room: 'workspace:ws-1:kanban:board-1',
        timestamp: 2000,
      }),
    ];
    redisService.zrangebyscore.mockResolvedValue(events);

    await service.handleReconnection(mockSocket, 500, [
      'workspace:ws-1:kanban:board-1',
    ]);

    const replayStartCall = mockSocket.emit.mock.calls.find(
      (call: unknown[]) => call[0] === 'reconnection:replay_start',
    );
    expect(replayStartCall).toBeDefined();
    expect(replayStartCall![1]).toEqual({
      room: 'workspace:ws-1:kanban:board-1',
      count: 2,
    });
  });

  it('should replay events in chronological order', async () => {
    const events = [
      JSON.stringify({
        event: 'first',
        data: { order: 1 },
        room: 'workspace:ws-1:kanban:board-1',
        timestamp: 1000,
      }),
      JSON.stringify({
        event: 'second',
        data: { order: 2 },
        room: 'workspace:ws-1:kanban:board-1',
        timestamp: 2000,
      }),
      JSON.stringify({
        event: 'third',
        data: { order: 3 },
        room: 'workspace:ws-1:kanban:board-1',
        timestamp: 3000,
      }),
    ];
    redisService.zrangebyscore.mockResolvedValue(events);

    await service.handleReconnection(mockSocket, 500, [
      'workspace:ws-1:kanban:board-1',
    ]);

    const eventCalls = mockSocket.emit.mock.calls.filter(
      (call: unknown[]) =>
        call[0] !== 'reconnection:replay_start' &&
        call[0] !== 'reconnection:replay_end',
    );
    expect(eventCalls[0][0]).toBe('first');
    expect(eventCalls[1][0]).toBe('second');
    expect(eventCalls[2][0]).toBe('third');
  });

  it('should emit reconnection:replay_end after replay', async () => {
    const events = [
      JSON.stringify({
        event: 'test',
        data: {},
        room: 'workspace:ws-1:kanban:board-1',
        timestamp: 1000,
      }),
    ];
    redisService.zrangebyscore.mockResolvedValue(events);

    await service.handleReconnection(mockSocket, 500, [
      'workspace:ws-1:kanban:board-1',
    ]);

    const replayEndCall = mockSocket.emit.mock.calls.find(
      (call: unknown[]) => call[0] === 'reconnection:replay_end',
    );
    expect(replayEndCall).toBeDefined();
    expect(replayEndCall![1]).toEqual({
      room: 'workspace:ws-1:kanban:board-1',
      count: 1,
    });
  });

  it('should re-validate workspace membership on reconnection', async () => {
    redisService.zrangebyscore.mockResolvedValue([]);

    // Spy on checkMembership
    const spy = jest.spyOn(wsRoomGuard, 'checkMembership');

    await service.handleReconnection(mockSocket, 500, [
      'workspace:ws-1:kanban:board-1',
    ]);

    expect(spy).toHaveBeenCalledWith('user-1', 'ws-1');
  });

  it('should restore room subscriptions from Redis on reconnection', async () => {
    redisService.zrangebyscore.mockResolvedValue([]);

    await service.handleReconnection(mockSocket, 500, [
      'workspace:ws-1:kanban:board-1',
    ]);

    expect(mockSocket.join).toHaveBeenCalledWith(
      'workspace:ws-1:kanban:board-1',
    );
  });

  it('should set room subscription tracking TTL', async () => {
    await service.trackRoomSubscription('socket-1', 'workspace:ws-1:kanban:board-1');

    expect(redisService.expire).toHaveBeenCalledWith(
      `${WS_REDIS_KEYS.ROOMS}:socket-1`,
      WS_REDIS_TTLS.ROOM_TRACKING,
    );
  });

  it('should not replay events if no lastEventTimestamp (fresh connection)', async () => {
    await service.handleReconnection(mockSocket, 0, [
      'workspace:ws-1:kanban:board-1',
    ]);

    expect(redisService.zrangebyscore).not.toHaveBeenCalled();
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('should not replay events from rooms user is no longer authorized for', async () => {
    // Override checkMembership to fail for unauthorized room
    jest.spyOn(wsRoomGuard, 'checkMembership').mockImplementation(
      async (userId: string, workspaceId: string) => {
        return workspaceId === 'ws-1'; // only authorized for ws-1
      },
    );

    const events = [
      JSON.stringify({
        event: 'test',
        data: {},
        room: 'workspace:ws-2:kanban:board-1',
        timestamp: 1000,
      }),
    ];
    redisService.zrangebyscore.mockResolvedValue(events);

    await service.handleReconnection(mockSocket, 500, [
      'workspace:ws-1:kanban:board-1',
      'workspace:ws-2:kanban:board-1',
    ]);

    // Should only join ws-1 room, not ws-2
    expect(mockSocket.join).toHaveBeenCalledWith(
      'workspace:ws-1:kanban:board-1',
    );
    expect(mockSocket.join).not.toHaveBeenCalledWith(
      'workspace:ws-2:kanban:board-1',
    );
  });
});
