/**
 * JiraSyncService Tests
 * Story 21.6: Jira Two-Way Sync (AC4)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JiraSyncService } from '../services/jira-sync.service';
import { JiraApiClientService } from '../services/jira-api-client.service';
import { RedisService } from '../../../redis/redis.service';
import { JiraIntegration } from '../../../../database/entities/jira-integration.entity';
import { JiraSyncItem, JiraSyncStatus } from '../../../../database/entities/jira-sync-item.entity';
import { Story } from '../../../../database/entities/story.entity';

describe('JiraSyncService', () => {
  let service: JiraSyncService;

  const mockIntegration = {
    id: 'int-1',
    workspaceId: 'ws-1',
    cloudId: 'cloud-1',
    jiraProjectKey: 'PROJ',
    issueType: 'Story',
    syncDirection: 'bidirectional' as const,
    statusMapping: { backlog: 'To Do', in_progress: 'In Progress', review: 'In Review', done: 'Done' },
    fieldMapping: { title: 'summary', description: 'description' },
    accessToken: 'enc',
    accessTokenIv: 'iv',
    isActive: true,
  };

  const mockStory = {
    id: 'story-1',
    title: 'Test Story',
    description: 'Story description',
    status: 'backlog',
    storyPoints: 3,
    project: { workspaceId: 'ws-1' },
  };

  const mockIntegrationRepo = {
    findOne: jest.fn().mockResolvedValue(mockIntegration),
    update: jest.fn().mockResolvedValue(undefined),
  };

  const mockSyncItemRepo = {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((dto: Record<string, unknown>) => dto),
    save: jest.fn((entity: Record<string, unknown>) => Promise.resolve({ id: 'sync-1', ...entity })),
    remove: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      getMany: jest.fn().mockResolvedValue([]),
    })),
  };

  const mockStoryRepo = {
    findOne: jest.fn().mockResolvedValue(mockStory),
    save: jest.fn((entity: Record<string, unknown>) => Promise.resolve(entity)),
  };

  const mockApiClient = {
    createIssue: jest.fn().mockResolvedValue({ id: '10001', key: 'PROJ-1', self: 'url' }),
    updateIssue: jest.fn().mockResolvedValue(undefined),
    transitionIssue: jest.fn().mockResolvedValue(undefined),
    getIssueTransitions: jest.fn().mockResolvedValue([
      { id: '11', name: 'Start Progress', to: { id: '3', name: 'In Progress' } },
      { id: '21', name: 'To Done', to: { id: '4', name: 'Done' } },
    ]),
    getIssue: jest.fn().mockResolvedValue({
      id: '10001',
      key: 'PROJ-1',
      self: 'url',
      fields: {
        summary: 'Jira Title',
        description: { version: 1, type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Jira desc' }] }] },
        status: { id: '1', name: 'To Do', statusCategory: { key: 'new', name: 'To Do' } },
        issuetype: { id: '1', name: 'Story', subtask: false },
      },
    }),
  };

  const mockRedisService = {
    setnx: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Re-establish default mock implementations after clearAllMocks
    mockIntegrationRepo.findOne.mockResolvedValue(mockIntegration);
    mockIntegrationRepo.update.mockResolvedValue(undefined);
    mockSyncItemRepo.findOne.mockResolvedValue(null);
    mockSyncItemRepo.find.mockResolvedValue([]);
    mockSyncItemRepo.create.mockImplementation((dto: Record<string, unknown>) => dto);
    mockSyncItemRepo.save.mockImplementation((entity: Record<string, unknown>) => Promise.resolve({ id: 'sync-1', ...entity }));
    mockSyncItemRepo.remove.mockResolvedValue(undefined);
    mockSyncItemRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      getMany: jest.fn().mockResolvedValue([]),
    });
    mockStoryRepo.findOne.mockResolvedValue(mockStory);
    mockStoryRepo.save.mockImplementation((entity: Record<string, unknown>) => Promise.resolve(entity));
    mockApiClient.createIssue.mockResolvedValue({ id: '10001', key: 'PROJ-1', self: 'url' });
    mockApiClient.updateIssue.mockResolvedValue(undefined);
    mockApiClient.transitionIssue.mockResolvedValue(undefined);
    mockApiClient.getIssueTransitions.mockResolvedValue([
      { id: '11', name: 'Start Progress', to: { id: '3', name: 'In Progress' } },
      { id: '21', name: 'To Done', to: { id: '4', name: 'Done' } },
    ]);
    mockApiClient.getIssue.mockResolvedValue({
      id: '10001',
      key: 'PROJ-1',
      self: 'url',
      fields: {
        summary: 'Jira Title',
        description: { version: 1, type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Jira desc' }] }] },
        status: { id: '1', name: 'To Do', statusCategory: { key: 'new', name: 'To Do' } },
        issuetype: { id: '1', name: 'Story', subtask: false },
      },
    });
    mockRedisService.setnx.mockResolvedValue('OK');
    mockRedisService.del.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JiraSyncService,
        { provide: getRepositoryToken(JiraIntegration), useValue: mockIntegrationRepo },
        { provide: getRepositoryToken(JiraSyncItem), useValue: mockSyncItemRepo },
        { provide: getRepositoryToken(Story), useValue: mockStoryRepo },
        { provide: JiraApiClientService, useValue: mockApiClient },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<JiraSyncService>(JiraSyncService);
  });

  describe('syncStoryToJira', () => {
    it('creates Jira issue for new story (no existing sync item)', async () => {
      mockSyncItemRepo.findOne.mockResolvedValue(null);

      const result = await service.syncStoryToJira('ws-1', 'story-1');

      expect(mockApiClient.createIssue).toHaveBeenCalled();
      expect(result.jiraIssueKey).toBe('PROJ-1');
      expect(result.syncStatus).toBe(JiraSyncStatus.SYNCED);
    });

    it('updates Jira issue for existing sync item', async () => {
      mockSyncItemRepo.findOne.mockResolvedValue({
        id: 'sync-1',
        jiraIntegrationId: 'int-1',
        devosStoryId: 'story-1',
        jiraIssueKey: 'PROJ-1',
        jiraIssueId: '10001',
      });

      await service.syncStoryToJira('ws-1', 'story-1');
      expect(mockApiClient.updateIssue).toHaveBeenCalledWith(
        mockIntegration,
        'PROJ-1',
        expect.any(Object),
      );
    });

    it('maps DevOS status to Jira status using statusMapping', async () => {
      mockSyncItemRepo.findOne.mockResolvedValue(null);
      mockStoryRepo.findOne.mockResolvedValue({ ...mockStory, status: 'in_progress' });

      await service.syncStoryToJira('ws-1', 'story-1');
      expect(mockApiClient.getIssueTransitions).toHaveBeenCalled();
    });

    it('finds and executes correct workflow transition for status change', async () => {
      mockSyncItemRepo.findOne.mockResolvedValue({
        id: 'sync-1',
        jiraIntegrationId: 'int-1',
        devosStoryId: 'story-1',
        jiraIssueKey: 'PROJ-1',
        jiraIssueId: '10001',
      });
      mockStoryRepo.findOne.mockResolvedValue({ ...mockStory, status: 'done' });

      await service.syncStoryToJira('ws-1', 'story-1');
      expect(mockApiClient.transitionIssue).toHaveBeenCalledWith(
        mockIntegration,
        'PROJ-1',
        '21',
      );
    });

    it('handles missing transition (marks as conflict)', async () => {
      mockSyncItemRepo.findOne.mockResolvedValue({
        id: 'sync-1',
        jiraIntegrationId: 'int-1',
        devosStoryId: 'story-1',
        jiraIssueKey: 'PROJ-1',
        jiraIssueId: '10001',
      });
      mockStoryRepo.findOne.mockResolvedValue({ ...mockStory, status: 'review' });
      mockApiClient.getIssueTransitions.mockResolvedValue([]);

      const result = await service.syncStoryToJira('ws-1', 'story-1');
      expect(result.syncStatus).toBe(JiraSyncStatus.CONFLICT);
    });

    it('acquires and releases distributed lock', async () => {
      mockSyncItemRepo.findOne.mockResolvedValue(null);

      await service.syncStoryToJira('ws-1', 'story-1');

      expect(mockRedisService.setnx).toHaveBeenCalledWith(
        'jira-sync-lock:story-1',
        'locked',
        30,
      );
      expect(mockRedisService.del).toHaveBeenCalledWith('jira-sync-lock:story-1');
    });

    it('queues retry when lock acquisition fails', async () => {
      mockRedisService.setnx.mockResolvedValue(null);

      await expect(service.syncStoryToJira('ws-1', 'story-1')).rejects.toThrow('Sync lock unavailable');
    });

    it('respects sync_direction (skips if jira_to_devos only)', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({ ...mockIntegration, syncDirection: 'jira_to_devos' });
      mockSyncItemRepo.findOne.mockResolvedValue({ id: 'sync-1' });

      const result = await service.syncStoryToJira('ws-1', 'story-1');
      expect(result.id).toBe('sync-1');
      expect(mockApiClient.createIssue).not.toHaveBeenCalled();
    });

    it('handles API error (marks sync item as error)', async () => {
      mockSyncItemRepo.findOne.mockResolvedValue({
        id: 'sync-1',
        jiraIntegrationId: 'int-1',
        devosStoryId: 'story-1',
        jiraIssueKey: 'PROJ-1',
        jiraIssueId: '10001',
      });
      mockApiClient.updateIssue.mockRejectedValue(new Error('API Error'));

      await expect(service.syncStoryToJira('ws-1', 'story-1')).rejects.toThrow('API Error');
      expect(mockSyncItemRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ syncStatus: JiraSyncStatus.ERROR }),
      );
    });
  });

  describe('syncJiraToDevos', () => {
    const webhookEvent = {
      webhookEvent: 'jira:issue_updated',
      issue: {
        id: '10001',
        key: 'PROJ-1',
        self: 'url',
        fields: {
          summary: 'Updated Title',
          description: { version: 1, type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated desc' }] }] },
          status: { id: '3', name: 'In Progress', statusCategory: { key: 'indeterminate', name: 'In Progress' } },
          issuetype: { id: '1', name: 'Story', subtask: false },
        },
      },
    };

    it('updates DevOS story from Jira issue', async () => {
      mockSyncItemRepo.findOne.mockResolvedValue({
        id: 'sync-1',
        jiraIntegrationId: 'int-1',
        devosStoryId: 'story-1',
        lastSyncedAt: new Date(Date.now() + 1000),
      });

      await service.syncJiraToDevos('int-1', '10001', webhookEvent);
      expect(mockStoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Updated Title' }),
      );
    });

    it('reverse-maps Jira status to DevOS status', async () => {
      mockSyncItemRepo.findOne.mockResolvedValue({
        id: 'sync-1',
        jiraIntegrationId: 'int-1',
        devosStoryId: 'story-1',
        lastSyncedAt: new Date(Date.now() + 1000),
      });

      await service.syncJiraToDevos('int-1', '10001', webhookEvent);
      expect(mockStoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'in_progress' }),
      );
    });

    it('respects sync_direction (skips if devos_to_jira only)', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue({ ...mockIntegration, syncDirection: 'devos_to_jira' });
      mockSyncItemRepo.findOne.mockResolvedValue({ id: 'sync-1' });

      const result = await service.syncJiraToDevos('int-1', '10001', webhookEvent);
      expect(result.id).toBe('sync-1');
      expect(mockStoryRepo.save).not.toHaveBeenCalled();
    });

    it('detects conflict when both sides changed', async () => {
      mockSyncItemRepo.findOne.mockResolvedValue({
        id: 'sync-1',
        jiraIntegrationId: 'int-1',
        devosStoryId: 'story-1',
        lastSyncedAt: new Date('2024-01-01'),
        lastDevosUpdateAt: new Date('2024-01-02'),
      });

      const result = await service.syncJiraToDevos('int-1', '10001', webhookEvent);
      expect(result.syncStatus).toBe(JiraSyncStatus.CONFLICT);
    });

    it('stores conflict details with both values', async () => {
      mockSyncItemRepo.findOne.mockResolvedValue({
        id: 'sync-1',
        jiraIntegrationId: 'int-1',
        devosStoryId: 'story-1',
        lastSyncedAt: new Date('2024-01-01'),
        lastDevosUpdateAt: new Date('2024-01-02'),
      });

      const result = await service.syncJiraToDevos('int-1', '10001', webhookEvent);
      expect(result.conflictDetails).toBeDefined();
      expect(result.conflictDetails?.detectedAt).toBeDefined();
    });
  });

  describe('resolveConflict', () => {
    it('applies DevOS values when keep_devos chosen', async () => {
      mockSyncItemRepo.findOne.mockResolvedValue({
        id: 'sync-1',
        jiraIntegrationId: 'int-1',
        devosStoryId: 'story-1',
        jiraIssueKey: 'PROJ-1',
        syncStatus: JiraSyncStatus.CONFLICT,
      });

      await service.resolveConflict('ws-1', 'sync-1', 'keep_devos');
      expect(mockApiClient.updateIssue).toHaveBeenCalled();
    });

    it('applies Jira values when keep_jira chosen', async () => {
      mockSyncItemRepo.findOne.mockResolvedValue({
        id: 'sync-1',
        jiraIntegrationId: 'int-1',
        devosStoryId: 'story-1',
        jiraIssueKey: 'PROJ-1',
        syncStatus: JiraSyncStatus.CONFLICT,
      });

      await service.resolveConflict('ws-1', 'sync-1', 'keep_jira');
      expect(mockApiClient.getIssue).toHaveBeenCalled();
      expect(mockStoryRepo.save).toHaveBeenCalled();
    });

    it('clears conflict_details and sets status to synced', async () => {
      mockSyncItemRepo.findOne.mockResolvedValue({
        id: 'sync-1',
        jiraIntegrationId: 'int-1',
        devosStoryId: 'story-1',
        jiraIssueKey: 'PROJ-1',
        syncStatus: JiraSyncStatus.CONFLICT,
      });

      const result = await service.resolveConflict('ws-1', 'sync-1', 'keep_devos');
      expect(result.syncStatus).toBe(JiraSyncStatus.SYNCED);
      expect(result.conflictDetails).toBeNull();
    });

    it('validates workspace ownership', async () => {
      mockIntegrationRepo.findOne.mockResolvedValue(null);
      await expect(service.resolveConflict('ws-1', 'sync-1', 'keep_devos')).rejects.toThrow(NotFoundException);
    });
  });

  describe('retrySyncItem', () => {
    it('re-runs sync for error items', async () => {
      // First call is retrySyncItem finding the sync item
      // Second call is syncStoryToJira finding the sync item (existing)
      mockSyncItemRepo.findOne
        .mockResolvedValueOnce({ id: 'sync-1', jiraIntegrationId: 'int-1', devosStoryId: 'story-1' })
        .mockResolvedValueOnce({ id: 'sync-1', jiraIntegrationId: 'int-1', devosStoryId: 'story-1', jiraIssueKey: 'PROJ-1', jiraIssueId: '10001' });

      await service.retrySyncItem('ws-1', 'sync-1');
      expect(mockApiClient.updateIssue).toHaveBeenCalled();
    });

    it('throws NotFoundException for non-existent item', async () => {
      mockSyncItemRepo.findOne.mockResolvedValue(null);
      await expect(service.retrySyncItem('ws-1', 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('linkStoryToIssue', () => {
    it('creates sync item for existing story and Jira issue (by key)', async () => {
      mockSyncItemRepo.findOne.mockResolvedValue(null);
      const result = await service.linkStoryToIssue('ws-1', 'story-1', 'PROJ-1');
      expect(result.jiraIssueKey).toBe('PROJ-1');
    });

    it('validates story belongs to workspace', async () => {
      mockStoryRepo.findOne.mockResolvedValue({ ...mockStory, project: { workspaceId: 'other-ws' } });
      await expect(service.linkStoryToIssue('ws-1', 'story-1', 'PROJ-1')).rejects.toThrow(NotFoundException);
    });

    it('rejects duplicate link (409 Conflict)', async () => {
      mockSyncItemRepo.findOne.mockResolvedValue({ id: 'existing' });
      await expect(service.linkStoryToIssue('ws-1', 'story-1', 'PROJ-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('unlinkStoryFromIssue', () => {
    it('removes sync item without deleting story or issue', async () => {
      mockSyncItemRepo.findOne.mockResolvedValue({ id: 'sync-1', jiraIntegrationId: 'int-1' });
      await service.unlinkStoryFromIssue('ws-1', 'sync-1');
      expect(mockSyncItemRepo.remove).toHaveBeenCalled();
    });
  });

  describe('getSyncItems', () => {
    it('returns paginated results', async () => {
      const result = await service.getSyncItems('ws-1', { page: 1, limit: 10 });
      expect(result).toEqual({ items: [], total: 0 });
    });
  });

  describe('convertToAdf', () => {
    it('produces valid ADF for plain text', () => {
      const result = service.convertToAdf('Hello World');
      expect(result.version).toBe(1);
      expect(result.type).toBe('doc');
      expect(result.content).toBeDefined();
    });

    it('handles markdown headings, lists, code blocks', () => {
      const result = service.convertToAdf('# Heading\n- Item\n```js\nconst x = 1;\n```');
      const content = result.content as Array<Record<string, unknown>>;
      expect(content[0].type).toBe('heading');
      expect(content[1].type).toBe('bulletList');
      expect(content[2].type).toBe('codeBlock');
      // Verify code block has language attr and content
      const codeBlock = content[2] as Record<string, unknown>;
      expect((codeBlock.attrs as Record<string, unknown>)?.language).toBe('js');
      expect((codeBlock.content as Array<Record<string, unknown>>)[0]).toEqual({
        type: 'text',
        text: 'const x = 1;',
      });
    });
  });

  describe('convertFromAdf', () => {
    it('extracts text from ADF paragraphs', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
        ],
      };
      expect(service.convertFromAdf(adf)).toBe('Hello');
    });

    it('handles nested ADF nodes', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
        ],
      };
      const text = service.convertFromAdf(adf);
      expect(text).toContain('# Title');
      expect(text).toContain('Body');
    });

    it('gracefully handles unknown node types', () => {
      const adf = {
        version: 1,
        type: 'doc',
        content: [
          { type: 'unknown_node', content: [{ type: 'text', text: 'Test' }] },
        ],
      };
      const text = service.convertFromAdf(adf);
      expect(text).toContain('Test');
    });
  });

  describe('findTransitionForStatus', () => {
    it('returns correct transition ID', async () => {
      const result = await service.findTransitionForStatus(
        mockIntegration as unknown as JiraIntegration,
        'PROJ-1',
        'In Progress',
      );
      expect(result).toEqual({ transitionId: '11', targetStatus: 'In Progress' });
    });

    it('returns null when no valid transition exists', async () => {
      mockApiClient.getIssueTransitions.mockResolvedValue([]);
      const result = await service.findTransitionForStatus(
        mockIntegration as unknown as JiraIntegration,
        'PROJ-1',
        'Unknown Status',
      );
      expect(result).toBeNull();
    });
  });
});
