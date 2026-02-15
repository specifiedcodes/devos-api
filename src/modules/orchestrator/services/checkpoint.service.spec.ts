/**
 * CheckpointService Tests
 * Story 11.9: Agent Failure Recovery & Checkpoints
 *
 * Tests Redis-backed checkpoint management for agent session recovery.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CheckpointService } from './checkpoint.service';
import { RedisService } from '../../redis/redis.service';
import {
  CreateCheckpointParams,
  Checkpoint,
  CHECKPOINT_TTL,
} from '../interfaces/failure-recovery.interfaces';

describe('CheckpointService', () => {
  let service: CheckpointService;
  let redisService: jest.Mocked<RedisService>;

  const mockSessionId = 'session-123';
  const mockWorkspaceId = 'ws-456';
  const mockStoryId = 'story-11-9';

  const mockCheckpointParams: CreateCheckpointParams = {
    sessionId: mockSessionId,
    agentId: 'agent-001',
    projectId: 'proj-789',
    workspaceId: mockWorkspaceId,
    storyId: mockStoryId,
    commitHash: 'abc123def456',
    branch: 'feature/story-11-9',
    filesModified: ['src/app.ts', 'src/app.spec.ts'],
    testsPassed: true,
    description: 'Implemented failure detection service',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckpointService,
        {
          provide: RedisService,
          useValue: {
            zadd: jest.fn().mockResolvedValue(1),
            zrangebyscore: jest.fn().mockResolvedValue([]),
            del: jest.fn().mockResolvedValue(undefined),
            set: jest.fn().mockResolvedValue(undefined),
            get: jest.fn().mockResolvedValue(null),
            expire: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<CheckpointService>(CheckpointService);
    redisService = module.get(RedisService);
  });

  describe('createCheckpoint', () => {
    it('should store checkpoint in Redis sorted set', async () => {
      const result = await service.createCheckpoint(mockCheckpointParams);

      expect(redisService.zadd).toHaveBeenCalledWith(
        `pipeline:checkpoints:${mockSessionId}`,
        expect.any(Number),
        expect.any(String),
      );
      expect(result).toBeDefined();
      expect(result.commitHash).toBe('abc123def456');
    });

    it('should store cross-session story checkpoint', async () => {
      await service.createCheckpoint(mockCheckpointParams);

      expect(redisService.set).toHaveBeenCalledWith(
        `pipeline:story-checkpoints:${mockWorkspaceId}:${mockStoryId}`,
        expect.any(String),
        CHECKPOINT_TTL,
      );
    });

    it('should return Checkpoint object with all fields', async () => {
      const result = await service.createCheckpoint(mockCheckpointParams);

      expect(result.id).toBeDefined();
      expect(result.sessionId).toBe(mockSessionId);
      expect(result.agentId).toBe('agent-001');
      expect(result.projectId).toBe('proj-789');
      expect(result.workspaceId).toBe(mockWorkspaceId);
      expect(result.storyId).toBe(mockStoryId);
      expect(result.commitHash).toBe('abc123def456');
      expect(result.branch).toBe('feature/story-11-9');
      expect(result.filesModified).toEqual(['src/app.ts', 'src/app.spec.ts']);
      expect(result.testsPassed).toBe(true);
      expect(result.description).toBe('Implemented failure detection service');
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should set TTL on checkpoint sorted set key', async () => {
      await service.createCheckpoint(mockCheckpointParams);

      expect(redisService.expire).toHaveBeenCalledWith(
        `pipeline:checkpoints:${mockSessionId}`,
        CHECKPOINT_TTL,
      );
    });
  });

  describe('getLatestCheckpoint', () => {
    it('should return most recent checkpoint for session', async () => {
      const checkpoint: Checkpoint = {
        id: 'cp-1',
        sessionId: mockSessionId,
        agentId: 'agent-001',
        projectId: 'proj-789',
        workspaceId: mockWorkspaceId,
        storyId: mockStoryId,
        commitHash: 'abc123',
        branch: 'feature/test',
        filesModified: ['file.ts'],
        testsPassed: true,
        description: 'Latest checkpoint',
        createdAt: new Date(),
      };

      redisService.zrangebyscore.mockResolvedValue([
        JSON.stringify(checkpoint),
      ]);

      const result = await service.getLatestCheckpoint(mockSessionId);

      expect(result).toBeDefined();
      expect(result!.commitHash).toBe('abc123');
    });

    it('should return null when no checkpoints exist', async () => {
      redisService.zrangebyscore.mockResolvedValue([]);

      const result = await service.getLatestCheckpoint(mockSessionId);

      expect(result).toBeNull();
    });
  });

  describe('getSessionCheckpoints', () => {
    it('should return all checkpoints ordered by timestamp DESC', async () => {
      const cp1: Checkpoint = {
        id: 'cp-1',
        sessionId: mockSessionId,
        agentId: 'agent-001',
        projectId: 'proj-789',
        workspaceId: mockWorkspaceId,
        storyId: mockStoryId,
        commitHash: 'first-commit',
        branch: 'feature/test',
        filesModified: [],
        testsPassed: true,
        description: 'First',
        createdAt: new Date('2026-01-01'),
      };
      const cp2: Checkpoint = {
        id: 'cp-2',
        sessionId: mockSessionId,
        agentId: 'agent-001',
        projectId: 'proj-789',
        workspaceId: mockWorkspaceId,
        storyId: mockStoryId,
        commitHash: 'second-commit',
        branch: 'feature/test',
        filesModified: [],
        testsPassed: true,
        description: 'Second',
        createdAt: new Date('2026-01-02'),
      };

      // ZRANGEBYSCORE returns in ascending order (oldest first)
      redisService.zrangebyscore.mockResolvedValue([
        JSON.stringify(cp1),
        JSON.stringify(cp2),
      ]);

      const result = await service.getSessionCheckpoints(mockSessionId);

      expect(result).toHaveLength(2);
      expect(result[0].commitHash).toBe('second-commit');
      expect(result[1].commitHash).toBe('first-commit');
    });

    it('should return empty array for unknown session', async () => {
      redisService.zrangebyscore.mockResolvedValue([]);

      const result = await service.getSessionCheckpoints('unknown-session');

      expect(result).toEqual([]);
    });
  });

  describe('getLatestStoryCheckpoint', () => {
    it('should return latest checkpoint across sessions', async () => {
      const checkpoint: Checkpoint = {
        id: 'cp-cross',
        sessionId: 'session-other',
        agentId: 'agent-002',
        projectId: 'proj-789',
        workspaceId: mockWorkspaceId,
        storyId: mockStoryId,
        commitHash: 'cross-session-hash',
        branch: 'feature/test',
        filesModified: [],
        testsPassed: true,
        description: 'Cross-session checkpoint',
        createdAt: new Date(),
      };

      redisService.get.mockResolvedValue(JSON.stringify(checkpoint));

      const result = await service.getLatestStoryCheckpoint({
        workspaceId: mockWorkspaceId,
        storyId: mockStoryId,
      });

      expect(result).toBeDefined();
      expect(result!.commitHash).toBe('cross-session-hash');
      expect(redisService.get).toHaveBeenCalledWith(
        `pipeline:story-checkpoints:${mockWorkspaceId}:${mockStoryId}`,
      );
    });

    it('should return null when no checkpoints for story', async () => {
      redisService.get.mockResolvedValue(null);

      const result = await service.getLatestStoryCheckpoint({
        workspaceId: mockWorkspaceId,
        storyId: 'nonexistent-story',
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteSessionCheckpoints', () => {
    it('should remove all checkpoints for session from Redis', async () => {
      await service.deleteSessionCheckpoints(mockSessionId);

      expect(redisService.del).toHaveBeenCalledWith(
        `pipeline:checkpoints:${mockSessionId}`,
      );
    });
  });
});
