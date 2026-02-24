/**
 * Template Version Controller Tests
 *
 * Story 19-7: Template Versioning
 */
import { Test, TestingModule } from '@nestjs/testing';
import { TemplateVersionController } from '../controllers/template-version.controller';
import { TemplateVersionService } from '../services/template-version.service';
import { PublishTemplateVersionDto } from '../dto/publish-template-version.dto';

describe('TemplateVersionController', () => {
  let controller: TemplateVersionController;
  let service: jest.Mocked<TemplateVersionService>;

  const mockTemplateId = '123e4567-e89b-12d3-a456-426614174000';
  const mockUserId = '123e4567-e89b-12d3-a456-426614174001';

  const mockVersion = {
    id: '123e4567-e89b-12d3-a456-426614174002',
    templateId: mockTemplateId,
    version: '1.1.0',
    changelog: 'New features',
    definition: {
      stack: { frontend: 'nextjs' },
      variables: [],
      files: { source_type: 'git' },
    },
    isLatest: true,
    downloadCount: 0,
    publishedBy: mockUserId,
    publishedAt: new Date(),
    createdAt: new Date(),
  };

  const mockRequest = {
    user: { id: mockUserId },
    body: {},
  };

  beforeEach(async () => {
    const mockService = {
      publishVersion: jest.fn().mockResolvedValue(mockVersion),
      listVersions: jest.fn().mockResolvedValue({
        items: [mockVersion],
        total: 1,
        page: 1,
        limit: 20,
        hasMore: false,
      }),
      getVersion: jest.fn().mockResolvedValue(mockVersion),
      getLatestVersion: jest.fn().mockResolvedValue(mockVersion),
      deleteVersion: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplateVersionController],
      providers: [
        {
          provide: TemplateVersionService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<TemplateVersionController>(TemplateVersionController);
    service = module.get(TemplateVersionService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('publishVersion', () => {
    it('should publish a new version', async () => {
      const dto: PublishTemplateVersionDto = {
        version: '1.1.0',
        changelog: 'New features',
      };

      const result = await controller.publishVersion(mockTemplateId, mockRequest as any, dto);

      expect(result.version).toBe('1.1.0');
      expect(service.publishVersion).toHaveBeenCalledWith(
        mockTemplateId,
        mockUserId,
        null,
        dto,
      );
    });
  });

  describe('listVersions', () => {
    it('should return paginated versions', async () => {
      const result = await controller.listVersions(mockTemplateId, {
        page: 1,
        limit: 20,
      });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getLatestVersion', () => {
    it('should return the latest version', async () => {
      const result = await controller.getLatestVersion(mockTemplateId);

      expect(result.isLatest).toBe(true);
      expect(service.getLatestVersion).toHaveBeenCalledWith(mockTemplateId);
    });
  });

  describe('getVersion', () => {
    it('should return a specific version', async () => {
      const result = await controller.getVersion(mockTemplateId, '1.1.0');

      expect(result.version).toBe('1.1.0');
      expect(service.getVersion).toHaveBeenCalledWith(mockTemplateId, '1.1.0');
    });
  });

  describe('deleteVersion', () => {
    it('should delete a version', async () => {
      await controller.deleteVersion(mockTemplateId, '1.0.0', mockRequest as any);

      expect(service.deleteVersion).toHaveBeenCalledWith(
        mockTemplateId,
        '1.0.0',
        mockUserId,
      );
    });
  });
});
