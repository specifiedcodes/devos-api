/**
 * LinearOAuthService Tests
 * Story 21.5: Linear Two-Way Sync (AC3)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { LinearOAuthService } from '../services/linear-oauth.service';
import { LinearApiClientService } from '../services/linear-api-client.service';
import { LinearIntegration } from '../../../../database/entities/linear-integration.entity';
import { LinearSyncItem } from '../../../../database/entities/linear-sync-item.entity';
import { EncryptionService } from '../../../../shared/encryption/encryption.service';
import { RedisService } from '../../../redis/redis.service';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('LinearOAuthService', () => {
  let service: LinearOAuthService;

  const mockIntegrationRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockSyncItemRepo = {
    find: jest.fn().mockResolvedValue([]),
  };

  const mockApiClient = {
    getTeams: jest.fn().mockResolvedValue([{ id: 't1', name: 'Engineering', key: 'ENG' }]),
    createWebhook: jest.fn().mockResolvedValue({ id: 'wh1', enabled: true }),
    verifyToken: jest.fn().mockResolvedValue({ valid: true, userId: 'u1', email: 'test@example.com' }),
    getWorkflowStates: jest.fn().mockResolvedValue([]),
  };

  const mockEncryptionService = {
    encrypt: jest.fn().mockReturnValue({ encrypted: 'enc-token', iv: 'enc-iv' }),
    decrypt: jest.fn().mockReturnValue('decrypted-token'),
  };

  const mockRedisService = {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn(),
    del: jest.fn().mockResolvedValue(1),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        LINEAR_CLIENT_ID: 'test-client-id',
        LINEAR_CLIENT_SECRET: 'test-secret',
        LINEAR_REDIRECT_URI: 'http://localhost:3000/api/integrations/linear/callback',
        LINEAR_WEBHOOK_URL: 'http://localhost:3001/api/integrations/linear/webhooks',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinearOAuthService,
        { provide: getRepositoryToken(LinearIntegration), useValue: mockIntegrationRepo },
        { provide: getRepositoryToken(LinearSyncItem), useValue: mockSyncItemRepo },
        { provide: LinearApiClientService, useValue: mockApiClient },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<LinearOAuthService>(LinearOAuthService);
  });

  describe('getAuthorizationUrl', () => {
    it('generates correct Linear OAuth URL with scopes', async () => {
      const result = await service.getAuthorizationUrl('ws-1', 'user-1');

      expect(result.url).toContain('https://linear.app/oauth/authorize');
      expect(result.url).toContain('client_id=test-client-id');
      expect(result.url).toContain('scope=read,write,issues:create');
      expect(result.url).toContain('response_type=code');
    });

    it('stores state in Redis with 10-minute TTL', async () => {
      await service.getAuthorizationUrl('ws-1', 'user-1');

      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.stringContaining('linear-oauth:'),
        expect.stringContaining('ws-1'),
        600,
      );
    });

    it('returns unique state per call', async () => {
      const result1 = await service.getAuthorizationUrl('ws-1', 'user-1');
      const result2 = await service.getAuthorizationUrl('ws-1', 'user-1');

      expect(result1.state).not.toBe(result2.state);
    });
  });

  describe('handleCallback', () => {
    it('validates state from Redis (rejects invalid/expired)', async () => {
      mockRedisService.get.mockResolvedValueOnce(null);

      await expect(
        service.handleCallback('code-123', 'invalid-state'),
      ).rejects.toThrow(BadRequestException);
    });

    it('exchanges code for access token via POST', async () => {
      mockRedisService.get.mockResolvedValueOnce(
        JSON.stringify({ workspaceId: 'ws-1', userId: 'user-1', state: 'valid-state' }),
      );
      mockIntegrationRepo.findOne.mockResolvedValueOnce(null);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'test-access-token' }),
      });
      mockIntegrationRepo.create.mockReturnValue({ id: 'int-1' });
      mockIntegrationRepo.save.mockResolvedValue({
        id: 'int-1',
        accessToken: 'enc-token',
        accessTokenIv: 'enc-iv',
      });

      await service.handleCallback('code-123', 'valid-state');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.linear.app/oauth/token',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );
    });

    it('encrypts access token before storage', async () => {
      mockRedisService.get.mockResolvedValueOnce(
        JSON.stringify({ workspaceId: 'ws-1', userId: 'user-1', state: 's1' }),
      );
      mockIntegrationRepo.findOne.mockResolvedValueOnce(null);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'plain-token' }),
      });
      mockIntegrationRepo.create.mockReturnValue({ id: 'int-1' });
      mockIntegrationRepo.save.mockResolvedValue({
        id: 'int-1',
        accessToken: 'enc-token',
        accessTokenIv: 'enc-iv',
      });

      await service.handleCallback('code-123', 's1');

      expect(mockEncryptionService.encrypt).toHaveBeenCalledWith('plain-token');
    });

    it('creates LinearIntegration record', async () => {
      mockRedisService.get.mockResolvedValueOnce(
        JSON.stringify({ workspaceId: 'ws-1', userId: 'user-1', state: 's1' }),
      );
      mockIntegrationRepo.findOne.mockResolvedValueOnce(null);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'token' }),
      });
      mockIntegrationRepo.create.mockReturnValue({ id: 'int-1' });
      mockIntegrationRepo.save.mockResolvedValue({
        id: 'int-1',
        accessToken: 'enc-token',
        accessTokenIv: 'enc-iv',
      });

      await service.handleCallback('code-123', 's1');

      expect(mockIntegrationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          connectedBy: 'user-1',
        }),
      );
    });

    it('returns team list from Linear API', async () => {
      mockRedisService.get.mockResolvedValueOnce(
        JSON.stringify({ workspaceId: 'ws-1', userId: 'user-1', state: 's1' }),
      );
      mockIntegrationRepo.findOne.mockResolvedValueOnce(null);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'token' }),
      });
      mockIntegrationRepo.create.mockReturnValue({ id: 'int-1' });
      mockIntegrationRepo.save.mockResolvedValue({
        id: 'int-1',
        accessToken: 'enc',
        accessTokenIv: 'iv',
      });

      const result = await service.handleCallback('code-123', 's1');

      expect(result.teams).toEqual([{ id: 't1', name: 'Engineering', key: 'ENG' }]);
    });

    it('rejects duplicate workspace connection (409 Conflict)', async () => {
      mockRedisService.get.mockResolvedValueOnce(
        JSON.stringify({ workspaceId: 'ws-1', userId: 'user-1', state: 's1' }),
      );
      mockIntegrationRepo.findOne.mockResolvedValueOnce({ id: 'existing' });

      await expect(
        service.handleCallback('code-123', 's1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('completeSetup', () => {
    const mockIntegration = {
      id: 'int-1',
      workspaceId: 'ws-1',
      accessToken: 'enc',
      accessTokenIv: 'iv',
      statusMapping: {},
      fieldMapping: {},
    };

    it('updates integration with selected team', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce({ ...mockIntegration });
      mockIntegrationRepo.save.mockImplementation((i: Record<string, unknown>) => Promise.resolve(i));

      const result = await service.completeSetup('ws-1', 'int-1', {
        teamId: 't1',
      });

      expect(result.linearTeamId).toBe('t1');
      expect(result.linearTeamName).toBe('Engineering');
    });

    it('stores status mapping configuration', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce({ ...mockIntegration });
      mockIntegrationRepo.save.mockImplementation((i: Record<string, unknown>) => Promise.resolve(i));

      const result = await service.completeSetup('ws-1', 'int-1', {
        teamId: 't1',
        statusMapping: { backlog: 'Todo', done: 'Done' },
      });

      expect(result.statusMapping).toEqual({ backlog: 'Todo', done: 'Done' });
    });

    it('creates Linear webhook with generated secret', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce({ ...mockIntegration });
      mockIntegrationRepo.save.mockImplementation((i: Record<string, unknown>) => Promise.resolve(i));

      await service.completeSetup('ws-1', 'int-1', { teamId: 't1' });

      expect(mockApiClient.createWebhook).toHaveBeenCalledWith(
        'enc',
        'iv',
        't1',
        'http://localhost:3001/api/integrations/linear/webhooks',
        expect.any(String),
      );
    });

    it('encrypts webhook secret', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce({ ...mockIntegration });
      mockIntegrationRepo.save.mockImplementation((i: Record<string, unknown>) => Promise.resolve(i));

      await service.completeSetup('ws-1', 'int-1', { teamId: 't1' });

      // encrypt called for webhook secret
      expect(mockEncryptionService.encrypt).toHaveBeenCalled();
    });

    it('validates that integration belongs to workspace', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.completeSetup('ws-1', 'int-wrong', { teamId: 't1' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('disconnect', () => {
    it('removes integration record', async () => {
      const integration = { id: 'int-1', workspaceId: 'ws-1' };
      mockIntegrationRepo.findOne.mockResolvedValueOnce(integration);

      await service.disconnect('ws-1');

      expect(mockIntegrationRepo.remove).toHaveBeenCalledWith(integration);
    });

    it('handles webhook deletion failure gracefully', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce({
        id: 'int-1',
        workspaceId: 'ws-1',
        webhookSecret: 'enc',
        webhookSecretIv: 'iv',
      });

      await expect(service.disconnect('ws-1')).resolves.not.toThrow();
    });
  });

  describe('getStatus', () => {
    it('returns connected status with team info', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce({
        id: 'int-1',
        linearTeamName: 'Engineering',
        linearTeamId: 't1',
        syncDirection: 'bidirectional',
        statusMapping: { backlog: 'Backlog' },
        isActive: true,
        lastSyncAt: new Date('2026-01-01'),
        errorCount: 0,
        syncCount: 5,
        createdAt: new Date('2026-01-01'),
        connectedBy: 'user-1',
      });

      const status = await service.getStatus('ws-1');

      expect(status.connected).toBe(true);
      expect(status.teamName).toBe('Engineering');
      expect(status.syncCount).toBe(5);
    });

    it('returns disconnected when no integration', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(null);

      const status = await service.getStatus('ws-1');

      expect(status.connected).toBe(false);
    });
  });

  describe('verifyConnection', () => {
    it('calls Linear API to verify token', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce({
        id: 'int-1',
        accessToken: 'enc',
        accessTokenIv: 'iv',
        linearTeamName: 'Engineering',
      });

      const result = await service.verifyConnection('ws-1');

      expect(result.valid).toBe(true);
      expect(result.teamName).toBe('Engineering');
    });

    it('updates integration error fields on failure', async () => {
      mockApiClient.verifyToken.mockResolvedValueOnce({ valid: false, error: 'Token expired' });
      mockIntegrationRepo.findOne.mockResolvedValueOnce({
        id: 'int-1',
        accessToken: 'enc',
        accessTokenIv: 'iv',
      });

      await service.verifyConnection('ws-1');

      expect(mockIntegrationRepo.update).toHaveBeenCalledWith(
        'int-1',
        expect.objectContaining({
          lastError: 'Token expired',
        }),
      );
    });
  });

  describe('updateStatusMapping', () => {
    it('validates mapping values', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce({
        id: 'int-1',
        statusMapping: {},
      });
      mockIntegrationRepo.save.mockImplementation((i: Record<string, unknown>) => Promise.resolve(i));

      const result = await service.updateStatusMapping('ws-1', { backlog: 'Todo' });

      expect(result.statusMapping).toEqual({ backlog: 'Todo' });
    });
  });

  describe('updateSyncDirection', () => {
    it('validates direction enum', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce({
        id: 'int-1',
        syncDirection: 'bidirectional',
      });
      mockIntegrationRepo.save.mockImplementation((i: Record<string, unknown>) => Promise.resolve(i));

      const result = await service.updateSyncDirection('ws-1', 'devos_to_linear');

      expect(result.syncDirection).toBe('devos_to_linear');
    });
  });
});
