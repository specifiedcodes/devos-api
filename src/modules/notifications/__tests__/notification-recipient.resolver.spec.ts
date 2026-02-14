/**
 * NotificationRecipientResolver Tests
 * Story 10.5: Notification Triggers
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationRecipientResolver } from '../services/notification-recipient.resolver';
import { WorkspacesService } from '../../workspaces/workspaces.service';
import { PushSubscription } from '../../../database/entities/push-subscription.entity';
import { Project } from '../../../database/entities/project.entity';

describe('NotificationRecipientResolver', () => {
  let service: NotificationRecipientResolver;
  let subscriptionRepo: jest.Mocked<Repository<PushSubscription>>;
  let projectRepo: jest.Mocked<Repository<Project>>;
  let workspacesService: jest.Mocked<WorkspacesService>;

  const mockSubscriptions = [
    {
      id: 'sub-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
      endpoint: 'https://push.example.com/1',
      keys: { p256dh: 'key1', auth: 'auth1' },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'sub-2',
      userId: 'user-2',
      workspaceId: 'workspace-1',
      endpoint: 'https://push.example.com/2',
      keys: { p256dh: 'key2', auth: 'auth2' },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ] as any[];

  const mockMembers = [
    { id: 'member-1', userId: 'user-1', email: 'user1@example.com', role: 'admin' },
    { id: 'member-2', userId: 'user-2', email: 'user2@example.com', role: 'developer' },
    { id: 'member-3', userId: 'user-3', email: 'user3@example.com', role: 'viewer' },
  ];

  beforeEach(async () => {
    const mockSubscriptionRepo = {
      find: jest.fn().mockResolvedValue(mockSubscriptions),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(1),
    };

    const mockProjectRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'project-1',
        workspaceId: 'workspace-1',
      }),
    };

    const mockWorkspacesService = {
      getMembers: jest.fn().mockResolvedValue(mockMembers),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationRecipientResolver,
        {
          provide: getRepositoryToken(PushSubscription),
          useValue: mockSubscriptionRepo,
        },
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectRepo,
        },
        {
          provide: WorkspacesService,
          useValue: mockWorkspacesService,
        },
      ],
    }).compile();

    service = module.get<NotificationRecipientResolver>(NotificationRecipientResolver);
    subscriptionRepo = module.get(getRepositoryToken(PushSubscription));
    projectRepo = module.get(getRepositoryToken(Project));
    workspacesService = module.get(WorkspacesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('forWorkspace', () => {
    it('should return all workspace members with subscriptions', async () => {
      const recipients = await service.forWorkspace('workspace-1');

      expect(workspacesService.getMembers).toHaveBeenCalledWith('workspace-1');
      expect(recipients).toHaveLength(2); // Only 2 have subscriptions
    });

    it('should filter out members without subscriptions', async () => {
      const recipients = await service.forWorkspace('workspace-1');

      const userIds = recipients.map(r => r.userId);
      expect(userIds).toContain('user-1');
      expect(userIds).toContain('user-2');
      expect(userIds).not.toContain('user-3'); // No subscription
    });

    it('should include workspace ID in recipient', async () => {
      const recipients = await service.forWorkspace('workspace-1');

      expect(recipients[0].workspaceId).toBe('workspace-1');
    });
  });

  describe('forProject', () => {
    it('should lookup project and call forWorkspace with its workspaceId', async () => {
      const spy = jest.spyOn(service, 'forWorkspace');

      await service.forProject('project-1');

      expect(projectRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'project-1' },
        select: ['id', 'workspaceId'],
      });
      expect(spy).toHaveBeenCalledWith('workspace-1');
    });

    it('should return empty array if project not found', async () => {
      projectRepo.findOne.mockResolvedValue(null);

      const recipients = await service.forProject('non-existent');

      expect(recipients).toEqual([]);
    });
  });

  describe('forUser', () => {
    it('should return single user if has subscription', async () => {
      subscriptionRepo.find.mockResolvedValue([mockSubscriptions[0]] as any);

      const recipients = await service.forUser('user-1', 'workspace-1');

      expect(recipients).toHaveLength(1);
      expect(recipients[0].userId).toBe('user-1');
    });

    it('should return empty array if user has no subscription', async () => {
      subscriptionRepo.find.mockResolvedValue([]);

      const recipients = await service.forUser('user-3', 'workspace-1');

      expect(recipients).toHaveLength(0);
    });

    it('should filter by workspace ID', async () => {
      await service.forUser('user-1', 'workspace-1');

      expect(subscriptionRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1', workspaceId: 'workspace-1' },
      });
    });
  });

  describe('workspace isolation', () => {
    it('should only return recipients from specified workspace', async () => {
      subscriptionRepo.find.mockResolvedValue(mockSubscriptions as any);

      const recipients = await service.forWorkspace('workspace-1');

      // Should not include users from other workspaces
      const userIds = recipients.map(r => r.userId);
      expect(userIds).not.toContain('user-other');
    });
  });

  describe('error handling', () => {
    it('should return empty array on workspace service error', async () => {
      workspacesService.getMembers.mockRejectedValue(new Error('Service unavailable'));

      const recipients = await service.forWorkspace('workspace-1');

      expect(recipients).toEqual([]);
    });

    it('should return empty array on subscription repo error', async () => {
      subscriptionRepo.find.mockRejectedValue(new Error('DB error'));

      const recipients = await service.forUser('user-1', 'workspace-1');

      expect(recipients).toEqual([]);
    });
  });

  describe('subscription filtering', () => {
    it('should handle users with multiple subscriptions', async () => {
      const multipleSubscriptions = [
        { id: 'sub-1a', userId: 'user-1', workspaceId: 'workspace-1', keys: {}, createdAt: new Date(), updatedAt: new Date() },
        { id: 'sub-1b', userId: 'user-1', workspaceId: 'workspace-1', keys: {}, createdAt: new Date(), updatedAt: new Date() },
      ] as any;
      subscriptionRepo.find.mockResolvedValue(multipleSubscriptions);

      const recipients = await service.forUser('user-1', 'workspace-1');

      // Should dedupe to single recipient
      expect(recipients).toHaveLength(1);
    });
  });
});
