/**
 * IntegrationManagementService Webhook Update Tests
 * Story 21-8: Webhook Management (AC10)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  IntegrationManagementService,
  IntegrationType,
} from '../services/integration-management.service';
import { IntegrationConnection } from '../../../database/entities/integration-connection.entity';
import { SlackIntegration } from '../../../database/entities/slack-integration.entity';
import { DiscordIntegration } from '../../../database/entities/discord-integration.entity';
import { LinearIntegration } from '../../../database/entities/linear-integration.entity';
import { JiraIntegration } from '../../../database/entities/jira-integration.entity';
import { LinearSyncItem } from '../../../database/entities/linear-sync-item.entity';
import { JiraSyncItem } from '../../../database/entities/jira-sync-item.entity';
import { OutgoingWebhook } from '../../../database/entities/outgoing-webhook.entity';
import { RedisService } from '../../redis/redis.service';

describe('IntegrationManagementService - Webhook Updates', () => {
  let service: IntegrationManagementService;
  let outgoingWebhookRepo: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';

  const mockRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    }),
  };

  const mockRedisService = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };

  beforeEach(async () => {
    outgoingWebhookRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationManagementService,
        { provide: getRepositoryToken(IntegrationConnection), useValue: mockRepo },
        { provide: getRepositoryToken(SlackIntegration), useValue: mockRepo },
        { provide: getRepositoryToken(DiscordIntegration), useValue: mockRepo },
        { provide: getRepositoryToken(LinearIntegration), useValue: mockRepo },
        { provide: getRepositoryToken(JiraIntegration), useValue: mockRepo },
        { provide: getRepositoryToken(LinearSyncItem), useValue: mockRepo },
        { provide: getRepositoryToken(JiraSyncItem), useValue: mockRepo },
        { provide: getRepositoryToken(OutgoingWebhook), useValue: outgoingWebhookRepo },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<IntegrationManagementService>(IntegrationManagementService);
  });

  describe('fetchWebhookStatus (via getIntegrationStatus)', () => {
    it('should return disconnected when no webhooks exist for workspace', async () => {
      outgoingWebhookRepo.find.mockResolvedValue([]);
      const result = await service.getIntegrationStatus(mockWorkspaceId, IntegrationType.WEBHOOKS);
      expect(result.status).toBe('disconnected');
      expect(result.connected).toBe(false);
      expect(result.available).toBe(true);
    });

    it('should return active when active webhooks exist', async () => {
      outgoingWebhookRepo.find.mockResolvedValue([
        { id: '1', isActive: true, failureCount: 0, consecutiveFailures: 0, maxConsecutiveFailures: 3, lastTriggeredAt: null },
        { id: '2', isActive: true, failureCount: 0, consecutiveFailures: 0, maxConsecutiveFailures: 3, lastTriggeredAt: null },
      ]);
      const result = await service.getIntegrationStatus(mockWorkspaceId, IntegrationType.WEBHOOKS);
      expect(result.status).toBe('active');
      expect(result.connected).toBe(true);
    });

    it('should return error when any webhook has consecutiveFailures >= maxConsecutiveFailures', async () => {
      outgoingWebhookRepo.find.mockResolvedValue([
        { id: '1', isActive: true, failureCount: 5, consecutiveFailures: 3, maxConsecutiveFailures: 3, lastTriggeredAt: null },
      ]);
      const result = await service.getIntegrationStatus(mockWorkspaceId, IntegrationType.WEBHOOKS);
      expect(result.status).toBe('error');
    });

    it('should return correct accountLabel with active/total counts', async () => {
      outgoingWebhookRepo.find.mockResolvedValue([
        { id: '1', isActive: true, failureCount: 0, consecutiveFailures: 0, maxConsecutiveFailures: 3, lastTriggeredAt: null },
        { id: '2', isActive: false, failureCount: 0, consecutiveFailures: 0, maxConsecutiveFailures: 3, lastTriggeredAt: null },
      ]);
      const result = await service.getIntegrationStatus(mockWorkspaceId, IntegrationType.WEBHOOKS);
      expect(result.accountLabel).toBe('1 active, 2 total');
    });

    it('should return lastActivityAt from most recent lastTriggeredAt', async () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 60000);
      outgoingWebhookRepo.find.mockResolvedValue([
        { id: '1', isActive: true, failureCount: 0, consecutiveFailures: 0, maxConsecutiveFailures: 3, lastTriggeredAt: earlier },
        { id: '2', isActive: true, failureCount: 0, consecutiveFailures: 0, maxConsecutiveFailures: 3, lastTriggeredAt: now },
      ]);
      const result = await service.getIntegrationStatus(mockWorkspaceId, IntegrationType.WEBHOOKS);
      expect(result.lastActivityAt).toBe(now.toISOString());
    });

    it('should return available: true (not coming-soon)', async () => {
      outgoingWebhookRepo.find.mockResolvedValue([]);
      const result = await service.getIntegrationStatus(mockWorkspaceId, IntegrationType.WEBHOOKS);
      expect(result.available).toBe(true);
      expect(result.status).not.toBe('coming-soon');
    });
  });

  describe('getAllIntegrationStatuses no longer returns coming-soon for WEBHOOKS', () => {
    it('should not return coming-soon status for webhooks', async () => {
      const statuses = await service.getAllIntegrationStatuses(mockWorkspaceId);
      const webhookStatus = statuses.find((s) => s.type === IntegrationType.WEBHOOKS);
      expect(webhookStatus).toBeDefined();
      expect(webhookStatus!.status).not.toBe('coming-soon');
      expect(webhookStatus!.available).toBe(true);
    });
  });

  describe('getRecentActivity includes webhook delivery events', () => {
    it('should include webhook activity', async () => {
      outgoingWebhookRepo.find.mockResolvedValue([
        {
          id: '1',
          name: 'Test Webhook',
          lastTriggeredAt: new Date(),
          lastDeliveryStatus: 'success',
        },
      ]);
      const activities = await service.getRecentActivity(mockWorkspaceId);
      const webhookActivities = activities.filter((a) => a.type === IntegrationType.WEBHOOKS);
      expect(webhookActivities.length).toBeGreaterThanOrEqual(1);
      expect(webhookActivities[0].event).toBe('delivery_success');
    });
  });
});
