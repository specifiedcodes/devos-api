/**
 * NotificationBatchService Tests
 * Story 10.5: Notification Triggers
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationBatchService } from '../services/notification-batch.service';
import { RedisService } from '../../redis/redis.service';
import { NotificationEvent } from '../events/notification.events';

describe('NotificationBatchService', () => {
  let service: NotificationBatchService;
  let redisService: jest.Mocked<RedisService>;

  beforeEach(async () => {
    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationBatchService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<NotificationBatchService>(NotificationBatchService);
    redisService = module.get(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('queueNotification', () => {
    const notification: NotificationEvent = {
      type: 'story_completed',
      payload: {
        storyId: 'story-123',
        storyTitle: 'User Login',
      },
      recipients: [
        { userId: 'user-1', workspaceId: 'workspace-1' },
      ],
      urgency: 'normal',
      batchable: true,
    };

    it('should add notification to Redis batch queue', async () => {
      redisService.get.mockResolvedValue(null);

      await service.queueNotification(notification);

      expect(redisService.set).toHaveBeenCalledWith(
        'notifications:batch:user-1',
        expect.any(String),
        expect.any(Number),
      );
    });

    it('should append to existing batch queue', async () => {
      const existingBatch = JSON.stringify([
        { type: 'epic_completed', payload: {} },
      ]);
      redisService.get.mockResolvedValue(existingBatch);

      await service.queueNotification(notification);

      const savedData = JSON.parse(redisService.set.mock.calls[0][1]);
      expect(savedData).toHaveLength(2);
    });

    it('should queue for each recipient', async () => {
      const multiRecipientNotification: NotificationEvent = {
        ...notification,
        recipients: [
          { userId: 'user-1', workspaceId: 'workspace-1' },
          { userId: 'user-2', workspaceId: 'workspace-1' },
        ],
      };

      redisService.get.mockResolvedValue(null);

      await service.queueNotification(multiRecipientNotification);

      expect(redisService.set).toHaveBeenCalledTimes(2);
    });
  });

  describe('getBatchSize', () => {
    it('should return batch size for user', async () => {
      const batch = JSON.stringify([
        { type: 'story_completed' },
        { type: 'epic_completed' },
      ]);
      redisService.get.mockResolvedValue(batch);

      const size = await service.getBatchSize('user-1');

      expect(size).toBe(2);
    });

    it('should return 0 for empty batch', async () => {
      redisService.get.mockResolvedValue(null);

      const size = await service.getBatchSize('user-1');

      expect(size).toBe(0);
    });
  });

  describe('flushBatch', () => {
    it('should return empty array if no batch exists', async () => {
      redisService.get.mockResolvedValue(null);

      const notifications = await service.flushBatch('user-1');

      expect(notifications).toEqual([]);
    });

    it('should return and clear batch', async () => {
      const batch = JSON.stringify([
        { type: 'story_completed', payload: {} },
        { type: 'epic_completed', payload: {} },
      ]);
      redisService.get.mockResolvedValue(batch);

      const notifications = await service.flushBatch('user-1');

      expect(notifications).toHaveLength(2);
      expect(redisService.del).toHaveBeenCalledWith('notifications:batch:user-1');
    });
  });

  describe('consolidateBatch', () => {
    it('should consolidate multiple story completions', async () => {
      const notifications = [
        { type: 'story_completed' as const, payload: { storyTitle: 'Story 1' }, timestamp: Date.now(), workspaceId: 'workspace-1' },
        { type: 'story_completed' as const, payload: { storyTitle: 'Story 2' }, timestamp: Date.now(), workspaceId: 'workspace-1' },
        { type: 'story_completed' as const, payload: { storyTitle: 'Story 3' }, timestamp: Date.now(), workspaceId: 'workspace-1' },
      ];

      const consolidated = service.consolidateBatch(notifications);

      expect(consolidated).toHaveLength(1);
      expect(consolidated[0].type).toBe('story_completed_batch');
      expect(consolidated[0].payload.count).toBe(3);
    });

    it('should consolidate multiple agent messages', async () => {
      const notifications = [
        { type: 'agent_message' as const, payload: { agentName: 'Dev Agent' }, timestamp: Date.now(), workspaceId: 'workspace-1' },
        { type: 'agent_message' as const, payload: { agentName: 'QA Agent' }, timestamp: Date.now(), workspaceId: 'workspace-1' },
      ];

      const consolidated = service.consolidateBatch(notifications);

      expect(consolidated).toHaveLength(1);
      expect(consolidated[0].type).toBe('agent_message_batch');
      expect(consolidated[0].payload.count).toBe(2);
    });

    it('should consolidate multiple epic completions', async () => {
      const notifications = [
        { type: 'epic_completed' as const, payload: { epicTitle: 'Epic 1' }, timestamp: Date.now(), workspaceId: 'workspace-1' },
        { type: 'epic_completed' as const, payload: { epicTitle: 'Epic 2' }, timestamp: Date.now(), workspaceId: 'workspace-1' },
      ];

      const consolidated = service.consolidateBatch(notifications);

      expect(consolidated).toHaveLength(1);
      expect(consolidated[0].type).toBe('epic_completed_batch');
      expect(consolidated[0].payload.count).toBe(2);
    });

    it('should not consolidate different types', async () => {
      const notifications = [
        { type: 'story_completed' as const, payload: {}, timestamp: Date.now(), workspaceId: 'workspace-1' },
        { type: 'deployment_success' as const, payload: {}, timestamp: Date.now(), workspaceId: 'workspace-1' },
      ];

      const consolidated = service.consolidateBatch(notifications);

      expect(consolidated).toHaveLength(2);
    });

    it('should not consolidate single notifications', async () => {
      const notifications = [
        { type: 'story_completed' as const, payload: { storyTitle: 'Story 1' }, timestamp: Date.now(), workspaceId: 'workspace-1' },
      ];

      const consolidated = service.consolidateBatch(notifications);

      expect(consolidated).toHaveLength(1);
      expect(consolidated[0].type).toBe('story_completed');
    });

    it('should mix consolidated and individual notifications', async () => {
      const notifications = [
        { type: 'story_completed' as const, payload: {}, timestamp: Date.now(), workspaceId: 'workspace-1' },
        { type: 'story_completed' as const, payload: {}, timestamp: Date.now(), workspaceId: 'workspace-1' },
        { type: 'deployment_failed' as const, payload: {}, timestamp: Date.now(), workspaceId: 'workspace-1' },
      ];

      const consolidated = service.consolidateBatch(notifications);

      expect(consolidated).toHaveLength(2);
      expect(consolidated.some(n => n.type === 'story_completed_batch')).toBe(true);
      expect(consolidated.some(n => n.type === 'deployment_failed')).toBe(true);
    });
  });

  describe('isImmediateNotification', () => {
    it('should return true for deployment_failed', () => {
      expect(service.isImmediateNotification({ type: 'deployment_failed' } as any)).toBe(true);
    });

    it('should return true for agent_error', () => {
      expect(service.isImmediateNotification({ type: 'agent_error' } as any)).toBe(true);
    });

    it('should return false for story_completed', () => {
      expect(service.isImmediateNotification({ type: 'story_completed' } as any)).toBe(false);
    });

    it('should return false for epic_completed', () => {
      expect(service.isImmediateNotification({ type: 'epic_completed' } as any)).toBe(false);
    });

    it('should return true when batchable is false', () => {
      expect(service.isImmediateNotification({
        type: 'story_completed',
        batchable: false,
      } as any)).toBe(true);
    });
  });

  describe('getAllPendingUserIds', () => {
    it('should return all user IDs with pending batches', async () => {
      redisService.keys.mockResolvedValue([
        'notifications:batch:user-1',
        'notifications:batch:user-2',
        'notifications:batch:user-3',
      ]);

      const userIds = await service.getAllPendingUserIds();

      expect(userIds).toEqual(['user-1', 'user-2', 'user-3']);
    });

    it('should return empty array if no pending batches', async () => {
      redisService.keys.mockResolvedValue([]);

      const userIds = await service.getAllPendingUserIds();

      expect(userIds).toEqual([]);
    });
  });
});
