import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WsRoomGuard } from '../guards/ws-room.guard';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { RedisService } from '../../redis/redis.service';
import { WS_REDIS_KEYS, WS_REDIS_TTLS } from '../ws-security.constants';

describe('WsRoomGuard', () => {
  let guard: WsRoomGuard;
  let workspaceMemberRepo: jest.Mocked<Repository<WorkspaceMember>>;
  let redisService: jest.Mocked<RedisService>;
  let mockSocket: {
    data: Record<string, unknown>;
    emit: jest.Mock;
    join: jest.Mock;
  };

  beforeEach(async () => {
    workspaceMemberRepo = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<WorkspaceMember>>;

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RedisService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsRoomGuard,
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: workspaceMemberRepo,
        },
        {
          provide: RedisService,
          useValue: redisService,
        },
      ],
    }).compile();

    guard = module.get<WsRoomGuard>(WsRoomGuard);

    mockSocket = {
      data: { userId: 'user-1', workspaceId: 'ws-1', role: 'owner' },
      emit: jest.fn(),
      join: jest.fn(),
    };
  });

  it('should allow join for user with workspace membership', async () => {
    workspaceMemberRepo.findOne.mockResolvedValue({
      id: 'member-1',
      userId: 'user-1',
      workspaceId: 'ws-1',
    } as WorkspaceMember);

    const result = await guard.handleJoin(
      mockSocket,
      'workspace:ws-1:kanban:board-1',
    );

    expect(result).toBe(true);
  });

  it('should call socket.join(room) on successful authorization', async () => {
    workspaceMemberRepo.findOne.mockResolvedValue({
      id: 'member-1',
      userId: 'user-1',
      workspaceId: 'ws-1',
    } as WorkspaceMember);

    await guard.handleJoin(mockSocket, 'workspace:ws-1:kanban:board-1');

    expect(mockSocket.join).toHaveBeenCalledWith(
      'workspace:ws-1:kanban:board-1',
    );
  });

  it('should emit room:joined event with room name on successful join', async () => {
    workspaceMemberRepo.findOne.mockResolvedValue({
      id: 'member-1',
      userId: 'user-1',
      workspaceId: 'ws-1',
    } as WorkspaceMember);

    await guard.handleJoin(mockSocket, 'workspace:ws-1:kanban:board-1');

    expect(mockSocket.emit).toHaveBeenCalledWith('room:joined', {
      room: 'workspace:ws-1:kanban:board-1',
    });
  });

  it('should reject join for user without workspace membership', async () => {
    workspaceMemberRepo.findOne.mockResolvedValue(null);

    const result = await guard.handleJoin(
      mockSocket,
      'workspace:ws-1:kanban:board-1',
    );

    expect(result).toBe(false);
    expect(mockSocket.emit).toHaveBeenCalledWith('error', {
      code: 'FORBIDDEN',
      message: 'No access to workspace',
    });
  });

  it('should NOT call socket.join when membership check fails', async () => {
    workspaceMemberRepo.findOne.mockResolvedValue(null);

    await guard.handleJoin(mockSocket, 'workspace:ws-1:kanban:board-1');

    expect(mockSocket.join).not.toHaveBeenCalled();
  });

  it('should reject invalid room format', async () => {
    const result = await guard.handleJoin(mockSocket, 'invalid-room-name');

    expect(result).toBe(false);
    expect(mockSocket.emit).toHaveBeenCalledWith('error', {
      code: 'INVALID_ROOM',
      message: 'Invalid room format',
    });
  });

  it('should reject room name without workspace prefix', async () => {
    const result = await guard.handleJoin(mockSocket, 'channel:ws-1:kanban:board-1');

    expect(result).toBe(false);
    expect(mockSocket.emit).toHaveBeenCalledWith('error', {
      code: 'INVALID_ROOM',
      message: 'Invalid room format',
    });
  });

  it('should reject room name with only 2 segments', async () => {
    const result = await guard.handleJoin(mockSocket, 'workspace:abc');

    expect(result).toBe(false);
    expect(mockSocket.emit).toHaveBeenCalledWith('error', {
      code: 'INVALID_ROOM',
      message: 'Invalid room format',
    });
  });

  it('should cache membership in Redis with correct key and TTL', async () => {
    redisService.get.mockResolvedValue(null); // cache miss
    workspaceMemberRepo.findOne.mockResolvedValue({
      id: 'member-1',
      userId: 'user-1',
      workspaceId: 'ws-1',
    } as WorkspaceMember);

    await guard.handleJoin(mockSocket, 'workspace:ws-1:kanban:board-1');

    expect(redisService.set).toHaveBeenCalledWith(
      `${WS_REDIS_KEYS.MEMBERSHIP_CACHE}:user-1:ws-1`,
      'true',
      WS_REDIS_TTLS.MEMBERSHIP_CACHE,
    );
  });

  it('should use cached membership and skip database query', async () => {
    redisService.get.mockResolvedValue('true'); // cache hit

    await guard.handleJoin(mockSocket, 'workspace:ws-1:kanban:board-1');

    expect(workspaceMemberRepo.findOne).not.toHaveBeenCalled();
    expect(mockSocket.join).toHaveBeenCalledWith(
      'workspace:ws-1:kanban:board-1',
    );
  });

  it('should require separate membership checks for different workspaceIds', async () => {
    redisService.get.mockResolvedValue(null);
    workspaceMemberRepo.findOne.mockResolvedValue({
      id: 'member-1',
      userId: 'user-1',
      workspaceId: 'ws-1',
    } as WorkspaceMember);

    // Socket is authenticated for ws-1, so ws-1 room join proceeds to membership check
    await guard.handleJoin(mockSocket, 'workspace:ws-1:kanban:board-1');
    expect(redisService.get).toHaveBeenCalledWith(
      `${WS_REDIS_KEYS.MEMBERSHIP_CACHE}:user-1:ws-1`,
    );

    // Cross-workspace join to ws-2 is rejected before reaching membership check
    const result = await guard.handleJoin(mockSocket, 'workspace:ws-2:kanban:board-1');
    expect(result).toBe(false);
    expect(mockSocket.emit).toHaveBeenCalledWith('error', {
      code: 'FORBIDDEN',
      message: 'No access to workspace',
    });
  });

  it('should reject join for unauthorized workspace even with valid room format', async () => {
    workspaceMemberRepo.findOne.mockResolvedValue(null);

    const result = await guard.handleJoin(
      mockSocket,
      'workspace:unauthorized-ws:kanban:board-1',
    );

    expect(result).toBe(false);
    expect(mockSocket.emit).toHaveBeenCalledWith('error', {
      code: 'FORBIDDEN',
      message: 'No access to workspace',
    });
    expect(mockSocket.join).not.toHaveBeenCalled();
  });

  it('should reject cross-workspace join when socket.data.workspaceId mismatches room workspace', async () => {
    // Socket authenticated for ws-1 but trying to join ws-2 room
    mockSocket.data.workspaceId = 'ws-1';
    workspaceMemberRepo.findOne.mockResolvedValue({
      id: 'member-1',
      userId: 'user-1',
      workspaceId: 'ws-2',
    } as WorkspaceMember);

    const result = await guard.handleJoin(
      mockSocket,
      'workspace:ws-2:kanban:board-1',
    );

    expect(result).toBe(false);
    expect(mockSocket.emit).toHaveBeenCalledWith('error', {
      code: 'FORBIDDEN',
      message: 'No access to workspace',
    });
    expect(mockSocket.join).not.toHaveBeenCalled();
  });

  it('should validate room format correctly', () => {
    expect(guard.isValidRoomFormat('workspace:ws-1:kanban:board-1')).toBe(true);
    expect(guard.isValidRoomFormat('workspace:ws-1:cli:session-1')).toBe(true);
    expect(guard.isValidRoomFormat('workspace:ws-1:chat')).toBe(true);
    expect(guard.isValidRoomFormat('invalid')).toBe(false);
    expect(guard.isValidRoomFormat('')).toBe(false);
    expect(guard.isValidRoomFormat('workspace:')).toBe(false);
    expect(guard.isValidRoomFormat('workspace:abc')).toBe(false);
  });
});
