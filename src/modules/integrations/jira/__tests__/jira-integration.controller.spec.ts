/**
 * JiraIntegrationController Tests
 * Story 21.6: Jira Two-Way Sync (AC6)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { JiraIntegrationController } from '../controllers/jira-integration.controller';
import { JiraOAuthService } from '../services/jira-oauth.service';
import { JiraSyncService } from '../services/jira-sync.service';
import { JiraApiClientService } from '../services/jira-api-client.service';

describe('JiraIntegrationController', () => {
  let controller: JiraIntegrationController;

  const mockOAuthService = {
    getAuthorizationUrl: jest.fn(),
    handleCallback: jest.fn(),
    completeSetup: jest.fn(),
    getStatus: jest.fn(),
    verifyConnection: jest.fn(),
    updateStatusMapping: jest.fn(),
    updateSyncDirection: jest.fn(),
    updateIssueType: jest.fn(),
    disconnect: jest.fn(),
    getIntegration: jest.fn(),
  };

  const mockSyncService = {
    getSyncItems: jest.fn(),
    resolveConflict: jest.fn(),
    retrySyncItem: jest.fn(),
    retryAllFailed: jest.fn(),
    fullSync: jest.fn(),
    linkStoryToIssue: jest.fn(),
    unlinkStoryFromIssue: jest.fn(),
  };

  const mockApiClient = {
    getProjects: jest.fn(),
    getProjectStatuses: jest.fn(),
    getIssueTypes: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JiraIntegrationController],
      providers: [
        { provide: JiraOAuthService, useValue: mockOAuthService },
        { provide: JiraSyncService, useValue: mockSyncService },
        { provide: JiraApiClientService, useValue: mockApiClient },
      ],
    }).compile();

    controller = module.get<JiraIntegrationController>(JiraIntegrationController);
  });

  describe('getAuthUrl', () => {
    it('calls oauthService.getAuthorizationUrl and returns url', async () => {
      mockOAuthService.getAuthorizationUrl.mockResolvedValue({ url: 'https://auth.atlassian.com/authorize?...', state: 's1' });

      const result = await controller.getAuthUrl('ws-1', { user: { userId: 'u1' } } as any);

      expect(mockOAuthService.getAuthorizationUrl).toHaveBeenCalledWith('ws-1', 'u1');
      expect(result.url).toContain('https://auth.atlassian.com');
    });
  });

  describe('handleCallback', () => {
    it('redirects to setup page on success', async () => {
      mockOAuthService.handleCallback.mockResolvedValue({ integrationId: 'int-1', sites: [] });
      const mockRes = { redirect: jest.fn() } as any;

      await controller.handleCallback('code', 'state', mockRes);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/settings/integrations/jira/setup'),
      );
    });

    it('redirects to error page on failure', async () => {
      mockOAuthService.handleCallback.mockRejectedValue(new Error('Invalid state'));
      const mockRes = { redirect: jest.fn() } as any;

      await controller.handleCallback('code', 'state', mockRes);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error='),
      );
    });
  });

  describe('completeSetup', () => {
    it('calls oauthService.completeSetup with workspace, integrationId from dto, and dto', async () => {
      const dto = { integrationId: 'int-1', cloudId: 'c1', siteUrl: 'https://test.atlassian.net', projectKey: 'PROJ' };
      mockOAuthService.completeSetup.mockResolvedValue({ id: 'int-1' });

      await controller.completeSetup('ws-1', dto as any);

      expect(mockOAuthService.completeSetup).toHaveBeenCalledWith('ws-1', 'int-1', dto);
    });
  });

  describe('getStatus', () => {
    it('calls oauthService.getStatus', async () => {
      mockOAuthService.getStatus.mockResolvedValue({ connected: true, projectKey: 'PROJ' });

      const result = await controller.getStatus('ws-1');

      expect(result.connected).toBe(true);
    });
  });

  describe('verifyConnection', () => {
    it('calls oauthService.verifyConnection', async () => {
      mockOAuthService.verifyConnection.mockResolvedValue({ valid: true, siteName: 'Test' });

      const result = await controller.verifyConnection('ws-1');

      expect(result.valid).toBe(true);
    });
  });

  describe('updateStatusMapping', () => {
    it('calls oauthService.updateStatusMapping with dto', async () => {
      const mapping = { backlog: 'Open', done: 'Closed' };
      mockOAuthService.updateStatusMapping.mockResolvedValue({ id: 'int-1', statusMapping: mapping });

      await controller.updateStatusMapping('ws-1', { statusMapping: mapping } as any);

      expect(mockOAuthService.updateStatusMapping).toHaveBeenCalledWith('ws-1', mapping);
    });
  });

  describe('updateSyncDirection', () => {
    it('calls oauthService.updateSyncDirection with dto', async () => {
      mockOAuthService.updateSyncDirection.mockResolvedValue({ id: 'int-1' });

      await controller.updateSyncDirection('ws-1', { syncDirection: 'devos_to_jira' } as any);

      expect(mockOAuthService.updateSyncDirection).toHaveBeenCalledWith('ws-1', 'devos_to_jira');
    });
  });

  describe('updateIssueType', () => {
    it('calls oauthService.updateIssueType with dto', async () => {
      mockOAuthService.updateIssueType.mockResolvedValue({ id: 'int-1' });

      await controller.updateIssueType('ws-1', { issueType: 'Bug' } as any);

      expect(mockOAuthService.updateIssueType).toHaveBeenCalledWith('ws-1', 'Bug');
    });
  });

  describe('disconnect', () => {
    it('calls oauthService.disconnect', async () => {
      mockOAuthService.disconnect.mockResolvedValue(undefined);

      await controller.disconnect('ws-1');

      expect(mockOAuthService.disconnect).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('getSyncItems', () => {
    it('calls syncService.getSyncItems with filters', async () => {
      mockSyncService.getSyncItems.mockResolvedValue({ items: [], total: 0 });

      await controller.getSyncItems('ws-1', 'error' as any, 1, 10);

      expect(mockSyncService.getSyncItems).toHaveBeenCalledWith('ws-1', { status: 'error', page: 1, limit: 10 });
    });
  });

  describe('resolveConflict', () => {
    it('calls syncService.resolveConflict', async () => {
      mockSyncService.resolveConflict.mockResolvedValue({ id: 'si-1', syncStatus: 'synced' });

      await controller.resolveConflict('ws-1', 'si-1', { resolution: 'keep_devos' } as any);

      expect(mockSyncService.resolveConflict).toHaveBeenCalledWith('ws-1', 'si-1', 'keep_devos');
    });
  });

  describe('retrySyncItem', () => {
    it('calls syncService.retrySyncItem', async () => {
      mockSyncService.retrySyncItem.mockResolvedValue({ id: 'si-1' });

      await controller.retrySyncItem('ws-1', 'si-1');

      expect(mockSyncService.retrySyncItem).toHaveBeenCalledWith('ws-1', 'si-1');
    });
  });

  describe('retryAllFailed', () => {
    it('calls syncService.retryAllFailed', async () => {
      mockSyncService.retryAllFailed.mockResolvedValue({ retried: 3, failed: 1 });

      const result = await controller.retryAllFailed('ws-1');

      expect(result.retried).toBe(3);
    });
  });

  describe('fullSync', () => {
    it('calls syncService.fullSync', async () => {
      mockSyncService.fullSync.mockResolvedValue({ created: 1, updated: 2, conflicts: 0, errors: 0 });

      const result = await controller.fullSync('ws-1');

      expect(result.created).toBe(1);
    });
  });

  describe('linkStoryToIssue', () => {
    it('calls syncService.linkStoryToIssue with dto fields', async () => {
      mockSyncService.linkStoryToIssue.mockResolvedValue({ id: 'si-1' });

      await controller.linkStoryToIssue('ws-1', { storyId: 's1', jiraIssueKey: 'PROJ-123' } as any);

      expect(mockSyncService.linkStoryToIssue).toHaveBeenCalledWith('ws-1', 's1', 'PROJ-123');
    });
  });

  describe('unlinkStoryFromIssue', () => {
    it('calls syncService.unlinkStoryFromIssue', async () => {
      mockSyncService.unlinkStoryFromIssue.mockResolvedValue(undefined);

      await controller.unlinkStoryFromIssue('ws-1', 'si-1');

      expect(mockSyncService.unlinkStoryFromIssue).toHaveBeenCalledWith('ws-1', 'si-1');
    });
  });

  describe('getProjects', () => {
    it('returns projects when integration exists', async () => {
      const projects = [{ id: '1', key: 'PROJ', name: 'My Project', projectTypeKey: 'software' }];
      mockOAuthService.getIntegration.mockResolvedValue({ id: 'int-1' });
      mockApiClient.getProjects.mockResolvedValue(projects);

      const result = await controller.getProjects('ws-1');

      expect(result).toEqual(projects);
    });

    it('returns empty array when no integration', async () => {
      mockOAuthService.getIntegration.mockResolvedValue(null);

      const result = await controller.getProjects('ws-1');

      expect(result).toEqual([]);
    });
  });

  describe('getProjectStatuses', () => {
    it('returns statuses when integration exists', async () => {
      const statuses = [{ id: '1', name: 'To Do', statusCategory: { key: 'new', name: 'To Do' } }];
      mockOAuthService.getIntegration.mockResolvedValue({ id: 'int-1', jiraProjectKey: 'PROJ' });
      mockApiClient.getProjectStatuses.mockResolvedValue(statuses);

      const result = await controller.getProjectStatuses('ws-1');

      expect(result).toEqual(statuses);
    });

    it('returns empty array when no integration', async () => {
      mockOAuthService.getIntegration.mockResolvedValue(null);

      const result = await controller.getProjectStatuses('ws-1');

      expect(result).toEqual([]);
    });
  });

  describe('getIssueTypes', () => {
    it('returns issue types when integration exists', async () => {
      const types = [{ id: '1', name: 'Story', subtask: false }];
      mockOAuthService.getIntegration.mockResolvedValue({ id: 'int-1', jiraProjectKey: 'PROJ' });
      mockApiClient.getIssueTypes.mockResolvedValue(types);

      const result = await controller.getIssueTypes('ws-1');

      expect(result).toEqual(types);
    });

    it('returns empty array when no integration', async () => {
      mockOAuthService.getIntegration.mockResolvedValue(null);

      const result = await controller.getIssueTypes('ws-1');

      expect(result).toEqual([]);
    });
  });
});
