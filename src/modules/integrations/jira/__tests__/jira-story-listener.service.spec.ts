/**
 * JiraStoryListenerService Tests
 * Story 21.6: Jira Two-Way Sync (AC8)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { JiraStoryListenerService } from '../services/jira-story-listener.service';
import { JiraIntegration } from '../../../../database/entities/jira-integration.entity';

describe('JiraStoryListenerService', () => {
  let service: JiraStoryListenerService;

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
        JiraStoryListenerService,
        { provide: getRepositoryToken(JiraIntegration), useValue: mockIntegrationRepo },
        { provide: getQueueToken('jira-sync'), useValue: mockSyncQueue },
      ],
    }).compile();

    service = module.get<JiraStoryListenerService>(JiraStoryListenerService);
  });

  describe('onModuleInit', () => {
    it('logs initialization message', () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      service.onModuleInit();
      expect(logSpy).toHaveBeenCalledWith('JiraStoryListenerService initialized');
    });
  });

  describe('handleStoryChanged', () => {
    it('delegates to onStoryChanged with event payload fields', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({ id: 'int-1', syncDirection: 'bidirectional', isActive: true });

      await service.handleStoryChanged({
        workspaceId: 'ws-1',
        storyId: 'story-1',
        changeType: 'updated',
      });

      expect(mockSyncQueue.add).toHaveBeenCalledWith(
        'sync-story',
        expect.objectContaining({ workspaceId: 'ws-1', storyId: 'story-1' }),
        expect.any(Object),
      );
    });

    it('catches and logs errors without throwing', async () => {
      mockIntegrationRepo.findOne.mockRejectedValue(new Error('DB error'));
      const errorSpy = jest.spyOn(service['logger'], 'error');

      await expect(
        service.handleStoryChanged({ workspaceId: 'ws-1', storyId: 'story-1', changeType: 'created' }),
      ).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('onStoryChanged', () => {
    it('queues sync job when active Jira integration exists', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({ id: 'int-1', syncDirection: 'bidirectional', isActive: true });

      await service.onStoryChanged('ws-1', 'story-1', 'updated');

      expect(mockSyncQueue.add).toHaveBeenCalledWith(
        'sync-story',
        expect.objectContaining({
          type: 'devos_to_jira',
          workspaceId: 'ws-1',
          storyId: 'story-1',
        }),
        expect.objectContaining({
          delay: 2000,
        }),
      );
    });

    it('does nothing when no integration exists', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue(null);

      await service.onStoryChanged('ws-1', 'story-1', 'created');

      expect(mockSyncQueue.add).not.toHaveBeenCalled();
    });

    it('skips sync when direction is jira_to_devos', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({ id: 'int-1', syncDirection: 'jira_to_devos', isActive: true });

      await service.onStoryChanged('ws-1', 'story-1', 'updated');

      expect(mockSyncQueue.add).not.toHaveBeenCalled();
    });

    it('queues sync when direction is devos_to_jira', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({ id: 'int-1', syncDirection: 'devos_to_jira', isActive: true });

      await service.onStoryChanged('ws-1', 'story-1', 'status_changed');

      expect(mockSyncQueue.add).toHaveBeenCalled();
    });

    it('queues sync when direction is bidirectional', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({ id: 'int-1', syncDirection: 'bidirectional', isActive: true });

      await service.onStoryChanged('ws-1', 'story-1', 'created');

      expect(mockSyncQueue.add).toHaveBeenCalled();
    });

    it('includes 2-second delay for debounce', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({ id: 'int-1', syncDirection: 'bidirectional', isActive: true });

      await service.onStoryChanged('ws-1', 'story-1', 'updated');

      expect(mockSyncQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ delay: 2000 }),
      );
    });

    it('includes removeOnComplete in job options', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({ id: 'int-1', syncDirection: 'bidirectional', isActive: true });

      await service.onStoryChanged('ws-1', 'story-1', 'updated');

      expect(mockSyncQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ removeOnComplete: { age: 86400 } }),
      );
    });

    it('generates unique jobId per story', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({ id: 'int-1', syncDirection: 'bidirectional', isActive: true });

      await service.onStoryChanged('ws-1', 'story-1', 'updated');

      expect(mockSyncQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          jobId: expect.stringContaining('devos-to-jira:story-1:'),
        }),
      );
    });
  });
});
