/**
 * LinearSyncProcessor Tests
 * Story 21.5: Linear Two-Way Sync (AC7)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { LinearSyncProcessor } from '../processors/linear-sync.processor';
import { LinearSyncService } from '../services/linear-sync.service';

describe('LinearSyncProcessor', () => {
  let processor: LinearSyncProcessor;

  const mockSyncService = {
    syncStoryToLinear: jest.fn().mockResolvedValue({ id: 'sync-1', syncStatus: 'synced' }),
    syncLinearToDevos: jest.fn().mockResolvedValue({ id: 'sync-1', syncStatus: 'synced' }),
    fullSync: jest.fn().mockResolvedValue({ created: 1, updated: 2, conflicts: 0, errors: 0 }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinearSyncProcessor,
        { provide: LinearSyncService, useValue: mockSyncService },
      ],
    }).compile();

    processor = module.get<LinearSyncProcessor>(LinearSyncProcessor);
  });

  describe('handleSyncStory (devos_to_linear)', () => {
    it('calls syncStoryToLinear', async () => {
      const job = {
        id: 'job-1',
        data: {
          type: 'devos_to_linear' as const,
          workspaceId: 'ws-1',
          storyId: 'story-1',
        },
      };

      const result = await processor.handleSyncStory(job as any);

      expect(mockSyncService.syncStoryToLinear).toHaveBeenCalledWith('ws-1', 'story-1');
      expect(result).toBeDefined();
    });
  });

  describe('handleSyncFromLinear (linear_to_devos)', () => {
    it('calls syncLinearToDevos', async () => {
      const job = {
        id: 'job-2',
        data: {
          type: 'linear_to_devos' as const,
          workspaceId: 'ws-1',
          integrationId: 'int-1',
          linearIssueId: 'li-1',
          updatedFields: { title: 'Updated' },
        },
      };

      const result = await processor.handleSyncFromLinear(job as any);

      expect(mockSyncService.syncLinearToDevos).toHaveBeenCalledWith('int-1', 'li-1', { title: 'Updated' });
      expect(result).toBeDefined();
    });
  });

  describe('handleFullSync (full_sync)', () => {
    it('calls fullSync', async () => {
      const job = {
        id: 'job-3',
        data: {
          type: 'full_sync' as const,
          workspaceId: 'ws-1',
        },
      };

      const result = await processor.handleFullSync(job as any);

      expect(mockSyncService.fullSync).toHaveBeenCalledWith('ws-1');
      expect(result).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('throws error for unknown job type', async () => {
      const job = {
        id: 'job-4',
        data: {
          type: 'unknown_type',
          workspaceId: 'ws-1',
        },
      };

      await expect(
        processor.handleSyncStory(job as any),
      ).rejects.toThrow('Unknown sync job type');
    });

    it('re-throws error from sync service for BullMQ retry', async () => {
      mockSyncService.syncStoryToLinear.mockRejectedValueOnce(new Error('Sync failed'));

      const job = {
        id: 'job-5',
        data: {
          type: 'devos_to_linear' as const,
          workspaceId: 'ws-1',
          storyId: 'story-1',
        },
      };

      await expect(
        processor.handleSyncStory(job as any),
      ).rejects.toThrow('Sync failed');
    });
  });

  describe('logging', () => {
    it('logs job start', async () => {
      const logSpy = jest.spyOn(processor['logger'], 'log');

      const job = {
        id: 'job-6',
        data: {
          type: 'devos_to_linear' as const,
          workspaceId: 'ws-1',
          storyId: 'story-1',
        },
      };

      await processor.handleSyncStory(job as any);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Processing sync-story job'),
      );
    });

    it('logs job failure', async () => {
      const errorSpy = jest.spyOn(processor['logger'], 'error');
      mockSyncService.syncStoryToLinear.mockRejectedValueOnce(new Error('Failed'));

      const job = {
        id: 'job-7',
        data: {
          type: 'devos_to_linear' as const,
          workspaceId: 'ws-1',
          storyId: 'story-1',
        },
      };

      try {
        await processor.handleSyncStory(job as any);
      } catch {
        // expected
      }

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Sync job job-7 failed'),
      );
    });
  });
});
