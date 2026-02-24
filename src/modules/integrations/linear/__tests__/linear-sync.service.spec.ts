/**
 * LinearSyncService Tests
 * Story 21.5: Linear Two-Way Sync (AC4)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { LinearSyncService } from '../services/linear-sync.service';
import { LinearApiClientService } from '../services/linear-api-client.service';
import { LinearIntegration } from '../../../../database/entities/linear-integration.entity';
import { LinearSyncItem, LinearSyncStatus } from '../../../../database/entities/linear-sync-item.entity';
import { Story } from '../../../../database/entities/story.entity';
import { RedisService } from '../../../redis/redis.service';

describe('LinearSyncService', () => {
  let service: LinearSyncService;

  const mockIntegrationRepo = {
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const mockSyncItemRepo = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((data: Record<string, unknown>) => ({ ...data })),
    save: jest.fn((data: Record<string, unknown>) => Promise.resolve({ id: 'sync-1', ...data })),
    remove: jest.fn().mockResolvedValue({}),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getCount: jest.fn().mockResolvedValue(0),
    }),
  };

  const mockStoryRepo = {
    findOne: jest.fn(),
    save: jest.fn((data: Record<string, unknown>) => Promise.resolve(data)),
  };

  const mockApiClient = {
    createIssue: jest.fn().mockResolvedValue({ id: 'li-1', identifier: 'ENG-1', url: 'https://linear.app/ENG-1' }),
    updateIssue: jest.fn().mockResolvedValue({ id: 'li-1', identifier: 'ENG-1', updatedAt: '2026-01-01T00:00:00Z' }),
    getIssue: jest.fn().mockResolvedValue({
      id: 'li-1',
      identifier: 'ENG-1',
      title: 'Linear Title',
      description: 'Linear Description',
      url: 'https://linear.app/ENG-1',
      state: { id: 's1', name: 'Backlog', type: 'backlog' },
      priority: 3,
      estimate: 5,
      updatedAt: '2026-01-01T00:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
    }),
  };

  const mockRedisService = {
    set: jest.fn().mockResolvedValue('OK'),
    setnx: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };

  const baseIntegration = {
    id: 'int-1',
    workspaceId: 'ws-1',
    linearTeamId: 't1',
    accessToken: 'enc',
    accessTokenIv: 'iv',
    isActive: true,
    syncDirection: 'bidirectional' as const,
    statusMapping: { backlog: 'Backlog', in_progress: 'In Progress', review: 'In Review', done: 'Done' },
    fieldMapping: { title: 'title', description: 'description', storyPoints: 'estimate', priority: 'priority' },
  };

  const baseStory = {
    id: 'story-1',
    projectId: 'proj-1',
    title: 'Test Story',
    description: 'Test Description',
    status: 'backlog',
    storyPoints: 3,
    project: { workspaceId: 'ws-1' },
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinearSyncService,
        { provide: getRepositoryToken(LinearIntegration), useValue: mockIntegrationRepo },
        { provide: getRepositoryToken(LinearSyncItem), useValue: mockSyncItemRepo },
        { provide: getRepositoryToken(Story), useValue: mockStoryRepo },
        { provide: LinearApiClientService, useValue: mockApiClient },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<LinearSyncService>(LinearSyncService);
  });

  describe('syncStoryToLinear', () => {
    it('creates Linear issue for new story (no existing sync item)', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      mockSyncItemRepo.findOne.mockResolvedValueOnce(null);
      mockStoryRepo.findOne.mockResolvedValueOnce(baseStory);

      const result = await service.syncStoryToLinear('ws-1', 'story-1');

      expect(mockApiClient.createIssue).toHaveBeenCalled();
      expect(result.linearIssueId).toBe('li-1');
      expect(result.syncStatus).toBe(LinearSyncStatus.SYNCED);
    });

    it('updates Linear issue for existing sync item', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      mockSyncItemRepo.findOne.mockResolvedValueOnce({
        id: 'sync-1',
        linearIssueId: 'li-1',
        devosStoryId: 'story-1',
        linearIntegrationId: 'int-1',
      });
      mockStoryRepo.findOne.mockResolvedValueOnce(baseStory);

      await service.syncStoryToLinear('ws-1', 'story-1');

      expect(mockApiClient.updateIssue).toHaveBeenCalled();
    });

    it('maps DevOS status to Linear status using statusMapping', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      mockSyncItemRepo.findOne.mockResolvedValueOnce(null);
      mockStoryRepo.findOne.mockResolvedValueOnce({ ...baseStory, status: 'in_progress' });

      await service.syncStoryToLinear('ws-1', 'story-1');

      expect(mockApiClient.createIssue).toHaveBeenCalledWith(
        'enc',
        'iv',
        expect.objectContaining({
          stateId: 'In Progress',
        }),
      );
    });

    it('acquires and releases distributed lock', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      mockSyncItemRepo.findOne.mockResolvedValueOnce(null);
      mockStoryRepo.findOne.mockResolvedValueOnce(baseStory);

      await service.syncStoryToLinear('ws-1', 'story-1');

      expect(mockRedisService.setnx).toHaveBeenCalledWith(
        'linear-sync-lock:story-1',
        'locked',
        expect.any(Number),
      );
      expect(mockRedisService.del).toHaveBeenCalledWith('linear-sync-lock:story-1');
    });

    it('queues retry when lock acquisition fails', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      mockRedisService.setnx.mockResolvedValueOnce(null); // Lock not acquired

      await expect(
        service.syncStoryToLinear('ws-1', 'story-1'),
      ).rejects.toThrow('Sync lock unavailable');
    });

    it('respects sync_direction (skips if linear_to_devos only)', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce({
        ...baseIntegration,
        syncDirection: 'linear_to_devos',
      });
      mockSyncItemRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.syncStoryToLinear('ws-1', 'story-1'),
      ).rejects.toThrow();
    });

    it('handles API error (marks sync item as error)', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      mockSyncItemRepo.findOne.mockResolvedValueOnce({
        id: 'sync-1',
        linearIssueId: 'li-1',
        devosStoryId: 'story-1',
        linearIntegrationId: 'int-1',
      });
      mockStoryRepo.findOne.mockResolvedValueOnce(baseStory);
      mockApiClient.updateIssue.mockRejectedValueOnce(new Error('API Error'));

      await expect(
        service.syncStoryToLinear('ws-1', 'story-1'),
      ).rejects.toThrow('API Error');

      expect(mockSyncItemRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          syncStatus: LinearSyncStatus.ERROR,
        }),
      );
    });
  });

  describe('syncLinearToDevos', () => {
    it('updates DevOS story from Linear issue', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      mockSyncItemRepo.findOne.mockResolvedValueOnce({
        id: 'sync-1',
        devosStoryId: 'story-1',
        linearIssueId: 'li-1',
        lastSyncedAt: new Date('2026-01-01'),
        lastDevosUpdateAt: null,
      });
      mockStoryRepo.findOne.mockResolvedValueOnce(baseStory);

      const result = await service.syncLinearToDevos('int-1', 'li-1', {
        title: 'Updated from Linear',
        state: { id: 's2', name: 'In Progress', type: 'started' },
      } as any);

      expect(result.syncDirectionLast).toBe('linear_to_devos');
      expect(mockStoryRepo.save).toHaveBeenCalled();
    });

    it('reverse-maps Linear status to DevOS status', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      mockSyncItemRepo.findOne.mockResolvedValueOnce({
        id: 'sync-1',
        devosStoryId: 'story-1',
        linearIssueId: 'li-1',
        lastSyncedAt: new Date('2026-01-01'),
        lastDevosUpdateAt: null,
      });
      mockStoryRepo.findOne.mockResolvedValueOnce({ ...baseStory });

      await service.syncLinearToDevos('int-1', 'li-1', {
        state: { id: 's3', name: 'In Review', type: 'completed' },
      } as any);

      expect(mockStoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'review' }),
      );
    });

    it('respects sync_direction (skips if devos_to_linear only)', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce({
        ...baseIntegration,
        syncDirection: 'devos_to_linear',
      });
      mockSyncItemRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.syncLinearToDevos('int-1', 'li-1', {}),
      ).rejects.toThrow();
    });

    it('detects conflict when both sides changed', async () => {
      const now = new Date();
      const lastSync = new Date(now.getTime() - 60000);
      const afterSync = new Date(now.getTime() - 30000);

      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      mockSyncItemRepo.findOne.mockResolvedValueOnce({
        id: 'sync-1',
        devosStoryId: 'story-1',
        linearIssueId: 'li-1',
        lastSyncedAt: lastSync,
        lastDevosUpdateAt: afterSync, // DevOS updated after last sync
      });
      mockStoryRepo.findOne.mockResolvedValueOnce(baseStory);

      const result = await service.syncLinearToDevos('int-1', 'li-1', {
        title: 'Updated',
      } as any);

      expect(result.syncStatus).toBe(LinearSyncStatus.CONFLICT);
    });

    it('stores conflict details with both values', async () => {
      const now = new Date();
      const lastSync = new Date(now.getTime() - 60000);
      const afterSync = new Date(now.getTime() - 30000);

      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      mockSyncItemRepo.findOne.mockResolvedValueOnce({
        id: 'sync-1',
        devosStoryId: 'story-1',
        linearIssueId: 'li-1',
        lastSyncedAt: lastSync,
        lastDevosUpdateAt: afterSync,
      });

      const result = await service.syncLinearToDevos('int-1', 'li-1', {
        title: 'Linear Title',
      } as any);

      expect(result.conflictDetails).toBeDefined();
      expect(result.conflictDetails!.conflictedFields).toContain('title');
    });
  });

  describe('resolveConflict', () => {
    it('applies DevOS values when keep_devos chosen', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      mockSyncItemRepo.findOne.mockResolvedValueOnce({
        id: 'sync-1',
        linearIssueId: 'li-1',
        devosStoryId: 'story-1',
        syncStatus: LinearSyncStatus.CONFLICT,
        linearIntegrationId: 'int-1',
        conflictDetails: { conflictedFields: ['title'] },
      });
      mockStoryRepo.findOne.mockResolvedValueOnce(baseStory);

      const result = await service.resolveConflict('ws-1', 'sync-1', 'keep_devos');

      expect(mockApiClient.updateIssue).toHaveBeenCalled();
      expect(result.syncStatus).toBe(LinearSyncStatus.SYNCED);
    });

    it('applies Linear values when keep_linear chosen', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      mockSyncItemRepo.findOne.mockResolvedValueOnce({
        id: 'sync-1',
        linearIssueId: 'li-1',
        devosStoryId: 'story-1',
        syncStatus: LinearSyncStatus.CONFLICT,
        linearIntegrationId: 'int-1',
        conflictDetails: { conflictedFields: ['title'] },
      });
      mockStoryRepo.findOne.mockResolvedValueOnce(baseStory);

      const result = await service.resolveConflict('ws-1', 'sync-1', 'keep_linear');

      expect(mockApiClient.getIssue).toHaveBeenCalled();
      expect(result.syncDirectionLast).toBe('linear_to_devos');
    });

    it('clears conflict_details and sets status to synced', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      mockSyncItemRepo.findOne.mockResolvedValueOnce({
        id: 'sync-1',
        linearIssueId: 'li-1',
        devosStoryId: 'story-1',
        syncStatus: LinearSyncStatus.CONFLICT,
        linearIntegrationId: 'int-1',
        conflictDetails: { conflictedFields: ['title'] },
      });
      mockStoryRepo.findOne.mockResolvedValueOnce(baseStory);

      const result = await service.resolveConflict('ws-1', 'sync-1', 'keep_devos');

      expect(result.conflictDetails).toBeNull();
      expect(result.syncStatus).toBe(LinearSyncStatus.SYNCED);
    });

    it('validates workspace ownership', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.resolveConflict('ws-1', 'sync-1', 'keep_devos'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('retrySyncItem', () => {
    it('re-runs sync for error items', async () => {
      mockIntegrationRepo.findOne
        .mockResolvedValueOnce(baseIntegration) // for retrySyncItem
        .mockResolvedValueOnce(baseIntegration); // for syncStoryToLinear
      mockSyncItemRepo.findOne
        .mockResolvedValueOnce({ id: 'sync-1', devosStoryId: 'story-1', linearIntegrationId: 'int-1' }) // for retrySyncItem
        .mockResolvedValueOnce({ id: 'sync-1', linearIssueId: 'li-1', devosStoryId: 'story-1', linearIntegrationId: 'int-1' }); // for syncStoryToLinear
      mockStoryRepo.findOne.mockResolvedValueOnce(baseStory);

      const result = await service.retrySyncItem('ws-1', 'sync-1');

      expect(result).toBeDefined();
    });

    it('throws NotFoundException for non-existent item', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      mockSyncItemRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.retrySyncItem('ws-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('retryAllFailed', () => {
    it('retries all error items and returns counts', async () => {
      mockIntegrationRepo.findOne
        .mockResolvedValueOnce(baseIntegration)
        .mockResolvedValueOnce(baseIntegration); // for syncStoryToLinear inside retry
      mockSyncItemRepo.find.mockResolvedValueOnce([
        { id: 'sync-1', devosStoryId: 'story-1' },
      ]);
      mockSyncItemRepo.findOne.mockResolvedValueOnce(null); // no existing sync item in syncStoryToLinear
      mockStoryRepo.findOne.mockResolvedValueOnce(baseStory);

      const result = await service.retryAllFailed('ws-1');

      expect(result.retried + result.failed).toBe(1);
    });
  });

  describe('linkStoryToIssue', () => {
    it('creates sync item for existing story and issue', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      mockStoryRepo.findOne.mockResolvedValueOnce({
        ...baseStory,
        project: { workspaceId: 'ws-1' },
      });
      mockSyncItemRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.linkStoryToIssue('ws-1', 'story-1', 'li-1');

      expect(result.linearIssueId).toBe('li-1');
      expect(result.linearIssueIdentifier).toBe('ENG-1');
    });

    it('validates story belongs to workspace', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      // Story not found (null) -> NotFoundException
      mockStoryRepo.findOne.mockReset();
      mockStoryRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.linkStoryToIssue('ws-1', 'story-1', 'li-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('validates Linear issue exists via API', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      mockStoryRepo.findOne.mockResolvedValueOnce({
        ...baseStory,
        project: { workspaceId: 'ws-1' },
      });
      mockSyncItemRepo.findOne.mockResolvedValueOnce(null); // no duplicate
      mockApiClient.getIssue.mockResolvedValueOnce(null); // issue not found

      await expect(
        service.linkStoryToIssue('ws-1', 'story-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects duplicate link (409 Conflict)', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      mockStoryRepo.findOne.mockResolvedValueOnce({
        ...baseStory,
        project: { workspaceId: 'ws-1' },
      });
      mockSyncItemRepo.findOne.mockReset();
      mockSyncItemRepo.findOne.mockResolvedValueOnce({ id: 'existing' }); // duplicate found

      await expect(
        service.linkStoryToIssue('ws-1', 'story-1', 'li-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('unlinkStoryFromIssue', () => {
    it('removes sync item without deleting story or issue', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      mockSyncItemRepo.findOne.mockResolvedValueOnce({ id: 'sync-1', linearIntegrationId: 'int-1' });

      await service.unlinkStoryFromIssue('ws-1', 'sync-1');

      expect(mockSyncItemRepo.remove).toHaveBeenCalled();
      expect(mockStoryRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getSyncItems', () => {
    it('returns paginated results', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);

      const result = await service.getSyncItems('ws-1', { page: 1, limit: 10 });

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
    });

    it('filters by sync status', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);

      await service.getSyncItems('ws-1', { status: LinearSyncStatus.ERROR });

      const queryBuilder = mockSyncItemRepo.createQueryBuilder();
      expect(queryBuilder.andWhere).toHaveBeenCalled();
    });
  });

  describe('fullSync', () => {
    it('reconciles all stories with Linear issues', async () => {
      mockIntegrationRepo.findOne
        .mockResolvedValueOnce(baseIntegration) // for fullSync
        .mockResolvedValue(baseIntegration); // for syncStoryToLinear calls
      mockSyncItemRepo.find.mockResolvedValueOnce([
        { id: 'sync-1', devosStoryId: 'story-1', linearIssueId: 'li-1' },
      ]);
      mockSyncItemRepo.findOne.mockResolvedValue({
        id: 'sync-1',
        linearIssueId: 'li-1',
        devosStoryId: 'story-1',
        linearIntegrationId: 'int-1',
      });
      mockStoryRepo.findOne.mockResolvedValue(baseStory);

      const result = await service.fullSync('ws-1');

      expect(result).toHaveProperty('created');
      expect(result).toHaveProperty('updated');
      expect(result).toHaveProperty('conflicts');
      expect(result).toHaveProperty('errors');
    });
  });

  describe('integration stats update', () => {
    it('records sync count and last_sync_at on integration after each sync', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(baseIntegration);
      mockSyncItemRepo.findOne.mockResolvedValueOnce(null);
      mockStoryRepo.findOne.mockResolvedValueOnce(baseStory);

      await service.syncStoryToLinear('ws-1', 'story-1');

      expect(mockIntegrationRepo.update).toHaveBeenCalledWith(
        'int-1',
        expect.objectContaining({
          lastSyncAt: expect.any(Date),
        }),
      );
    });
  });
});
