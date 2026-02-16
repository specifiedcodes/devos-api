import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CliSessionArchiveService } from '../cli-session-archive.service';
import {
  CliSession,
  CliSessionStatus,
  CliSessionAgentType,
} from '../../../database/entities/cli-session.entity';
import { FileStorageService } from '../../file-storage/file-storage.service';
import { STORAGE_BUCKETS } from '../../file-storage/constants/buckets';
import { RedisService } from '../../redis/redis.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';

describe('CliSessionArchiveService', () => {
  let service: CliSessionArchiveService;
  let repository: jest.Mocked<Repository<CliSession>>;
  let fileStorageService: jest.Mocked<FileStorageService>;
  let redisService: jest.Mocked<RedisService>;
  let auditService: jest.Mocked<AuditService>;
  let configService: jest.Mocked<ConfigService>;

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
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockFileStorageService = {
      buildKey: jest.fn(),
      upload: jest.fn(),
      download: jest.fn(),
      delete: jest.fn(),
    };

    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const mockAuditService = {
      log: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue: string) => defaultValue),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CliSessionArchiveService,
        {
          provide: getRepositoryToken(CliSession),
          useValue: mockRepository,
        },
        {
          provide: FileStorageService,
          useValue: mockFileStorageService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<CliSessionArchiveService>(CliSessionArchiveService);
    repository = module.get(getRepositoryToken(CliSession));
    fileStorageService = module.get(FileStorageService);
    redisService = module.get(RedisService);
    auditService = module.get(AuditService);
    configService = module.get(ConfigService);
  });

  describe('configuration', () => {
    it('should load default configuration values', () => {
      const config = service.getConfig();
      expect(config.archiveAfterHours).toBe(1);
      expect(config.batchSize).toBe(50);
      expect(config.retentionDays).toBe(30);
      expect(config.cacheTtlSeconds).toBe(3600);
      expect(config.maxSizeMB).toBe(50);
      expect(config.intervalMinutes).toBe(5);
    });
  });

  describe('archiveSession', () => {
    it('should archive session to MinIO with correct bucket, key, and metadata', async () => {
      const storageKey = `${mockSession.workspaceId}/${mockSession.projectId}/${mockSession.id}.gz`;
      fileStorageService.buildKey.mockReturnValue(storageKey);
      fileStorageService.upload.mockResolvedValue(storageKey);
      repository.update.mockResolvedValue({ affected: 1 } as any);
      auditService.log.mockResolvedValue(undefined);

      await service.archiveSession(mockSession);

      expect(fileStorageService.buildKey).toHaveBeenCalledWith(
        mockSession.workspaceId,
        mockSession.projectId,
        `${mockSession.id}.gz`,
      );
      expect(fileStorageService.upload).toHaveBeenCalledWith(
        STORAGE_BUCKETS.CLI_SESSIONS,
        storageKey,
        expect.any(Buffer),
        {
          contentType: 'application/gzip',
          metadata: {
            sessionId: mockSession.id,
            agentType: mockSession.agentType,
            lineCount: String(mockSession.lineCount),
          },
        },
      );
    });

    it('should use "no-project" when projectId is null', async () => {
      const sessionNoProject = { ...mockSession, projectId: null };
      const storageKey = `${mockSession.workspaceId}/no-project/${mockSession.id}.gz`;
      fileStorageService.buildKey.mockReturnValue(storageKey);
      fileStorageService.upload.mockResolvedValue(storageKey);
      repository.update.mockResolvedValue({ affected: 1 } as any);
      auditService.log.mockResolvedValue(undefined);

      await service.archiveSession(sessionNoProject);

      expect(fileStorageService.buildKey).toHaveBeenCalledWith(
        mockSession.workspaceId,
        'no-project',
        `${mockSession.id}.gz`,
      );
    });

    it('should update session entity with storageKey, archivedAt, and clear outputText', async () => {
      const storageKey = `${mockSession.workspaceId}/${mockSession.projectId}/${mockSession.id}.gz`;
      fileStorageService.buildKey.mockReturnValue(storageKey);
      fileStorageService.upload.mockResolvedValue(storageKey);
      repository.update.mockResolvedValue({ affected: 1 } as any);
      auditService.log.mockResolvedValue(undefined);

      await service.archiveSession(mockSession);

      expect(repository.update).toHaveBeenCalledWith(mockSession.id, {
        storageKey,
        archivedAt: expect.any(Date),
        outputText: '',
      });
    });

    it('should skip session that is already archived (has storageKey)', async () => {
      await service.archiveSession(archivedSession);

      expect(fileStorageService.upload).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('should skip session with no outputText', async () => {
      const sessionNoOutput = { ...mockSession, outputText: '' };

      await service.archiveSession(sessionNoOutput);

      expect(fileStorageService.upload).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when compressed data exceeds max size', async () => {
      // Create a base64 string that decodes to > 50MB
      // Buffer.alloc(51MB).toString('base64') is a valid base64 string that decodes to 51MB
      const bigBuffer = Buffer.alloc(51 * 1024 * 1024, 0);
      const hugeOutput = bigBuffer.toString('base64');
      const hugeSession = { ...mockSession, outputText: hugeOutput };

      await expect(service.archiveSession(hugeSession)).rejects.toThrow(
        BadRequestException,
      );
      expect(fileStorageService.upload).not.toHaveBeenCalled();
    });

    it('should log audit event on successful archive', async () => {
      const storageKey = `${mockSession.workspaceId}/${mockSession.projectId}/${mockSession.id}.gz`;
      fileStorageService.buildKey.mockReturnValue(storageKey);
      fileStorageService.upload.mockResolvedValue(storageKey);
      repository.update.mockResolvedValue({ affected: 1 } as any);
      auditService.log.mockResolvedValue(undefined);

      await service.archiveSession(mockSession);

      expect(auditService.log).toHaveBeenCalledWith(
        mockSession.workspaceId,
        'system',
        AuditAction.SESSION_ARCHIVED,
        'cli_session',
        mockSession.id,
        expect.objectContaining({
          sessionId: mockSession.id,
          storageKey,
          sizeBytes: mockSession.outputSizeBytes,
          agentType: mockSession.agentType,
        }),
      );
    });
  });

  describe('archivePendingSessions', () => {
    it('should archive pending sessions and return counts', async () => {
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockSession]),
      };
      repository.createQueryBuilder.mockReturnValue(mockQb as any);

      const storageKey = `${mockSession.workspaceId}/${mockSession.projectId}/${mockSession.id}.gz`;
      fileStorageService.buildKey.mockReturnValue(storageKey);
      fileStorageService.upload.mockResolvedValue(storageKey);
      repository.update.mockResolvedValue({ affected: 1 } as any);
      auditService.log.mockResolvedValue(undefined);

      const result = await service.archivePendingSessions();

      expect(result.archived).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('should respect batch size limit', async () => {
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      repository.createQueryBuilder.mockReturnValue(mockQb as any);

      await service.archivePendingSessions();

      expect(mockQb.take).toHaveBeenCalledWith(50); // default batch size
    });

    it('should order by ended_at ASC (oldest first)', async () => {
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      repository.createQueryBuilder.mockReturnValue(mockQb as any);

      await service.archivePendingSessions();

      expect(mockQb.orderBy).toHaveBeenCalledWith('session.ended_at', 'ASC');
    });

    it('should skip sessions with no output', async () => {
      const emptySession = { ...mockSession, outputText: '' };
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([emptySession]),
      };
      repository.createQueryBuilder.mockReturnValue(mockQb as any);

      const result = await service.archivePendingSessions();

      expect(result.skipped).toBe(1);
      expect(result.archived).toBe(0);
    });

    it('should continue processing when individual archive fails', async () => {
      const session2 = { ...mockSession, id: '550e8400-e29b-41d4-a716-446655440099' };
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockSession, session2]),
      };
      repository.createQueryBuilder.mockReturnValue(mockQb as any);

      const storageKey = 'some/key.gz';
      fileStorageService.buildKey.mockReturnValue(storageKey);
      // First upload fails, second succeeds
      fileStorageService.upload
        .mockRejectedValueOnce(new Error('Upload failed'))
        .mockResolvedValueOnce(storageKey);
      repository.update.mockResolvedValue({ affected: 1 } as any);
      auditService.log.mockResolvedValue(undefined);

      const result = await service.archivePendingSessions();

      expect(result.failed).toBe(1);
      expect(result.archived).toBe(1);
    });

    it('should return empty result when no sessions are pending', async () => {
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      repository.createQueryBuilder.mockReturnValue(mockQb as any);

      const result = await service.archivePendingSessions();

      expect(result).toEqual({ archived: 0, failed: 0, skipped: 0 });
    });
  });

  describe('getArchivedSessionOutput', () => {
    it('should return cached data on Redis cache hit without calling MinIO', async () => {
      const cachedData = 'H4sIAAAAAAAAA8tIzcnJBwCGphA2BQAAAA==';
      redisService.get.mockResolvedValue(cachedData);

      const result = await service.getArchivedSessionOutput(archivedSession);

      expect(result).toBe(cachedData);
      expect(fileStorageService.download).not.toHaveBeenCalled();
      expect(redisService.get).toHaveBeenCalledWith(
        `cli-session-cache:${archivedSession.id}`,
      );
    });

    it('should download from MinIO and cache on Redis cache miss', async () => {
      redisService.get.mockResolvedValue(null);
      const buffer = Buffer.from('H4sIAAAAAAAAA8tIzcnJBwCGphA2BQAAAA==', 'base64');
      fileStorageService.download.mockResolvedValue(buffer);
      redisService.set.mockResolvedValue(undefined);

      const result = await service.getArchivedSessionOutput(archivedSession);

      expect(fileStorageService.download).toHaveBeenCalledWith(
        STORAGE_BUCKETS.CLI_SESSIONS,
        archivedSession.storageKey,
      );
      expect(result).toBe(buffer.toString('base64'));
      expect(redisService.set).toHaveBeenCalledWith(
        `cli-session-cache:${archivedSession.id}`,
        buffer.toString('base64'),
        3600, // default TTL
      );
    });

    it('should throw NotFoundException when session has no storage key', async () => {
      await expect(
        service.getArchivedSessionOutput(mockSession),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('cleanupExpiredArchives', () => {
    const createCleanupQueryBuilder = (sessions: any[]) => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(sessions),
    });

    it('should delete expired archived sessions from MinIO and database', async () => {
      const expiredSession = {
        ...archivedSession,
        archivedAt: new Date('2025-12-01T12:00:00Z'), // well past 30 days
      };

      repository.createQueryBuilder.mockReturnValue(createCleanupQueryBuilder([expiredSession]) as any);
      fileStorageService.delete.mockResolvedValue(undefined);
      repository.remove.mockResolvedValue(expiredSession);
      redisService.del.mockResolvedValue(undefined);
      auditService.log.mockResolvedValue(undefined);

      const result = await service.cleanupExpiredArchives();

      expect(result.deleted).toBe(1);
      expect(result.failed).toBe(0);
      expect(fileStorageService.delete).toHaveBeenCalledWith(
        STORAGE_BUCKETS.CLI_SESSIONS,
        expiredSession.storageKey,
      );
      expect(repository.remove).toHaveBeenCalledWith(expiredSession);
    });

    it('should return empty result when no expired sessions found', async () => {
      repository.createQueryBuilder.mockReturnValue(createCleanupQueryBuilder([]) as any);

      const result = await service.cleanupExpiredArchives();

      expect(result.deleted).toBe(0);
      expect(result.failed).toBe(0);
      expect(fileStorageService.delete).not.toHaveBeenCalled();
    });

    it('should continue processing when individual deletion fails', async () => {
      const expired1 = {
        ...archivedSession,
        id: '001',
        archivedAt: new Date('2025-12-01T12:00:00Z'),
      };
      const expired2 = {
        ...archivedSession,
        id: '002',
        archivedAt: new Date('2025-12-02T12:00:00Z'),
      };

      repository.createQueryBuilder.mockReturnValue(createCleanupQueryBuilder([expired1, expired2]) as any);
      fileStorageService.delete
        .mockRejectedValueOnce(new Error('Delete failed'))
        .mockResolvedValueOnce(undefined);
      repository.remove.mockResolvedValue({} as any);
      redisService.del.mockResolvedValue(undefined);
      auditService.log.mockResolvedValue(undefined);

      const result = await service.cleanupExpiredArchives();

      expect(result.failed).toBe(1);
      expect(result.deleted).toBe(1);
    });

    it('should log audit event for cleanup per workspace', async () => {
      const expiredSession = {
        ...archivedSession,
        archivedAt: new Date('2025-12-01T12:00:00Z'),
      };

      repository.createQueryBuilder.mockReturnValue(createCleanupQueryBuilder([expiredSession]) as any);
      fileStorageService.delete.mockResolvedValue(undefined);
      repository.remove.mockResolvedValue(expiredSession);
      redisService.del.mockResolvedValue(undefined);
      auditService.log.mockResolvedValue(undefined);

      await service.cleanupExpiredArchives();

      expect(auditService.log).toHaveBeenCalledWith(
        expect.any(String),
        'system',
        AuditAction.SESSION_ARCHIVE_CLEANUP,
        'cli_session',
        'batch',
        expect.objectContaining({
          deletedCount: 1,
          failedCount: 0,
        }),
      );
    });
  });

  describe('getArchiveStats', () => {
    it('should return correct aggregate stats for workspace', async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalArchived: '5',
          totalSizeBytes: '1024000',
          oldestArchive: '2026-01-15T10:00:00Z',
          newestArchive: '2026-02-01T10:00:00Z',
        }),
      };
      repository.createQueryBuilder.mockReturnValue(mockQb as any);

      const result = await service.getArchiveStats(mockSession.workspaceId);

      expect(result.totalArchived).toBe(5);
      expect(result.totalSizeBytes).toBe(1024000);
      expect(result.oldestArchive).toBeInstanceOf(Date);
      expect(result.newestArchive).toBeInstanceOf(Date);
    });

    it('should return zeros/nulls for workspace with no archived sessions', async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalArchived: '0',
          totalSizeBytes: '0',
          oldestArchive: null,
          newestArchive: null,
        }),
      };
      repository.createQueryBuilder.mockReturnValue(mockQb as any);

      const result = await service.getArchiveStats(mockSession.workspaceId);

      expect(result.totalArchived).toBe(0);
      expect(result.totalSizeBytes).toBe(0);
      expect(result.oldestArchive).toBeNull();
      expect(result.newestArchive).toBeNull();
    });
  });

  describe('invalidateCache', () => {
    it('should call Redis DEL with correct key', async () => {
      redisService.del.mockResolvedValue(undefined);

      await service.invalidateCache('session-123');

      expect(redisService.del).toHaveBeenCalledWith('cli-session-cache:session-123');
    });

    it('should not throw when key does not exist', async () => {
      redisService.del.mockResolvedValue(undefined);

      await expect(
        service.invalidateCache('non-existent'),
      ).resolves.not.toThrow();
    });
  });

  describe('deleteArchivedSession', () => {
    it('should delete from MinIO and invalidate cache', async () => {
      fileStorageService.delete.mockResolvedValue(undefined);
      redisService.del.mockResolvedValue(undefined);
      auditService.log.mockResolvedValue(undefined);

      await service.deleteArchivedSession(archivedSession);

      expect(fileStorageService.delete).toHaveBeenCalledWith(
        STORAGE_BUCKETS.CLI_SESSIONS,
        archivedSession.storageKey,
      );
      expect(redisService.del).toHaveBeenCalledWith(
        `cli-session-cache:${archivedSession.id}`,
      );
    });

    it('should log audit event for archive deletion', async () => {
      fileStorageService.delete.mockResolvedValue(undefined);
      redisService.del.mockResolvedValue(undefined);
      auditService.log.mockResolvedValue(undefined);

      await service.deleteArchivedSession(archivedSession);

      expect(auditService.log).toHaveBeenCalledWith(
        archivedSession.workspaceId,
        'system',
        AuditAction.SESSION_ARCHIVE_DELETED,
        'cli_session',
        archivedSession.id,
        expect.objectContaining({
          sessionId: archivedSession.id,
          storageKey: archivedSession.storageKey,
        }),
      );
    });
  });

  describe('getSessionById', () => {
    it('should return session when found', async () => {
      repository.findOne.mockResolvedValue(mockSession);

      const result = await service.getSessionById(mockSession.id);

      expect(result).toEqual(mockSession);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: mockSession.id },
      });
    });

    it('should return null when session not found', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.getSessionById('nonexistent');

      expect(result).toBeNull();
    });
  });
});
