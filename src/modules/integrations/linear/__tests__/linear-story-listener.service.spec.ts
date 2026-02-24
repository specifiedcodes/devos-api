/**
 * LinearStoryListenerService Tests
 * Story 21.5: Linear Two-Way Sync (AC8)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { LinearStoryListenerService } from '../services/linear-story-listener.service';
import { LinearIntegration } from '../../../../database/entities/linear-integration.entity';

describe('LinearStoryListenerService', () => {
  let service: LinearStoryListenerService;

  const mockIntegrationRepo = {
    findOne: jest.fn(),
  };

  const mockSyncQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinearStoryListenerService,
        { provide: getRepositoryToken(LinearIntegration), useValue: mockIntegrationRepo },
        { provide: getQueueToken('linear-sync'), useValue: mockSyncQueue },
      ],
    }).compile();

    service = module.get<LinearStoryListenerService>(LinearStoryListenerService);
  });

  describe('onStoryChanged', () => {
    it('queues sync job when integration is active', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce({
        id: 'int-1',
        workspaceId: 'ws-1',
        isActive: true,
        syncDirection: 'bidirectional',
      });

      await service.onStoryChanged('ws-1', 'story-1', 'updated');

      expect(mockSyncQueue.add).toHaveBeenCalledWith(
        'sync-story',
        expect.objectContaining({
          type: 'devos_to_linear',
          workspaceId: 'ws-1',
          storyId: 'story-1',
        }),
        expect.objectContaining({
          delay: 2000,
        }),
      );
    });

    it('skips when no integration exists', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(null);

      await service.onStoryChanged('ws-1', 'story-1', 'updated');

      expect(mockSyncQueue.add).not.toHaveBeenCalled();
    });

    it('skips when integration is inactive', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce(null); // isActive: true filter won't match

      await service.onStoryChanged('ws-1', 'story-1', 'updated');

      expect(mockSyncQueue.add).not.toHaveBeenCalled();
    });

    it('skips when sync direction is linear_to_devos', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce({
        id: 'int-1',
        workspaceId: 'ws-1',
        isActive: true,
        syncDirection: 'linear_to_devos',
      });

      await service.onStoryChanged('ws-1', 'story-1', 'updated');

      expect(mockSyncQueue.add).not.toHaveBeenCalled();
    });

    it('uses 2-second delay for debouncing', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce({
        id: 'int-1',
        workspaceId: 'ws-1',
        isActive: true,
        syncDirection: 'bidirectional',
      });

      await service.onStoryChanged('ws-1', 'story-1', 'created');

      expect(mockSyncQueue.add).toHaveBeenCalledWith(
        'sync-story',
        expect.any(Object),
        expect.objectContaining({ delay: 2000 }),
      );
    });

    it('handles queue errors gracefully (logs, does not throw)', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce({
        id: 'int-1',
        workspaceId: 'ws-1',
        isActive: true,
        syncDirection: 'bidirectional',
      });
      mockSyncQueue.add.mockRejectedValueOnce(new Error('Queue error'));

      // Should not throw
      await expect(
        service.handleStoryChanged({
          workspaceId: 'ws-1',
          storyId: 'story-1',
          changeType: 'updated',
        }),
      ).resolves.not.toThrow();
    });

    it('includes storyId in job ID for deduplication', async () => {
      mockIntegrationRepo.findOne.mockResolvedValueOnce({
        id: 'int-1',
        workspaceId: 'ws-1',
        isActive: true,
        syncDirection: 'bidirectional',
      });

      await service.onStoryChanged('ws-1', 'story-123', 'updated');

      expect(mockSyncQueue.add).toHaveBeenCalledWith(
        'sync-story',
        expect.any(Object),
        expect.objectContaining({
          jobId: expect.stringContaining('story-123'),
        }),
      );
    });
  });
});
