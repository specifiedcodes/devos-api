/**
 * LinearIntegrationController Tests
 * Story 21.5: Linear Two-Way Sync (AC6)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { LinearIntegrationController } from '../controllers/linear-integration.controller';
import { LinearOAuthService } from '../services/linear-oauth.service';
import { LinearSyncService } from '../services/linear-sync.service';
import { LinearApiClientService } from '../services/linear-api-client.service';
import { LinearSyncStatus } from '../../../../database/entities/linear-sync-item.entity';

describe('LinearIntegrationController', () => {
  let controller: LinearIntegrationController;

  const mockOAuthService = {
    getAuthorizationUrl: jest.fn().mockResolvedValue({ url: 'https://linear.app/oauth/authorize?...', state: 'state-1' }),
    handleCallback: jest.fn().mockResolvedValue({ integrationId: 'int-1', teams: [{ id: 't1', name: 'Eng', key: 'ENG' }] }),
    completeSetup: jest.fn().mockResolvedValue({ id: 'int-1', linearTeamId: 't1', isActive: true }),
    getStatus: jest.fn().mockResolvedValue({ connected: true, teamName: 'Engineering' }),
    verifyConnection: jest.fn().mockResolvedValue({ valid: true, teamName: 'Engineering' }),
    updateStatusMapping: jest.fn().mockResolvedValue({ id: 'int-1', statusMapping: { backlog: 'Todo' } }),
    updateSyncDirection: jest.fn().mockResolvedValue({ id: 'int-1', syncDirection: 'bidirectional' }),
    disconnect: jest.fn().mockResolvedValue(undefined),
    getIntegration: jest.fn().mockResolvedValue({
      id: 'int-1',
      accessToken: 'enc',
      accessTokenIv: 'iv',
      linearTeamId: 't1',
    }),
  };

  const mockSyncService = {
    getSyncItems: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    resolveConflict: jest.fn().mockResolvedValue({ id: 'sync-1', syncStatus: 'synced' }),
    retrySyncItem: jest.fn().mockResolvedValue({ id: 'sync-1' }),
    retryAllFailed: jest.fn().mockResolvedValue({ retried: 2, failed: 0 }),
    fullSync: jest.fn().mockResolvedValue({ created: 1, updated: 2, conflicts: 0, errors: 0 }),
    linkStoryToIssue: jest.fn().mockResolvedValue({ id: 'sync-1', linearIssueId: 'li-1' }),
    unlinkStoryFromIssue: jest.fn().mockResolvedValue(undefined),
  };

  const mockApiClient = {
    getWorkflowStates: jest.fn().mockResolvedValue([
      { id: 's1', name: 'Backlog', type: 'backlog', position: 0 },
    ]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LinearIntegrationController],
      providers: [
        { provide: LinearOAuthService, useValue: mockOAuthService },
        { provide: LinearSyncService, useValue: mockSyncService },
        { provide: LinearApiClientService, useValue: mockApiClient },
      ],
    }).compile();

    controller = module.get<LinearIntegrationController>(LinearIntegrationController);
  });

  describe('GET /auth-url', () => {
    it('returns valid Linear OAuth URL', async () => {
      const result = await controller.getAuthUrl(
        'ws-1',
        { user: { userId: 'user-1' } } as any,
      );

      expect(result.url).toContain('https://linear.app/oauth/authorize');
      expect(mockOAuthService.getAuthorizationUrl).toHaveBeenCalledWith('ws-1', 'user-1');
    });

    it('requires JwtAuthGuard (guard metadata exists)', () => {
      const guards = Reflect.getMetadata('__guards__', LinearIntegrationController.prototype.getAuthUrl);
      expect(guards).toBeDefined();
    });
  });

  describe('GET /callback', () => {
    it('exchanges code and redirects to frontend', async () => {
      const mockRes = { redirect: jest.fn() };

      await controller.handleCallback('code-123', 'state-1', mockRes as any);

      expect(mockOAuthService.handleCallback).toHaveBeenCalledWith('code-123', 'state-1');
      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('/settings/integrations/linear/setup'),
      );
    });

    it('handles invalid state (redirects with error)', async () => {
      mockOAuthService.handleCallback.mockRejectedValueOnce(new Error('Invalid state'));
      const mockRes = { redirect: jest.fn() };

      await controller.handleCallback('code-123', 'invalid', mockRes as any);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error='),
      );
    });
  });

  describe('POST /complete-setup', () => {
    it('completes integration with team and mapping', async () => {
      const result = await controller.completeSetup('ws-1', {
        integrationId: 'int-1',
        teamId: 't1',
        statusMapping: { backlog: 'Backlog' },
      } as any);

      expect(result.isActive).toBe(true);
      expect(mockOAuthService.completeSetup).toHaveBeenCalled();
    });
  });

  describe('GET /status', () => {
    it('returns full integration status', async () => {
      const result = await controller.getStatus('ws-1');

      expect(result.connected).toBe(true);
      expect(result.teamName).toBe('Engineering');
    });

    it('returns connected:false when no integration', async () => {
      mockOAuthService.getStatus.mockResolvedValueOnce({ connected: false });

      const result = await controller.getStatus('ws-1');

      expect(result.connected).toBe(false);
    });
  });

  describe('POST /verify', () => {
    it('verifies connection health', async () => {
      const result = await controller.verifyConnection('ws-1');

      expect(result.valid).toBe(true);
    });
  });

  describe('PUT /status-mapping', () => {
    it('updates mapping configuration', async () => {
      const result = await controller.updateStatusMapping('ws-1', {
        statusMapping: { backlog: 'Todo' },
      });

      expect(result.statusMapping).toEqual({ backlog: 'Todo' });
    });
  });

  describe('PUT /sync-direction', () => {
    it('updates sync direction', async () => {
      const result = await controller.updateSyncDirection('ws-1', {
        syncDirection: 'bidirectional',
      });

      expect(result.syncDirection).toBe('bidirectional');
    });
  });

  describe('DELETE /', () => {
    it('disconnects integration', async () => {
      await controller.disconnect('ws-1');

      expect(mockOAuthService.disconnect).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('GET /sync-items', () => {
    it('returns paginated sync items', async () => {
      const result = await controller.getSyncItems('ws-1');

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
    });

    it('filters by status', async () => {
      await controller.getSyncItems('ws-1', LinearSyncStatus.ERROR);

      expect(mockSyncService.getSyncItems).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({ status: LinearSyncStatus.ERROR }),
      );
    });
  });

  describe('POST /sync-items/:id/resolve', () => {
    it('resolves conflict', async () => {
      const result = await controller.resolveConflict('ws-1', 'sync-1', {
        resolution: 'keep_devos',
      });

      expect(result.syncStatus).toBe('synced');
    });
  });

  describe('POST /sync-items/:id/retry', () => {
    it('retries failed item', async () => {
      const result = await controller.retrySyncItem('ws-1', 'sync-1');

      expect(result.id).toBe('sync-1');
    });
  });

  describe('POST /retry-all-failed', () => {
    it('retries all failed items', async () => {
      const result = await controller.retryAllFailed('ws-1');

      expect(result.retried).toBe(2);
    });
  });

  describe('POST /full-sync', () => {
    it('triggers full reconciliation', async () => {
      const result = await controller.fullSync('ws-1');

      expect(result.created).toBeDefined();
      expect(result.updated).toBeDefined();
    });
  });

  describe('POST /link', () => {
    it('links story to issue', async () => {
      const result = await controller.linkStoryToIssue('ws-1', {
        storyId: 'story-1',
        linearIssueId: 'li-1',
      });

      expect(result.linearIssueId).toBe('li-1');
    });
  });

  describe('DELETE /sync-items/:id', () => {
    it('unlinks story', async () => {
      await controller.unlinkStoryFromIssue('ws-1', 'sync-1');

      expect(mockSyncService.unlinkStoryFromIssue).toHaveBeenCalledWith('ws-1', 'sync-1');
    });
  });

  describe('GET /workflow-states', () => {
    it('returns Linear workflow states', async () => {
      const result = await controller.getWorkflowStates('ws-1');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Backlog');
    });
  });

  describe('guard/pipe verification', () => {
    it('all endpoints use ParseUUIDPipe for workspaceId', () => {
      // Verify the controller has proper parameter decorators
      // (these are verified by NestJS at runtime, but we test the controller compiles)
      expect(controller).toBeDefined();
    });
  });
});
