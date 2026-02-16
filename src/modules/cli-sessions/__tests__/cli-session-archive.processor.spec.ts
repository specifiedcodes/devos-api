import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bull';
import { CliSessionArchiveProcessor } from '../cli-session-archive.processor';
import { CliSessionArchiveService } from '../cli-session-archive.service';
import {
  CliSession,
  CliSessionStatus,
  CliSessionAgentType,
} from '../../../database/entities/cli-session.entity';

describe('CliSessionArchiveProcessor', () => {
  let processor: CliSessionArchiveProcessor;
  let archiveService: jest.Mocked<CliSessionArchiveService>;

  const mockSession: CliSession = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    agentId: '550e8400-e29b-41d4-a716-446655440002',
    workspaceId: '550e8400-e29b-41d4-a716-446655440003',
    projectId: '550e8400-e29b-41d4-a716-446655440004',
    storyKey: '8-5',
    agentType: CliSessionAgentType.DEV,
    outputText: 'H4sIAAAAAAAAA8tIzcnJBwCGphA2BQAAAA==',
    lineCount: 1,
    outputSizeBytes: 32,
    status: CliSessionStatus.COMPLETED,
    startedAt: new Date('2026-02-01T10:00:00Z'),
    endedAt: new Date('2026-02-01T10:30:00Z'),
    durationSeconds: 1800,
    storageKey: null,
    archivedAt: null,
    createdAt: new Date('2026-02-01T10:30:00Z'),
    updatedAt: new Date('2026-02-01T10:30:00Z'),
    workspace: {} as any,
  };

  beforeEach(async () => {
    const mockArchiveService = {
      archivePendingSessions: jest.fn(),
      archiveSession: jest.fn(),
      cleanupExpiredArchives: jest.fn(),
      getSessionById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CliSessionArchiveProcessor,
        {
          provide: CliSessionArchiveService,
          useValue: mockArchiveService,
        },
      ],
    }).compile();

    processor = module.get<CliSessionArchiveProcessor>(CliSessionArchiveProcessor);
    archiveService = module.get(CliSessionArchiveService);
  });

  describe('handleArchivePending', () => {
    it('should call archivePendingSessions and return result', async () => {
      const expectedResult = { archived: 5, failed: 1, skipped: 2 };
      archiveService.archivePendingSessions.mockResolvedValue(expectedResult);

      const job = { name: 'archive-pending', data: {} } as Job;
      const result = await processor.handleArchivePending(job);

      expect(archiveService.archivePendingSessions).toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });
  });

  describe('handleArchiveSingle', () => {
    it('should retrieve session by ID and call archiveSession', async () => {
      archiveService.getSessionById.mockResolvedValue(mockSession);
      archiveService.archiveSession.mockResolvedValue(undefined);

      const job = {
        name: 'archive-single',
        data: { sessionId: mockSession.id },
      } as Job<{ sessionId: string }>;

      const result = await processor.handleArchiveSingle(job);

      expect(archiveService.getSessionById).toHaveBeenCalledWith(mockSession.id);
      expect(archiveService.archiveSession).toHaveBeenCalledWith(mockSession);
      expect(result).toEqual({ archived: true, sessionId: mockSession.id });
    });

    it('should skip when session not found', async () => {
      archiveService.getSessionById.mockResolvedValue(null);

      const job = {
        name: 'archive-single',
        data: { sessionId: 'nonexistent' },
      } as Job<{ sessionId: string }>;

      const result = await processor.handleArchiveSingle(job);

      expect(archiveService.archiveSession).not.toHaveBeenCalled();
      expect(result).toEqual({ skipped: true, reason: 'Session not found' });
    });
  });

  describe('handleCleanupExpired', () => {
    it('should call cleanupExpiredArchives and return result', async () => {
      const expectedResult = { deleted: 3, failed: 0 };
      archiveService.cleanupExpiredArchives.mockResolvedValue(expectedResult);

      const job = { name: 'cleanup-expired', data: {} } as Job;
      const result = await processor.handleCleanupExpired(job);

      expect(archiveService.cleanupExpiredArchives).toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });
  });

  describe('onFailed', () => {
    it('should log error without throwing', () => {
      const job = { name: 'archive-pending', id: '1' } as Job;
      const error = new Error('Test error');

      // Should not throw
      expect(() => processor.onFailed(job, error)).not.toThrow();
    });
  });

  describe('processor metadata', () => {
    it('should be defined and injectable', () => {
      expect(processor).toBeDefined();
    });
  });
});
