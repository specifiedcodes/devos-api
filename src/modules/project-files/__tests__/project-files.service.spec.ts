/**
 * ProjectFilesService Unit Tests
 * Story 16.2: File Upload/Download API (AC4)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ProjectFilesService } from '../project-files.service';
import { ProjectFile } from '../../../database/entities/project-file.entity';
import { Project } from '../../../database/entities/project.entity';
import { FileStorageService } from '../../file-storage/file-storage.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';

describe('ProjectFilesService', () => {
  let service: ProjectFilesService;
  let projectFileRepository: any;
  let projectRepository: any;
  let fileStorageService: any;
  let auditService: any;

  const mockWorkspaceId = '11111111-1111-1111-1111-111111111111';
  const mockProjectId = '22222222-2222-2222-2222-222222222222';
  const mockUserId = '33333333-3333-3333-3333-333333333333';
  const mockFileId = '44444444-4444-4444-4444-444444444444';

  const mockProject = {
    id: mockProjectId,
    workspaceId: mockWorkspaceId,
    name: 'Test Project',
  };

  const mockProjectFile = {
    id: mockFileId,
    projectId: mockProjectId,
    workspaceId: mockWorkspaceId,
    filename: 'test.pdf',
    path: '/docs',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    storageKey: `${mockWorkspaceId}/${mockProjectId}/uuid/test.pdf`,
    description: 'Test file',
    uploadedBy: mockUserId,
    createdAt: new Date('2026-02-16T00:00:00Z'),
    updatedAt: new Date('2026-02-16T00:00:00Z'),
    deletedAt: null,
  };

  const mockMulterFile = {
    originalname: 'test.pdf',
    mimetype: 'application/pdf',
    buffer: Buffer.from('test file content'),
    size: 17,
    fieldname: 'file',
    encoding: '7bit',
    stream: null as any,
    destination: '',
    filename: '',
    path: '',
  } as Express.Multer.File;

  // Query builder mock helpers
  const createMockQueryBuilder = (results: any[] = [], total: number = 0) => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(results[0] || null),
      getManyAndCount: jest.fn().mockResolvedValue([results, total]),
      getRawOne: jest.fn().mockResolvedValue({ totalFiles: String(total), totalSizeBytes: '0' }),
    };
    return qb;
  };

  beforeEach(async () => {
    const mockQb = createMockQueryBuilder();

    projectFileRepository = {
      create: jest.fn().mockImplementation((data) => ({ ...data, id: mockFileId })),
      save: jest.fn().mockImplementation((entity) => ({
        ...mockProjectFile,
        ...entity,
        id: entity.id || mockFileId,
      })),
      findOne: jest.fn(),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    };

    projectRepository = {
      findOne: jest.fn(),
    };

    fileStorageService = {
      upload: jest.fn().mockResolvedValue('mock-storage-key'),
      download: jest.fn().mockResolvedValue(Buffer.from('file content')),
      getSignedUrl: jest.fn().mockResolvedValue('https://minio:9000/signed-url'),
      buildKey: jest.fn().mockReturnValue(`${mockWorkspaceId}/${mockProjectId}/uuid/test.pdf`),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectFilesService,
        {
          provide: getRepositoryToken(ProjectFile),
          useValue: projectFileRepository,
        },
        {
          provide: getRepositoryToken(Project),
          useValue: projectRepository,
        },
        {
          provide: FileStorageService,
          useValue: fileStorageService,
        },
        {
          provide: AuditService,
          useValue: auditService,
        },
      ],
    }).compile();

    service = module.get<ProjectFilesService>(ProjectFilesService);
  });

  describe('uploadFile', () => {
    it('should successfully upload a file and return FileResponseDto', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject);

      const result = await service.uploadFile(
        mockUserId,
        mockWorkspaceId,
        mockProjectId,
        mockMulterFile,
        { path: '/docs' },
      );

      expect(result).toBeDefined();
      expect(result.filename).toBe('test.pdf');
      expect(result.path).toBe('/docs');
      expect(result.mimeType).toBe('application/pdf');
      expect(result.downloadUrl).toBe('https://minio:9000/signed-url');
    });

    it('should call fileStorageService.upload with correct params', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject);

      await service.uploadFile(
        mockUserId,
        mockWorkspaceId,
        mockProjectId,
        mockMulterFile,
        { path: '/docs' },
      );

      expect(fileStorageService.upload).toHaveBeenCalledWith(
        'devos-uploads',
        expect.any(String),
        mockMulterFile.buffer,
        { contentType: 'application/pdf' },
      );
    });

    it('should call fileStorageService.buildKey with workspaceId, projectId, UUID, and filename', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject);

      await service.uploadFile(
        mockUserId,
        mockWorkspaceId,
        mockProjectId,
        mockMulterFile,
        { path: '/docs' },
      );

      expect(fileStorageService.buildKey).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockProjectId,
        expect.any(String), // UUID
        'test.pdf',
      );
    });

    it('should include signed download URL in response', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject);

      const result = await service.uploadFile(
        mockUserId,
        mockWorkspaceId,
        mockProjectId,
        mockMulterFile,
        { path: '/docs' },
      );

      expect(fileStorageService.getSignedUrl).toHaveBeenCalledWith(
        'devos-uploads',
        expect.any(String),
        3600,
      );
      expect(result.downloadUrl).toBe('https://minio:9000/signed-url');
    });

    it('should log audit event with FILE_UPLOADED action', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject);

      await service.uploadFile(
        mockUserId,
        mockWorkspaceId,
        mockProjectId,
        mockMulterFile,
        { path: '/docs' },
      );

      // audit is fire-and-forget, give it a tick
      await new Promise((r) => setTimeout(r, 10));
      expect(auditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        AuditAction.FILE_UPLOADED,
        'project_file',
        expect.any(String),
        expect.objectContaining({
          filename: 'test.pdf',
          projectId: mockProjectId,
          sizeBytes: mockMulterFile.buffer.length,
          mimeType: 'application/pdf',
        }),
      );
    });

    it('should throw NotFoundException when project does not exist', async () => {
      projectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.uploadFile(mockUserId, mockWorkspaceId, mockProjectId, mockMulterFile, {
          path: '/docs',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when project belongs to different workspace', async () => {
      projectRepository.findOne.mockResolvedValue(null); // findOne with different workspaceId returns null

      await expect(
        service.uploadFile(mockUserId, 'different-workspace', mockProjectId, mockMulterFile, {
          path: '/docs',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for disallowed MIME type', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject);

      const execFile = {
        ...mockMulterFile,
        mimetype: 'application/x-executable',
      };

      await expect(
        service.uploadFile(mockUserId, mockWorkspaceId, mockProjectId, execFile, {
          path: '/docs',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when file exceeds 100MB', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject);

      const largeBuffer = Buffer.alloc(101 * 1024 * 1024); // 101MB
      const largeFile = {
        ...mockMulterFile,
        buffer: largeBuffer,
      };

      await expect(
        service.uploadFile(mockUserId, mockWorkspaceId, mockProjectId, largeFile, {
          path: '/docs',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should sanitize filename (path traversal characters stripped)', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject);

      const fileWithTraversal = {
        ...mockMulterFile,
        originalname: '../../etc/passwd',
      };

      await service.uploadFile(
        mockUserId,
        mockWorkspaceId,
        mockProjectId,
        fileWithTraversal,
        { path: '/docs' },
      );

      // The buildKey call should use the sanitized filename
      const buildKeyCall = fileStorageService.buildKey.mock.calls[0];
      expect(buildKeyCall[3]).not.toContain('/');
      expect(buildKeyCall[3]).not.toContain('..');
    });

    it('should truncate filename to 255 characters if longer', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject);

      const longFilename = 'a'.repeat(300) + '.pdf';
      const fileWithLongName = {
        ...mockMulterFile,
        originalname: longFilename,
      };

      await service.uploadFile(
        mockUserId,
        mockWorkspaceId,
        mockProjectId,
        fileWithLongName,
        { path: '/docs' },
      );

      const buildKeyCall = fileStorageService.buildKey.mock.calls[0];
      expect(buildKeyCall[3].length).toBeLessThanOrEqual(255);
    });

    it('should reject empty file (0 bytes) with BadRequestException', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject);

      const emptyFile = {
        ...mockMulterFile,
        buffer: Buffer.alloc(0),
      };

      await expect(
        service.uploadFile(mockUserId, mockWorkspaceId, mockProjectId, emptyFile, {
          path: '/docs',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject null file with BadRequestException', async () => {
      projectRepository.findOne.mockResolvedValue(mockProject);

      await expect(
        service.uploadFile(mockUserId, mockWorkspaceId, mockProjectId, null as any, {
          path: '/docs',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getFile', () => {
    it('should return file metadata with fresh signed URL', async () => {
      projectFileRepository.findOne.mockResolvedValue(mockProjectFile);

      const result = await service.getFile(mockWorkspaceId, mockProjectId, mockFileId);

      expect(result).toBeDefined();
      expect(result.id).toBe(mockFileId);
      expect(result.downloadUrl).toBe('https://minio:9000/signed-url');
      expect(fileStorageService.getSignedUrl).toHaveBeenCalledWith(
        'devos-uploads',
        mockProjectFile.storageKey,
        3600,
      );
    });

    it('should throw NotFoundException when file does not exist', async () => {
      projectFileRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getFile(mockWorkspaceId, mockProjectId, 'nonexistent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when file belongs to different workspace', async () => {
      projectFileRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getFile('different-workspace', mockProjectId, mockFileId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should filter soft-deleted files automatically', async () => {
      // TypeORM automatically filters soft-deleted when using findOne
      projectFileRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getFile(mockWorkspaceId, mockProjectId, mockFileId),
      ).rejects.toThrow(NotFoundException);

      // Verify findOne was called with the right conditions
      expect(projectFileRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockFileId, projectId: mockProjectId, workspaceId: mockWorkspaceId },
      });
    });
  });

  describe('downloadFile', () => {
    it('should return buffer, filename, and mimeType', async () => {
      projectFileRepository.findOne.mockResolvedValue(mockProjectFile);

      const result = await service.downloadFile(
        mockWorkspaceId,
        mockProjectId,
        mockFileId,
        mockUserId,
      );

      expect(result.buffer).toBeDefined();
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
      expect(result.filename).toBe('test.pdf');
      expect(result.mimeType).toBe('application/pdf');
    });

    it('should call fileStorageService.download with correct bucket and storageKey', async () => {
      projectFileRepository.findOne.mockResolvedValue(mockProjectFile);

      await service.downloadFile(mockWorkspaceId, mockProjectId, mockFileId, mockUserId);

      expect(fileStorageService.download).toHaveBeenCalledWith(
        'devos-uploads',
        mockProjectFile.storageKey,
      );
    });

    it('should throw NotFoundException when file does not exist', async () => {
      projectFileRepository.findOne.mockResolvedValue(null);

      await expect(
        service.downloadFile(mockWorkspaceId, mockProjectId, 'nonexistent-id', mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when file belongs to different project', async () => {
      projectFileRepository.findOne.mockResolvedValue(null);

      await expect(
        service.downloadFile(mockWorkspaceId, 'different-project', mockFileId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should log FILE_DOWNLOADED audit event when userId is provided', async () => {
      projectFileRepository.findOne.mockResolvedValue(mockProjectFile);

      await service.downloadFile(mockWorkspaceId, mockProjectId, mockFileId, mockUserId);

      await new Promise((r) => setTimeout(r, 10));
      expect(auditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        AuditAction.FILE_DOWNLOADED,
        'project_file',
        mockFileId,
        expect.objectContaining({
          fileId: mockFileId,
          filename: 'test.pdf',
          projectId: mockProjectId,
        }),
      );
    });
  });

  describe('listFiles', () => {
    it('should return paginated list with files, total, page, limit, totalPages', async () => {
      const mockQb = createMockQueryBuilder([mockProjectFile], 1);
      projectFileRepository.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.listFiles(mockWorkspaceId, mockProjectId, {});

      expect(result.files).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should use default pagination: page=1, limit=20', async () => {
      const mockQb = createMockQueryBuilder([], 0);
      projectFileRepository.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.listFiles(mockWorkspaceId, mockProjectId, {});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(mockQb.skip).toHaveBeenCalledWith(0);
      expect(mockQb.take).toHaveBeenCalledWith(20);
    });

    it('should apply path filter', async () => {
      const mockQb = createMockQueryBuilder([], 0);
      projectFileRepository.createQueryBuilder.mockReturnValue(mockQb);

      await service.listFiles(mockWorkspaceId, mockProjectId, { path: '/docs' });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'file.path = :path',
        { path: '/docs' },
      );
    });

    it('should apply mimeType filter', async () => {
      const mockQb = createMockQueryBuilder([], 0);
      projectFileRepository.createQueryBuilder.mockReturnValue(mockQb);

      await service.listFiles(mockWorkspaceId, mockProjectId, {
        mimeType: 'application/pdf',
      });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'file.mimeType = :mimeType',
        { mimeType: 'application/pdf' },
      );
    });

    it('should apply search filter (case-insensitive partial filename match)', async () => {
      const mockQb = createMockQueryBuilder([], 0);
      projectFileRepository.createQueryBuilder.mockReturnValue(mockQb);

      await service.listFiles(mockWorkspaceId, mockProjectId, { search: 'spec' });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'file.filename ILIKE :search',
        { search: '%spec%' },
      );
    });

    it('should escape ILIKE wildcard characters in search query', async () => {
      const mockQb = createMockQueryBuilder([], 0);
      projectFileRepository.createQueryBuilder.mockReturnValue(mockQb);

      await service.listFiles(mockWorkspaceId, mockProjectId, { search: '100%_done' });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'file.filename ILIKE :search',
        { search: '%100\\%\\_done%' },
      );
    });

    it('should order by createdAt DESC (newest first)', async () => {
      const mockQb = createMockQueryBuilder([], 0);
      projectFileRepository.createQueryBuilder.mockReturnValue(mockQb);

      await service.listFiles(mockWorkspaceId, mockProjectId, {});

      expect(mockQb.orderBy).toHaveBeenCalledWith('file.createdAt', 'DESC');
    });

    it('should generate signed URLs for each file in the list', async () => {
      const mockQb = createMockQueryBuilder(
        [mockProjectFile, { ...mockProjectFile, id: 'file-2' }],
        2,
      );
      projectFileRepository.createQueryBuilder.mockReturnValue(mockQb);

      await service.listFiles(mockWorkspaceId, mockProjectId, {});

      expect(fileStorageService.getSignedUrl).toHaveBeenCalledTimes(2);
    });

    it('should exclude soft-deleted files', async () => {
      const mockQb = createMockQueryBuilder([], 0);
      projectFileRepository.createQueryBuilder.mockReturnValue(mockQb);

      await service.listFiles(mockWorkspaceId, mockProjectId, {});

      expect(mockQb.andWhere).toHaveBeenCalledWith('file.deletedAt IS NULL');
    });

    it('should return empty results for project with no files', async () => {
      const mockQb = createMockQueryBuilder([], 0);
      projectFileRepository.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.listFiles(mockWorkspaceId, mockProjectId, {});

      expect(result.files).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('should calculate totalPages correctly', async () => {
      const mockQb = createMockQueryBuilder([], 45);
      projectFileRepository.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.listFiles(mockWorkspaceId, mockProjectId, {
        limit: 20,
      });

      expect(result.totalPages).toBe(3); // ceil(45/20) = 3
    });
  });

  describe('updateFile', () => {
    it('should update description and persist', async () => {
      projectFileRepository.findOne.mockResolvedValue({ ...mockProjectFile });

      const result = await service.updateFile(
        mockWorkspaceId,
        mockProjectId,
        mockFileId,
        { description: 'Updated description' },
        mockUserId,
      );

      expect(projectFileRepository.save).toHaveBeenCalled();
      expect(result.description).toBe('Updated description');
    });

    it('should update path and persist', async () => {
      projectFileRepository.findOne.mockResolvedValue({ ...mockProjectFile });
      const mockQb = createMockQueryBuilder([], 0);
      mockQb.getOne.mockResolvedValue(null); // No conflict
      projectFileRepository.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.updateFile(
        mockWorkspaceId,
        mockProjectId,
        mockFileId,
        { path: '/archive' },
        mockUserId,
      );

      expect(projectFileRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when file does not exist', async () => {
      projectFileRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateFile(mockWorkspaceId, mockProjectId, mockFileId, {
          description: 'test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when new path+filename already exists', async () => {
      projectFileRepository.findOne.mockResolvedValue({ ...mockProjectFile });
      const mockQb = createMockQueryBuilder();
      mockQb.getOne.mockResolvedValue({ id: 'existing-file' }); // Conflict!
      projectFileRepository.createQueryBuilder.mockReturnValue(mockQb);

      await expect(
        service.updateFile(
          mockWorkspaceId,
          mockProjectId,
          mockFileId,
          { path: '/conflict-path' },
          mockUserId,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should log FILE_UPDATED audit event', async () => {
      projectFileRepository.findOne.mockResolvedValue({ ...mockProjectFile });

      await service.updateFile(
        mockWorkspaceId,
        mockProjectId,
        mockFileId,
        { description: 'Updated' },
        mockUserId,
      );

      await new Promise((r) => setTimeout(r, 10));
      expect(auditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        AuditAction.FILE_UPDATED,
        'project_file',
        mockFileId,
        expect.objectContaining({
          fileId: mockFileId,
          changes: expect.any(Object),
        }),
      );
    });
  });

  describe('deleteFile', () => {
    it('should call softDelete (not delete)', async () => {
      projectFileRepository.findOne.mockResolvedValue(mockProjectFile);

      await service.deleteFile(mockUserId, mockWorkspaceId, mockProjectId, mockFileId);

      expect(projectFileRepository.softDelete).toHaveBeenCalledWith(mockFileId);
    });

    it('should log FILE_DELETED audit event', async () => {
      projectFileRepository.findOne.mockResolvedValue(mockProjectFile);

      await service.deleteFile(mockUserId, mockWorkspaceId, mockProjectId, mockFileId);

      await new Promise((r) => setTimeout(r, 10));
      expect(auditService.log).toHaveBeenCalledWith(
        mockWorkspaceId,
        mockUserId,
        AuditAction.FILE_DELETED,
        'project_file',
        mockFileId,
        expect.objectContaining({
          fileId: mockFileId,
          filename: 'test.pdf',
          projectId: mockProjectId,
        }),
      );
    });

    it('should throw NotFoundException when file does not exist', async () => {
      projectFileRepository.findOne.mockResolvedValue(null);

      await expect(
        service.deleteFile(mockUserId, mockWorkspaceId, mockProjectId, 'nonexistent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should NOT delete MinIO object (deferred to background cleanup)', async () => {
      projectFileRepository.findOne.mockResolvedValue(mockProjectFile);

      await service.deleteFile(mockUserId, mockWorkspaceId, mockProjectId, mockFileId);

      expect(fileStorageService.delete).not.toHaveBeenCalled();
    });
  });

  describe('getStorageUsage', () => {
    it('should return correct total files count and total size', async () => {
      const mockQb = createMockQueryBuilder();
      mockQb.getRawOne.mockResolvedValue({
        totalFiles: '42',
        totalSizeBytes: '104857600',
      });
      projectFileRepository.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getStorageUsage(mockWorkspaceId, mockProjectId);

      expect(result.totalFiles).toBe(42);
      expect(result.totalSizeBytes).toBe(104857600);
    });

    it('should exclude soft-deleted files from aggregation', async () => {
      const mockQb = createMockQueryBuilder();
      mockQb.getRawOne.mockResolvedValue({
        totalFiles: '5',
        totalSizeBytes: '5000',
      });
      projectFileRepository.createQueryBuilder.mockReturnValue(mockQb);

      await service.getStorageUsage(mockWorkspaceId, mockProjectId);

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'file.deletedAt IS NULL',
      );
    });

    it('should return zeros for project with no files', async () => {
      const mockQb = createMockQueryBuilder();
      mockQb.getRawOne.mockResolvedValue({
        totalFiles: '0',
        totalSizeBytes: '0',
      });
      projectFileRepository.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getStorageUsage(mockWorkspaceId, mockProjectId);

      expect(result.totalFiles).toBe(0);
      expect(result.totalSizeBytes).toBe(0);
    });
  });
});
