/**
 * JiraWebhookController Tests
 * Story 21.6: Jira Two-Way Sync (AC5)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { JiraWebhookController } from '../controllers/jira-webhook.controller';
import { JiraIntegration } from '../../../../database/entities/jira-integration.entity';
import { JiraSyncItem } from '../../../../database/entities/jira-sync-item.entity';

describe('JiraWebhookController', () => {
  let controller: JiraWebhookController;

  const mockIntegrationRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockSyncItemRepo = {
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const mockSyncQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  const mockIntegration = {
    id: 'int-1',
    workspaceId: 'ws-1',
    jiraProjectKey: 'PROJ',
    syncDirection: 'bidirectional',
    isActive: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JiraWebhookController],
      providers: [
        { provide: getRepositoryToken(JiraIntegration), useValue: mockIntegrationRepo },
        { provide: getRepositoryToken(JiraSyncItem), useValue: mockSyncItemRepo },
        { provide: getQueueToken('jira-sync'), useValue: mockSyncQueue },
      ],
    }).compile();

    controller = module.get<JiraWebhookController>(JiraWebhookController);
  });

  describe('handleWebhook', () => {
    it('returns success for unknown integrations', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue(null);
      mockIntegrationRepo.find.mockResolvedValue([]);

      const result = await controller.handleWebhook('wh-id', {
        webhookEvent: 'jira:issue_updated',
        timestamp: Date.now(),
        issue: { id: '10001', key: 'UNKNOWN-1', self: '', fields: { summary: 'Test', status: { id: '1', name: 'Open', statusCategory: { key: 'new', name: 'To Do' } }, issuetype: { id: '1', name: 'Story', subtask: false } } },
      }, {} as any);

      expect(result).toEqual({ success: true });
      expect(mockSyncQueue.add).not.toHaveBeenCalled();
    });

    it('queues sync-from-jira for issue_updated events', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue(mockIntegration);

      await controller.handleWebhook('wh-id', {
        webhookEvent: 'jira:issue_updated',
        timestamp: Date.now(),
        issue: { id: '10001', key: 'PROJ-1', self: '', fields: { summary: 'Test', status: { id: '1', name: 'Open', statusCategory: { key: 'new', name: 'To Do' } }, issuetype: { id: '1', name: 'Story', subtask: false } } },
        changelog: { items: [{ field: 'status', fieldtype: 'jira', from: '1', fromString: 'Open', to: '2', toString: 'In Progress' }] },
      }, {} as any);

      expect(mockSyncQueue.add).toHaveBeenCalledWith(
        'sync-from-jira',
        expect.objectContaining({
          type: 'jira_to_devos',
          integrationId: 'int-1',
          workspaceId: 'ws-1',
          jiraIssueId: '10001',
        }),
      );
    });

    it('queues sync-from-jira for issue_created events', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue(mockIntegration);

      await controller.handleWebhook('wh-id', {
        webhookEvent: 'jira:issue_created',
        timestamp: Date.now(),
        issue: { id: '10002', key: 'PROJ-2', self: '', fields: { summary: 'New Issue', status: { id: '1', name: 'Open', statusCategory: { key: 'new', name: 'To Do' } }, issuetype: { id: '1', name: 'Story', subtask: false } } },
      }, {} as any);

      expect(mockSyncQueue.add).toHaveBeenCalledWith(
        'sync-from-jira',
        expect.objectContaining({ type: 'jira_to_devos' }),
      );
    });

    it('skips issue_created when sync direction is devos_to_jira', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({ ...mockIntegration, syncDirection: 'devos_to_jira' });

      await controller.handleWebhook('wh-id', {
        webhookEvent: 'jira:issue_created',
        timestamp: Date.now(),
        issue: { id: '10002', key: 'PROJ-2', self: '', fields: { summary: 'New', status: { id: '1', name: 'Open', statusCategory: { key: 'new', name: 'To Do' } }, issuetype: { id: '1', name: 'Story', subtask: false } } },
      }, {} as any);

      expect(mockSyncQueue.add).not.toHaveBeenCalled();
    });

    it('removes sync item for issue_deleted events', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue(mockIntegration);
      mockSyncItemRepo.findOne.mockResolvedValue({ id: 'si-1', jiraIssueId: '10001' });
      mockSyncItemRepo.remove.mockResolvedValue(undefined);

      await controller.handleWebhook('wh-id', {
        webhookEvent: 'jira:issue_deleted',
        timestamp: Date.now(),
        issue: { id: '10001', key: 'PROJ-1', self: '', fields: { summary: 'Deleted', status: { id: '1', name: 'Open', statusCategory: { key: 'new', name: 'To Do' } }, issuetype: { id: '1', name: 'Story', subtask: false } } },
      }, {} as any);

      expect(mockSyncItemRepo.remove).toHaveBeenCalled();
    });

    it('silently handles issue_deleted when no sync item found', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue(mockIntegration);
      mockSyncItemRepo.findOne.mockResolvedValue(null);

      const result = await controller.handleWebhook('wh-id', {
        webhookEvent: 'jira:issue_deleted',
        timestamp: Date.now(),
        issue: { id: '10001', key: 'PROJ-1', self: '', fields: { summary: 'Deleted', status: { id: '1', name: 'Open', statusCategory: { key: 'new', name: 'To Do' } }, issuetype: { id: '1', name: 'Story', subtask: false } } },
      }, {} as any);

      expect(result).toEqual({ success: true });
      expect(mockSyncItemRepo.remove).not.toHaveBeenCalled();
    });

    it('matches integration by project key from issue key', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue(mockIntegration);

      await controller.handleWebhook('wh-id', {
        webhookEvent: 'jira:issue_updated',
        timestamp: Date.now(),
        issue: { id: '10001', key: 'PROJ-42', self: '', fields: { summary: 'Test', status: { id: '1', name: 'Open', statusCategory: { key: 'new', name: 'To Do' } }, issuetype: { id: '1', name: 'Story', subtask: false } } },
      }, {} as any);

      expect(mockIntegrationRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { jiraProjectKey: 'PROJ', isActive: true } }),
      );
    });

    it('silently ignores webhook when project key does not match any integration', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue(null);

      const result = await controller.handleWebhook('wh-id', {
        webhookEvent: 'jira:issue_updated',
        timestamp: Date.now(),
        issue: { id: '10001', key: 'OTHER-1', self: '', fields: { summary: 'Test', status: { id: '1', name: 'Open', statusCategory: { key: 'new', name: 'To Do' } }, issuetype: { id: '1', name: 'Story', subtask: false } } },
      }, {} as any);

      // Should not fall back to any integration - silently ignore
      expect(result).toEqual({ success: true });
      expect(mockSyncQueue.add).not.toHaveBeenCalled();
    });

    it('handles missing issue in payload gracefully', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue(null);
      mockIntegrationRepo.find.mockResolvedValue([]);

      const result = await controller.handleWebhook('wh-id', {
        webhookEvent: 'comment_created',
        timestamp: Date.now(),
      }, {} as any);

      expect(result).toEqual({ success: true });
    });

    it('includes changelog in sync job data', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue(mockIntegration);

      const changelog = { items: [{ field: 'summary', fieldtype: 'jira', from: null, fromString: 'Old', to: null, toString: 'New' }] };

      await controller.handleWebhook('wh-id', {
        webhookEvent: 'jira:issue_updated',
        timestamp: Date.now(),
        issue: { id: '10001', key: 'PROJ-1', self: '', fields: { summary: 'New', status: { id: '1', name: 'Open', statusCategory: { key: 'new', name: 'To Do' } }, issuetype: { id: '1', name: 'Story', subtask: false } } },
        changelog,
      }, {} as any);

      expect(mockSyncQueue.add).toHaveBeenCalledWith(
        'sync-from-jira',
        expect.objectContaining({
          webhookEvent: expect.objectContaining({
            changelog: expect.objectContaining({
              items: expect.arrayContaining([
                expect.objectContaining({ field: 'summary' }),
              ]),
            }),
          }),
        }),
      );
    });
  });
});
