/**
 * Template Update Controller Tests
 *
 * Story 19-7: Template Versioning
 */
import { Test, TestingModule } from '@nestjs/testing';
import { TemplateUpdateController } from '../controllers/template-update.controller';
import { TemplateUpdateService } from '../services/template-update.service';
import { DismissUpdateDto } from '../dto/dismiss-update.dto';

describe('TemplateUpdateController', () => {
  let controller: TemplateUpdateController;
  let service: jest.Mocked<TemplateUpdateService>;

  const mockProjectId = '123e4567-e89b-12d3-a456-426614174000';
  const mockTemplateId = '123e4567-e89b-12d3-a456-426614174001';

  const mockUpdateStatus = {
    id: '123e4567-e89b-12d3-a456-426614174002',
    projectId: mockProjectId,
    templateId: mockTemplateId,
    templateName: 'test-template',
    templateDisplayName: 'Test Template',
    installedVersion: '1.0.0',
    latestVersion: '1.1.0',
    updateAvailable: true,
    updateType: 'minor' as const,
    lastCheckedAt: new Date(),
    dismissedVersion: null,
    createdAt: new Date(),
  };

  const mockRequest = {
    user: { id: '123e4567-e89b-12d3-a456-426614174003' },
  };

  beforeEach(async () => {
    const mockService = {
      getUpdateStatus: jest.fn().mockResolvedValue(mockUpdateStatus),
      checkForUpdates: jest.fn().mockResolvedValue({
        projectId: mockProjectId,
        templateId: mockTemplateId,
        installedVersion: '1.0.0',
        latestVersion: '1.1.0',
        updateAvailable: true,
        updateType: 'minor',
        lastCheckedAt: new Date(),
        changelog: 'New features',
      }),
      dismissUpdate: jest.fn().mockResolvedValue(undefined),
      clearDismissedUpdate: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplateUpdateController],
      providers: [
        {
          provide: TemplateUpdateService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<TemplateUpdateController>(TemplateUpdateController);
    service = module.get(TemplateUpdateService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProjectTemplateVersion', () => {
    it('should return project template version info', async () => {
      const result = await controller.getProjectTemplateVersion(mockProjectId);

      expect(result.projectId).toBe(mockProjectId);
      expect(service.getUpdateStatus).toHaveBeenCalledWith(mockProjectId);
    });
  });

  describe('checkForUpdates', () => {
    it('should check for updates', async () => {
      const result = await controller.checkForUpdates(mockProjectId);

      expect(result.updateAvailable).toBe(true);
      expect(result.updateType).toBe('minor');
      expect(service.checkForUpdates).toHaveBeenCalledWith(mockProjectId);
    });
  });

  describe('dismissUpdate', () => {
    it('should dismiss an update', async () => {
      const dto: DismissUpdateDto = { version: '1.1.0' };

      await controller.dismissUpdate(mockProjectId, dto);

      expect(service.dismissUpdate).toHaveBeenCalledWith(mockProjectId, '1.1.0');
    });
  });

  describe('clearDismissedUpdate', () => {
    it('should clear dismissed update', async () => {
      await controller.clearDismissedUpdate(mockProjectId);

      expect(service.clearDismissedUpdate).toHaveBeenCalledWith(mockProjectId);
    });
  });
});
