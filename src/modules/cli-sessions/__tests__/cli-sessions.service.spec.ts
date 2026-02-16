import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { CliSessionsService } from '../cli-sessions.service';
import { CliSessionArchiveService } from '../cli-session-archive.service';
import { CliSession, CliSessionStatus, CliSessionAgentType } from '../../../database/entities/cli-session.entity';

describe('CliSessionsService', () => {
  let service: CliSessionsService;
  let repository: jest.Mocked<Repository<CliSession>>;
  let archiveService: jest.Mocked<CliSessionArchiveService>;

  const mockSession: CliSession = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    agentId: '550e8400-e29b-41d4-a716-446655440002',
    workspaceId: '550e8400-e29b-41d4-a716-446655440003',
    projectId: '550e8400-e29b-41d4-a716-446655440004',
    storyKey: '8-5',
    agentType: CliSessionAgentType.DEV,
    outputText: 'H4sIAAAAAAAAA8tIzcnJBwCGphA2BQAAAA==', // compressed "test output"
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

  const archivedSession: CliSession = {
    ...mockSession,
    id: '550e8400-e29b-41d4-a716-446655440010',
    storageKey: '550e8400-e29b-41d4-a716-446655440003/550e8400-e29b-41d4-a716-446655440004/550e8400-e29b-41d4-a716-446655440010.gz',
    archivedAt: new Date('2026-02-01T12:00:00Z'),
    outputText: '',
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      remove: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockArchiveService = {
      getArchivedSessionOutput: jest.fn(),
      deleteArchivedSession: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CliSessionsService,
        {
          provide: getRepositoryToken(CliSession),
          useValue: mockRepository,
        },
        {
          provide: CliSessionArchiveService,
          useValue: mockArchiveService,
        },
      ],
    }).compile();

    service = module.get<CliSessionsService>(CliSessionsService);
    repository = module.get(getRepositoryToken(CliSession));
    archiveService = module.get(CliSessionArchiveService);
  });

  describe('compressOutput', () => {
    it('should compress text to base64 gzip', async () => {
      const text = 'Hello, World!';
      const compressed = await service.compressOutput(text);

      expect(compressed).toBeDefined();
      expect(typeof compressed).toBe('string');
      expect(compressed.length).toBeGreaterThan(0);
      // Base64 should not contain original text
      expect(compressed).not.toContain('Hello');
    });

    it('should handle empty text', async () => {
      const compressed = await service.compressOutput('');
      expect(compressed).toBeDefined();
    });

    it('should handle large text', async () => {
      const largeText = 'x'.repeat(100000);
      const compressed = await service.compressOutput(largeText);

      // Compressed should be significantly smaller
      expect(compressed.length).toBeLessThan(largeText.length);
    });
  });

  describe('decompressOutput', () => {
    it('should decompress base64 gzip to original text', async () => {
      const originalText = 'Hello, World!';
      const compressed = await service.compressOutput(originalText);
      const decompressed = await service.decompressOutput(compressed);

      expect(decompressed).toBe(originalText);
    });

    it('should handle multiline text', async () => {
      const multilineText = 'Line 1\nLine 2\nLine 3';
      const compressed = await service.compressOutput(multilineText);
      const decompressed = await service.decompressOutput(compressed);

      expect(decompressed).toBe(multilineText);
    });
  });

  describe('splitOutputToLines', () => {
    it('should split text by newlines', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const lines = service.splitOutputToLines(text);

      expect(lines).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('should handle empty text', () => {
      const lines = service.splitOutputToLines('');
      expect(lines).toEqual(['']);
    });

    it('should handle single line', () => {
      const lines = service.splitOutputToLines('Single line');
      expect(lines).toEqual(['Single line']);
    });
  });

  describe('createSession', () => {
    it('should create session with compressed output', async () => {
      const dto = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        agentId: '550e8400-e29b-41d4-a716-446655440002',
        workspaceId: '550e8400-e29b-41d4-a716-446655440003',
        agentType: CliSessionAgentType.DEV,
        outputText: 'test output\nline 2',
        status: CliSessionStatus.COMPLETED,
        startedAt: '2026-02-01T10:00:00Z',
        endedAt: '2026-02-01T10:30:00Z',
      };

      repository.create.mockReturnValue(mockSession);
      repository.save.mockResolvedValue(mockSession);

      const result = await service.createSession(dto);

      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual(mockSession);

      // Verify compression was applied
      const createCall = repository.create.mock.calls[0][0];
      expect(createCall.outputText).not.toBe(dto.outputText);
      expect(createCall.lineCount).toBe(2);
    });

    it('should calculate duration from timestamps', async () => {
      const dto = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        agentId: '550e8400-e29b-41d4-a716-446655440002',
        workspaceId: '550e8400-e29b-41d4-a716-446655440003',
        agentType: CliSessionAgentType.DEV,
        outputText: 'test',
        status: CliSessionStatus.COMPLETED,
        startedAt: '2026-02-01T10:00:00Z',
        endedAt: '2026-02-01T10:30:00Z',
      };

      repository.create.mockReturnValue(mockSession);
      repository.save.mockResolvedValue(mockSession);

      await service.createSession(dto);

      const createCall = repository.create.mock.calls[0][0];
      expect(createCall.durationSeconds).toBe(1800); // 30 minutes
    });
  });

  describe('getWorkspaceSessions', () => {
    it('should return paginated sessions with isArchived and archivedAt fields', async () => {
      repository.findAndCount.mockResolvedValue([[mockSession], 1]);

      const result = await service.getWorkspaceSessions({
        workspaceId: '550e8400-e29b-41d4-a716-446655440003',
        limit: 20,
        offset: 0,
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
      expect(result.data[0].id).toBe(mockSession.id);
      // Story 16.3: verify isArchived and archivedAt
      expect(result.data[0].isArchived).toBe(false);
      expect(result.data[0].archivedAt).toBeNull();
    });

    it('should return isArchived=true for archived sessions', async () => {
      repository.findAndCount.mockResolvedValue([[archivedSession], 1]);

      const result = await service.getWorkspaceSessions({
        workspaceId: '550e8400-e29b-41d4-a716-446655440003',
        limit: 20,
        offset: 0,
      });

      expect(result.data[0].isArchived).toBe(true);
      expect(result.data[0].archivedAt).toBe(archivedSession.archivedAt!.toISOString());
    });

    it('should include archivedAt and storageKey in select query', async () => {
      repository.findAndCount.mockResolvedValue([[], 0]);

      await service.getWorkspaceSessions({
        workspaceId: '550e8400-e29b-41d4-a716-446655440003',
        limit: 20,
        offset: 0,
      });

      expect(repository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.arrayContaining(['archivedAt', 'storageKey']),
        }),
      );
    });

    it('should apply filters correctly', async () => {
      repository.findAndCount.mockResolvedValue([[], 0]);

      await service.getWorkspaceSessions({
        workspaceId: '550e8400-e29b-41d4-a716-446655440003',
        agentType: CliSessionAgentType.QA,
        status: CliSessionStatus.FAILED,
        limit: 20,
        offset: 0,
      });

      expect(repository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: '550e8400-e29b-41d4-a716-446655440003',
            agentType: CliSessionAgentType.QA,
            status: CliSessionStatus.FAILED,
          }),
        }),
      );
    });

    it('should indicate hasMore when more results exist', async () => {
      repository.findAndCount.mockResolvedValue([[mockSession], 5]);

      const result = await service.getWorkspaceSessions({
        workspaceId: '550e8400-e29b-41d4-a716-446655440003',
        limit: 1,
        offset: 0,
      });

      expect(result.hasMore).toBe(true);
    });
  });

  describe('getSessionForReplay', () => {
    it('should return non-archived session with decompressed output from DB', async () => {
      // Create session with actual compressed output
      const compressedOutput = await service.compressOutput('test output\nline 2');
      const sessionWithCompressed = {
        ...mockSession,
        outputText: compressedOutput,
        lineCount: 2,
      };

      repository.findOne.mockResolvedValue(sessionWithCompressed);

      const result = await service.getSessionForReplay(
        mockSession.workspaceId,
        mockSession.id,
      );

      expect(result.outputLines).toEqual(['test output', 'line 2']);
      expect(result.id).toBe(mockSession.id);
      expect(result.isArchived).toBe(false);
      expect(result.archivedAt).toBeNull();
      // Should NOT call archiveService for non-archived session
      expect(archiveService.getArchivedSessionOutput).not.toHaveBeenCalled();
    });

    it('should fetch archived session output from MinIO via archiveService', async () => {
      repository.findOne.mockResolvedValue(archivedSession);

      const compressedOutput = await service.compressOutput('archived output\nline 2');
      archiveService.getArchivedSessionOutput.mockResolvedValue(compressedOutput);

      const result = await service.getSessionForReplay(
        archivedSession.workspaceId,
        archivedSession.id,
      );

      expect(archiveService.getArchivedSessionOutput).toHaveBeenCalledWith(archivedSession);
      expect(result.outputLines).toEqual(['archived output', 'line 2']);
      expect(result.isArchived).toBe(true);
      expect(result.archivedAt).toBe(archivedSession.archivedAt!.toISOString());
    });

    it('should throw NotFoundException if session not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.getSessionForReplay(
          '550e8400-e29b-41d4-a716-446655440003',
          '550e8400-e29b-41d4-a716-446655440099',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteSession', () => {
    it('should delete non-archived session without calling archiveService', async () => {
      repository.findOne.mockResolvedValue(mockSession);
      repository.remove.mockResolvedValue(mockSession);

      await service.deleteSession(mockSession.workspaceId, mockSession.id);

      expect(repository.remove).toHaveBeenCalledWith(mockSession);
      expect(archiveService.deleteArchivedSession).not.toHaveBeenCalled();
    });

    it('should delete archived session and clean up MinIO storage', async () => {
      repository.findOne.mockResolvedValue(archivedSession);
      repository.remove.mockResolvedValue(archivedSession);
      archiveService.deleteArchivedSession.mockResolvedValue(undefined);

      await service.deleteSession(archivedSession.workspaceId, archivedSession.id);

      expect(archiveService.deleteArchivedSession).toHaveBeenCalledWith(archivedSession);
      expect(repository.remove).toHaveBeenCalledWith(archivedSession);
    });

    it('should continue DB deletion even if MinIO cleanup fails', async () => {
      repository.findOne.mockResolvedValue(archivedSession);
      repository.remove.mockResolvedValue(archivedSession);
      archiveService.deleteArchivedSession.mockRejectedValue(new Error('MinIO error'));

      await service.deleteSession(archivedSession.workspaceId, archivedSession.id);

      // DB deletion should still happen
      expect(repository.remove).toHaveBeenCalledWith(archivedSession);
    });

    it('should throw NotFoundException if session not found', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(
        service.deleteSession(
          '550e8400-e29b-41d4-a716-446655440003',
          '550e8400-e29b-41d4-a716-446655440099',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cleanupOldSessions', () => {
    it('should delete non-archived sessions older than 30 days', async () => {
      const mockQb = {
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 5 }),
      };
      repository.createQueryBuilder.mockReturnValue(mockQb as any);

      const result = await service.cleanupOldSessions();

      expect(result).toBe(5);
      // Verify archived sessions are excluded
      expect(mockQb.andWhere).toHaveBeenCalledWith('archived_at IS NULL');
    });

    it('should return 0 when no old sessions', async () => {
      const mockQb = {
        delete: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      repository.createQueryBuilder.mockReturnValue(mockQb as any);

      const result = await service.cleanupOldSessions();

      expect(result).toBe(0);
    });
  });

  describe('getWorkspaceSessionCount', () => {
    it('should return session count', async () => {
      repository.count.mockResolvedValue(10);

      const result = await service.getWorkspaceSessionCount(
        '550e8400-e29b-41d4-a716-446655440003',
      );

      expect(result).toBe(10);
    });
  });

  describe('getWorkspaceStorageUsage', () => {
    it('should return total storage used', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalBytes: '1000000' }),
      };
      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.getWorkspaceStorageUsage(
        '550e8400-e29b-41d4-a716-446655440003',
      );

      expect(result).toBe(1000000);
    });

    it('should return 0 when no sessions', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(null),
      };
      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.getWorkspaceStorageUsage(
        '550e8400-e29b-41d4-a716-446655440003',
      );

      expect(result).toBe(0);
    });
  });
});
