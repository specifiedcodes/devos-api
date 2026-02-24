/**
 * Template Version Service Tests
 *
 * Story 19-7: Template Versioning
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { TemplateVersionService } from '../services/template-version.service';
import { TemplateVersion } from '../../../database/entities/template-version.entity';
import { Template } from '../../../database/entities/template.entity';
import { TemplateAuditService } from '../services/template-audit.service';
import { PublishTemplateVersionDto } from '../dto/publish-template-version.dto';
import { TemplateAuditEventType } from '../../../database/entities/template-audit-event.entity';

describe('TemplateVersionService', () => {
  let service: TemplateVersionService;
  let versionRepository: jest.Mocked<Repository<TemplateVersion>>;
  let templateRepository: jest.Mocked<Repository<Template>>;
  let auditService: jest.Mocked<TemplateAuditService>;
  let dataSource: jest.Mocked<DataSource>;

  const mockTemplateId = '123e4567-e89b-12d3-a456-426614174000';
  const mockUserId = '123e4567-e89b-12d3-a456-426614174001';
  const mockWorkspaceId = '123e4567-e89b-12d3-a456-426614174002';

  const mockTemplate: Partial<Template> = {
    id: mockTemplateId,
    name: 'test-template',
    displayName: 'Test Template',
    version: '1.0.0',
    definition: {
      stack: { frontend: 'nextjs' },
      variables: [],
      files: { source_type: 'git' },
    },
  };

  const mockVersion: Partial<TemplateVersion> = {
    id: '123e4567-e89b-12d3-a456-426614174003',
    templateId: mockTemplateId,
    version: '1.0.0',
    changelog: 'Initial version',
    definition: mockTemplate.definition!,
    isLatest: true,
    downloadCount: 0,
    publishedBy: mockUserId,
    publishedAt: new Date(),
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockVersionRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      increment: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([mockVersion]),
      })),
    };

    const mockTemplateRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const mockAuditService = {
      logEvent: jest.fn().mockResolvedValue({}),
    };

    const mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        update: jest.fn(),
        create: jest.fn().mockReturnValue(mockVersion),
        save: jest.fn().mockResolvedValue(mockVersion),
      },
    };

    const mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateVersionService,
        {
          provide: getRepositoryToken(TemplateVersion),
          useValue: mockVersionRepository,
        },
        {
          provide: getRepositoryToken(Template),
          useValue: mockTemplateRepository,
        },
        {
          provide: TemplateAuditService,
          useValue: mockAuditService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<TemplateVersionService>(TemplateVersionService);
    versionRepository = module.get(getRepositoryToken(TemplateVersion));
    templateRepository = module.get(getRepositoryToken(Template));
    auditService = module.get(TemplateAuditService);
    dataSource = module.get(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('publishVersion', () => {
    const dto: PublishTemplateVersionDto = {
      version: '1.1.0',
      changelog: 'New features added',
    };

    it('should publish a new version successfully', async () => {
      templateRepository.findOne.mockResolvedValue(mockTemplate as Template);
      versionRepository.findOne.mockResolvedValue(null);
      versionRepository.find.mockResolvedValue([]);

      const result = await service.publishVersion(
        mockTemplateId,
        mockUserId,
        mockWorkspaceId,
        dto,
      );

      expect(result).toBeDefined();
      expect(templateRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockTemplateId },
      });
      expect(auditService.logEvent).toHaveBeenCalled();
    });

    it('should throw NotFoundException if template does not exist', async () => {
      templateRepository.findOne.mockResolvedValue(null);

      await expect(
        service.publishVersion(mockTemplateId, mockUserId, mockWorkspaceId, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if version already exists', async () => {
      templateRepository.findOne.mockResolvedValue(mockTemplate as Template);
      versionRepository.findOne.mockResolvedValue(mockVersion as TemplateVersion);

      await expect(
        service.publishVersion(mockTemplateId, mockUserId, mockWorkspaceId, dto),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException for invalid semver format', async () => {
      const invalidDto: PublishTemplateVersionDto = {
        version: 'invalid',
        changelog: 'test',
      };

      await expect(
        service.publishVersion(mockTemplateId, mockUserId, mockWorkspaceId, invalidDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('validateNewVersion', () => {
    it('should pass for first version', async () => {
      versionRepository.find.mockResolvedValue([]);

      await expect(
        service.validateNewVersion(mockTemplateId, '1.0.0'),
      ).resolves.not.toThrow();
    });

    it('should pass when new version is greater', async () => {
      versionRepository.find.mockResolvedValue([
        { version: '1.0.0' } as TemplateVersion,
      ]);

      await expect(
        service.validateNewVersion(mockTemplateId, '1.1.0'),
      ).resolves.not.toThrow();
    });

    it('should throw BadRequestException when new version is not greater', async () => {
      versionRepository.find.mockResolvedValue([
        { version: '1.0.0' } as TemplateVersion,
      ]);

      await expect(
        service.validateNewVersion(mockTemplateId, '1.0.0'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listVersions', () => {
    it('should return paginated versions', async () => {
      templateRepository.findOne.mockResolvedValue(mockTemplate as Template);

      const result = await service.listVersions(mockTemplateId, {
        page: 1,
        limit: 20,
      });

      expect(result.items).toBeDefined();
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should throw NotFoundException if template does not exist', async () => {
      templateRepository.findOne.mockResolvedValue(null);

      await expect(
        service.listVersions(mockTemplateId, { page: 1, limit: 20 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getVersion', () => {
    it('should return a specific version', async () => {
      versionRepository.findOne.mockResolvedValue(mockVersion as TemplateVersion);

      const result = await service.getVersion(mockTemplateId, '1.0.0');

      expect(result.version).toBe('1.0.0');
    });

    it('should throw BadRequestException for invalid semver', async () => {
      await expect(
        service.getVersion(mockTemplateId, 'invalid'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if version does not exist', async () => {
      versionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getVersion(mockTemplateId, '1.0.0'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getLatestVersion', () => {
    it('should return the latest version', async () => {
      versionRepository.findOne.mockResolvedValue(mockVersion as TemplateVersion);

      const result = await service.getLatestVersion(mockTemplateId);

      expect(result).toBeDefined();
      expect(result?.isLatest).toBe(true);
    });

    it('should return null if no versions exist', async () => {
      versionRepository.findOne.mockResolvedValue(null);

      const result = await service.getLatestVersion(mockTemplateId);

      expect(result).toBeNull();
    });
  });

  describe('incrementDownloadCount', () => {
    it('should increment download count', async () => {
      await service.incrementDownloadCount('version-id');

      expect(versionRepository.increment).toHaveBeenCalledWith(
        { id: 'version-id' },
        'downloadCount',
        1,
      );
    });
  });

  describe('deleteVersion', () => {
    it('should throw BadRequestException when trying to delete latest version', async () => {
      versionRepository.findOne.mockResolvedValue({
        ...mockVersion,
        isLatest: true,
      } as TemplateVersion);

      await expect(
        service.deleteVersion(mockTemplateId, '1.0.0', mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when only one version exists', async () => {
      (versionRepository as any).count.mockResolvedValue(1);
      versionRepository.findOne.mockResolvedValue({
        ...mockVersion,
        isLatest: false,
      } as TemplateVersion);

      await expect(
        service.deleteVersion(mockTemplateId, '1.0.0', mockUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
