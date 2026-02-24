/**
 * JiraOAuthService Tests
 * Story 21.6: Jira Two-Way Sync (AC3)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JiraOAuthService } from '../services/jira-oauth.service';
import { JiraApiClientService } from '../services/jira-api-client.service';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';
import { JiraIntegration } from '../../../../database/entities/jira-integration.entity';
import { JiraSyncItem } from '../../../../database/entities/jira-sync-item.entity';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('JiraOAuthService', () => {
  let service: JiraOAuthService;

  const mockIntegrationRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto: Record<string, unknown>) => ({ id: 'new-int', ...dto })),
    save: jest.fn((entity: Record<string, unknown>) => Promise.resolve({ id: entity.id || 'new-int', ...entity, createdAt: new Date(), updatedAt: new Date() })),
    remove: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  };

  const mockSyncItemRepo = {
    find: jest.fn().mockResolvedValue([]),
  };

  const mockApiClient = {
    getAccessibleSites: jest.fn().mockResolvedValue([{ id: 'site-1', url: 'https://test.atlassian.net', name: 'Test Site' }]),
    verifyToken: jest.fn().mockResolvedValue({ valid: true, accountId: 'acc-1' }),
    registerWebhook: jest.fn().mockResolvedValue({ webhookRegistrationResult: [{ createdWebhookId: 42 }] }),
    deleteWebhook: jest.fn().mockResolvedValue(undefined),
  };

  const mockEncryptionService = {
    encrypt: jest.fn().mockReturnValue({ encrypted: 'enc', iv: 'iv' }),
    decrypt: jest.fn().mockReturnValue('decrypted'),
  };

  const mockRedisService = {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn(),
    del: jest.fn().mockResolvedValue(1),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        JIRA_CLIENT_ID: 'client-id',
        JIRA_CLIENT_SECRET: 'client-secret',
        JIRA_REDIRECT_URI: 'https://app.devos.com/api/integrations/jira/callback',
        JIRA_WEBHOOK_URL: 'https://app.devos.com/api/integrations/jira/webhooks',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JiraOAuthService,
        { provide: getRepositoryToken(JiraIntegration), useValue: mockIntegrationRepo },
        { provide: getRepositoryToken(JiraSyncItem), useValue: mockSyncItemRepo },
        { provide: JiraApiClientService, useValue: mockApiClient },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<JiraOAuthService>(JiraOAuthService);
  });

  describe('getAuthorizationUrl', () => {
    it('generates correct Atlassian OAuth URL with scopes including offline_access', async () => {
      const result = await service.getAuthorizationUrl('ws-1', 'user-1');
      expect(result.url).toContain('https://auth.atlassian.com/authorize');
      expect(result.url).toContain('offline_access');
      expect(result.url).toContain('client_id=client-id');
    });

    it('stores state in Redis with 10-minute TTL', async () => {
      await service.getAuthorizationUrl('ws-1', 'user-1');
      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringContaining('jira-oauth:'),
        expect.any(String),
        600,
      );
    });

    it('returns unique state per call', async () => {
      const r1 = await service.getAuthorizationUrl('ws-1', 'user-1');
      const r2 = await service.getAuthorizationUrl('ws-1', 'user-1');
      expect(r1.state).not.toBe(r2.state);
    });
  });

  describe('handleCallback', () => {
    beforeEach(() => {
      mockRedisService.get.mockResolvedValue(JSON.stringify({ workspaceId: 'ws-1', userId: 'user-1', state: 'test-state' }));
      mockIntegrationRepo.findOne.mockResolvedValue(null);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }),
      });
    });

    it('validates state from Redis (rejects invalid/expired)', async () => {
      mockRedisService.get.mockResolvedValue(null);
      await expect(service.handleCallback('code', 'invalid-state')).rejects.toThrow(BadRequestException);
    });

    it('exchanges code for access token and refresh token via POST', async () => {
      await service.handleCallback('code', 'valid-state');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://auth.atlassian.com/oauth/token',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('encrypts both access token and refresh token before storage', async () => {
      await service.handleCallback('code', 'valid-state');
      expect(mockEncryptionService.encrypt).toHaveBeenCalledTimes(2); // access + refresh
    });

    it('stores token_expires_at based on expires_in', async () => {
      await service.handleCallback('code', 'valid-state');
      expect(mockIntegrationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenExpiresAt: expect.any(Date),
        }),
      );
    });

    it('creates JiraIntegration record', async () => {
      await service.handleCallback('code', 'valid-state');
      expect(mockIntegrationRepo.save).toHaveBeenCalled();
    });

    it('returns accessible sites list', async () => {
      const result = await service.handleCallback('code', 'valid-state');
      expect(result.sites).toEqual([{ id: 'site-1', url: 'https://test.atlassian.net', name: 'Test Site' }]);
    });

    it('rejects duplicate workspace connection (409 Conflict)', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({ id: 'existing' });
      await expect(service.handleCallback('code', 'valid-state')).rejects.toThrow(ConflictException);
    });
  });

  describe('completeSetup', () => {
    const mockIntegration = {
      id: 'int-1',
      workspaceId: 'ws-1',
      accessToken: 'enc',
      accessTokenIv: 'iv',
      isActive: false,
    };

    beforeEach(() => {
      mockIntegrationRepo.findOne.mockResolvedValue({ ...mockIntegration });
    });

    it('updates integration with selected site cloudId and URL', async () => {
      await service.completeSetup('ws-1', 'int-1', { cloudId: 'cloud-1', siteUrl: 'https://test.atlassian.net', projectKey: 'PROJ' });
      expect(mockIntegrationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ cloudId: 'cloud-1', jiraSiteUrl: 'https://test.atlassian.net' }),
      );
    });

    it('updates integration with selected project key and name', async () => {
      await service.completeSetup('ws-1', 'int-1', { cloudId: 'c1', siteUrl: 'url', projectKey: 'PROJ', projectName: 'My Project' });
      expect(mockIntegrationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ jiraProjectKey: 'PROJ', jiraProjectName: 'My Project' }),
      );
    });

    it('stores status mapping configuration', async () => {
      const mapping = { backlog: 'Open', done: 'Closed' };
      await service.completeSetup('ws-1', 'int-1', { cloudId: 'c1', siteUrl: 'url', projectKey: 'PROJ', statusMapping: mapping });
      expect(mockIntegrationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ statusMapping: mapping }),
      );
    });

    it('registers Jira webhook', async () => {
      await service.completeSetup('ws-1', 'int-1', { cloudId: 'c1', siteUrl: 'url', projectKey: 'PROJ' });
      expect(mockApiClient.registerWebhook).toHaveBeenCalled();
    });

    it('validates that integration belongs to workspace', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue(null);
      await expect(
        service.completeSetup('ws-1', 'int-1', { cloudId: 'c1', siteUrl: 'url', projectKey: 'PROJ' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('disconnect', () => {
    it('removes integration record', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({ id: 'int-1', webhookId: '42' });
      await service.disconnect('ws-1');
      expect(mockIntegrationRepo.remove).toHaveBeenCalled();
    });

    it('handles webhook deletion failure gracefully', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({ id: 'int-1', webhookId: '42' });
      mockApiClient.deleteWebhook.mockRejectedValue(new Error('Failed'));
      await service.disconnect('ws-1'); // should not throw
      expect(mockIntegrationRepo.remove).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('returns connected status with site and project info', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({
        id: 'int-1',
        jiraSiteUrl: 'https://test.atlassian.net',
        jiraProjectKey: 'PROJ',
        jiraProjectName: 'My Project',
        issueType: 'Story',
        syncDirection: 'bidirectional',
        statusMapping: {},
        isActive: true,
        errorCount: 0,
        syncCount: 5,
        tokenExpiresAt: new Date(),
        connectedBy: 'user-1',
        createdAt: new Date(),
      });

      const result = await service.getStatus('ws-1');
      expect(result.connected).toBe(true);
      expect(result.projectKey).toBe('PROJ');
    });

    it('returns disconnected when no integration', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue(null);
      const result = await service.getStatus('ws-1');
      expect(result.connected).toBe(false);
    });
  });

  describe('verifyConnection', () => {
    it('calls Jira API to verify token', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({ id: 'int-1', accessToken: 'enc', accessTokenIv: 'iv', jiraSiteUrl: 'url', jiraProjectName: 'P' });
      const result = await service.verifyConnection('ws-1');
      expect(result.valid).toBe(true);
    });

    it('updates integration error fields on failure', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({ id: 'int-1', accessToken: 'enc', accessTokenIv: 'iv' });
      mockApiClient.verifyToken.mockResolvedValue({ valid: false, error: 'Token expired' });
      await service.verifyConnection('ws-1');
      expect(mockIntegrationRepo.update).toHaveBeenCalled();
    });
  });

  describe('updateStatusMapping', () => {
    it('validates mapping values', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({ id: 'int-1', statusMapping: {} });
      const mapping = { backlog: 'Open', done: 'Closed' };
      await service.updateStatusMapping('ws-1', mapping);
      expect(mockIntegrationRepo.save).toHaveBeenCalledWith(expect.objectContaining({ statusMapping: mapping }));
    });
  });

  describe('updateSyncDirection', () => {
    it('validates direction enum', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({ id: 'int-1', syncDirection: 'bidirectional' });
      await service.updateSyncDirection('ws-1', 'devos_to_jira');
      expect(mockIntegrationRepo.save).toHaveBeenCalledWith(expect.objectContaining({ syncDirection: 'devos_to_jira' }));
    });
  });

  describe('updateIssueType', () => {
    it('validates issue type string', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({ id: 'int-1', issueType: 'Story' });
      await service.updateIssueType('ws-1', 'Bug');
      expect(mockIntegrationRepo.save).toHaveBeenCalledWith(expect.objectContaining({ issueType: 'Bug' }));
    });
  });
});
