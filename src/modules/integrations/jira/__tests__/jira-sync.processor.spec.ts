/**
 * JiraSyncProcessor Tests
 * Story 21.6: Jira Two-Way Sync (AC7)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { JiraSyncProcessor } from '../processors/jira-sync.processor';
import { JiraSyncService } from '../services/jira-sync.service';

describe('JiraSyncProcessor', () => {
  let processor: JiraSyncProcessor;

  const mockSyncService = {
    syncStoryToJira: jest.fn(),
    syncJiraToDevos: jest.fn(),
    fullSync: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JiraSyncProcessor,
        { provide: JiraSyncService, useValue: mockSyncService },
      ],
    }).compile();

    processor = module.get<JiraSyncProcessor>(JiraSyncProcessor);
  });

  describe('handleSyncStory', () => {
    it('calls syncStoryToJira for devos_to_jira jobs', async () => {
      mockSyncService.syncStoryToJira.mockResolvedValue({ id: 'si-1' });

      const job = {
        id: 'job-1',
        data: {
          type: 'devos_to_jira',
          workspaceId: 'ws-1',
          storyId: 'story-1',
        },
      };

      await processor.handleSyncStory(job as any);

      expect(mockSyncService.syncStoryToJira).toHaveBeenCalledWith('ws-1', 'story-1');
    });

    it('throws on unknown job type', async () => {
      const job = {
        id: 'job-1',
        data: {
          type: 'unknown_type',
          workspaceId: 'ws-1',
        },
      };

      await expect(processor.handleSyncStory(job as any)).rejects.toThrow('Unknown sync job type');
    });
  });

  describe('handleSyncFromJira', () => {
    it('calls syncJiraToDevos for jira_to_devos jobs', async () => {
      mockSyncService.syncJiraToDevos.mockResolvedValue({ id: 'si-1' });

      const job = {
        id: 'job-2',
        data: {
          type: 'jira_to_devos',
          integrationId: 'int-1',
          workspaceId: 'ws-1',
          jiraIssueId: '10001',
          webhookEvent: { webhookEvent: 'jira:issue_updated' },
        },
      };

      await processor.handleSyncFromJira(job as any);

      expect(mockSyncService.syncJiraToDevos).toHaveBeenCalledWith(
        'int-1',
        '10001',
        { webhookEvent: 'jira:issue_updated' },
      );
    });
  });

  describe('handleFullSync', () => {
    it('calls fullSync for full_sync jobs', async () => {
      mockSyncService.fullSync.mockResolvedValue({ created: 1, updated: 2, conflicts: 0, errors: 0 });

      const job = {
        id: 'job-3',
        data: {
          type: 'full_sync',
          workspaceId: 'ws-1',
        },
      };

      await processor.handleFullSync(job as any);

      expect(mockSyncService.fullSync).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('error handling', () => {
    it('logs and rethrows errors', async () => {
      const error = new Error('Sync failed');
      mockSyncService.syncStoryToJira.mockRejectedValue(error);
      const errorSpy = jest.spyOn(processor['logger'], 'error');

      const job = {
        id: 'job-4',
        data: { type: 'devos_to_jira', workspaceId: 'ws-1', storyId: 'story-1' },
      };

      await expect(processor.handleSyncStory(job as any)).rejects.toThrow('Sync failed');
      expect(errorSpy).toHaveBeenCalled();
    });
  });
});
