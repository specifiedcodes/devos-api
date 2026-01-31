import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { SharedViewController } from './shared-view.controller';
import { SharedLinksService } from '../services/shared-links.service';
import { ValidatePasswordDto } from '../dto/validate-password.dto';
import {
  SharedLinkNotFoundException,
  SharedLinkExpiredException,
  SharedLinkRevokedException,
  InvalidPasswordException,
} from '../exceptions/shared-link.exceptions';
import { ProjectStatus } from '../../../database/entities/project.entity';

describe('SharedViewController', () => {
  let controller: SharedViewController;
  let service: SharedLinksService;

  const mockSharedLinksService = {
    findByToken: jest.fn(),
    validatePassword: jest.fn(),
    incrementViewCount: jest.fn(),
  };

  const mockSharedLink = {
    id: 'link-uuid-123',
    projectId: 'project-uuid-456',
    workspaceId: 'workspace-uuid-789',
    token: 'secure-token-abc123',
    createdByUserId: 'user-uuid-789',
    expiresAt: null,
    passwordHash: undefined,
    isActive: true,
    viewCount: 5,
    lastViewedAt: new Date('2026-01-31T15:30:00Z'),
    createdAt: new Date('2026-01-31T12:00:00Z'),
    updatedAt: new Date('2026-01-31T12:00:00Z'),
    project: {
      id: 'project-uuid-456',
      name: 'Awesome Project',
      description: 'A very cool project',
      deploymentUrl: 'https://myproject.vercel.app',
      status: ProjectStatus.ACTIVE,
      updatedAt: new Date('2026-01-31T12:00:00Z'),
    },
  };

  const mockRequest = {
    session: {} as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            name: 'default',
            ttl: 60000,
            limit: 10,
          },
        ]),
      ],
      controllers: [SharedViewController],
      providers: [
        {
          provide: SharedLinksService,
          useValue: mockSharedLinksService,
        },
      ],
    }).compile();

    controller = module.get<SharedViewController>(SharedViewController);
    service = module.get<SharedLinksService>(SharedLinksService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /share/:token', () => {
    const token = 'secure-token-abc123';

    it('should return project view for valid non-password-protected link', async () => {
      mockSharedLinksService.findByToken.mockResolvedValue(mockSharedLink);
      mockSharedLinksService.incrementViewCount.mockResolvedValue(undefined);

      const result = await controller.viewSharedProject(
        token,
        mockRequest as any,
      );

      expect(service.findByToken).toHaveBeenCalledWith(token);
      expect(service.incrementViewCount).toHaveBeenCalledWith(
        mockSharedLink.id,
      );
      expect(result.id).toBe(mockSharedLink.project.id);
      expect(result.name).toBe(mockSharedLink.project.name);
      expect(result.description).toBe(mockSharedLink.project.description);
      expect(result.deploymentUrl).toBe(mockSharedLink.project.deploymentUrl);
      expect(result.status).toBe(mockSharedLink.project.status);
      expect(result.poweredBy).toBe('Powered by DevOS');
    });

    it('should require password for password-protected link without session', async () => {
      const linkWithPassword = {
        ...mockSharedLink,
        passwordHash: 'hashed-password',
      };

      mockSharedLinksService.findByToken.mockResolvedValue(linkWithPassword);

      await expect(
        controller.viewSharedProject(token, mockRequest as any),
      ).rejects.toThrow(InvalidPasswordException);

      expect(service.incrementViewCount).not.toHaveBeenCalled();
    });

    it('should allow access to password-protected link with valid session', async () => {
      const linkWithPassword = {
        ...mockSharedLink,
        passwordHash: 'hashed-password',
      };

      const requestWithSession = {
        session: {
          [`shared_link_${token}`]: true,
        },
      };

      mockSharedLinksService.findByToken.mockResolvedValue(linkWithPassword);
      mockSharedLinksService.incrementViewCount.mockResolvedValue(undefined);

      const result = await controller.viewSharedProject(
        token,
        requestWithSession as any,
      );

      expect(result.id).toBe(mockSharedLink.project.id);
      expect(service.incrementViewCount).toHaveBeenCalled();
    });

    it('should throw SharedLinkNotFoundException for invalid token', async () => {
      mockSharedLinksService.findByToken.mockRejectedValue(
        new SharedLinkNotFoundException(token),
      );

      await expect(
        controller.viewSharedProject(token, mockRequest as any),
      ).rejects.toThrow(SharedLinkNotFoundException);
    });

    it('should throw SharedLinkExpiredException for expired link', async () => {
      mockSharedLinksService.findByToken.mockRejectedValue(
        new SharedLinkExpiredException(token),
      );

      await expect(
        controller.viewSharedProject(token, mockRequest as any),
      ).rejects.toThrow(SharedLinkExpiredException);
    });

    it('should throw SharedLinkRevokedException for revoked link', async () => {
      mockSharedLinksService.findByToken.mockRejectedValue(
        new SharedLinkRevokedException(token),
      );

      await expect(
        controller.viewSharedProject(token, mockRequest as any),
      ).rejects.toThrow(SharedLinkRevokedException);
    });

    it('should not expose sensitive project data', async () => {
      const projectWithSensitiveData = {
        ...mockSharedLink.project,
        apiKey: 'secret-api-key',
        internalNotes: 'confidential notes',
        createdByUserId: 'user-uuid',
      };

      const linkWithSensitiveProject = {
        ...mockSharedLink,
        project: projectWithSensitiveData,
      };

      mockSharedLinksService.findByToken.mockResolvedValue(
        linkWithSensitiveProject,
      );
      mockSharedLinksService.incrementViewCount.mockResolvedValue(undefined);

      const result = await controller.viewSharedProject(
        token,
        mockRequest as any,
      );

      expect(result).not.toHaveProperty('apiKey');
      expect(result).not.toHaveProperty('internalNotes');
      expect(result).not.toHaveProperty('createdByUserId');
    });
  });

  describe('POST /share/:token/validate-password', () => {
    const token = 'secure-token-abc123';

    it('should validate correct password and set session', async () => {
      const linkWithPassword = {
        ...mockSharedLink,
        passwordHash: 'hashed-password',
      };

      const validateDto: ValidatePasswordDto = {
        password: 'correct-password',
      };

      mockSharedLinksService.findByToken.mockResolvedValue(linkWithPassword);
      mockSharedLinksService.validatePassword.mockResolvedValue(true);

      const result = await controller.validatePassword(
        token,
        validateDto,
        mockRequest as any,
      );

      expect(service.findByToken).toHaveBeenCalledWith(token);
      expect(service.validatePassword).toHaveBeenCalledWith(
        validateDto.password,
        linkWithPassword.passwordHash,
      );
      expect(result.success).toBe(true);
      expect(mockRequest.session[`shared_link_${token}`]).toBe(true);
    });

    it('should throw InvalidPasswordException for incorrect password', async () => {
      const linkWithPassword = {
        ...mockSharedLink,
        passwordHash: 'hashed-password',
      };

      const validateDto: ValidatePasswordDto = {
        password: 'wrong-password',
      };

      const testRequest = {
        session: {} as any,
      };

      mockSharedLinksService.findByToken.mockResolvedValue(linkWithPassword);
      mockSharedLinksService.validatePassword.mockResolvedValue(false);

      await expect(
        controller.validatePassword(token, validateDto, testRequest as any),
      ).rejects.toThrow(InvalidPasswordException);

      expect(testRequest.session[`shared_link_${token}`]).toBeUndefined();
    });

    it('should throw error if link is not password protected', async () => {
      const validateDto: ValidatePasswordDto = {
        password: 'any-password',
      };

      mockSharedLinksService.findByToken.mockResolvedValue(mockSharedLink);

      await expect(
        controller.validatePassword(token, validateDto, mockRequest as any),
      ).rejects.toThrow('This link is not password protected');
    });

    it('should throw SharedLinkNotFoundException for invalid token', async () => {
      const validateDto: ValidatePasswordDto = {
        password: 'any-password',
      };

      mockSharedLinksService.findByToken.mockRejectedValue(
        new SharedLinkNotFoundException(token),
      );

      await expect(
        controller.validatePassword(token, validateDto, mockRequest as any),
      ).rejects.toThrow(SharedLinkNotFoundException);
    });
  });

  describe('toProjectViewDto', () => {
    it('should transform project to sanitized view DTO', () => {
      const result = (controller as any).toProjectViewDto(
        mockSharedLink.project,
      );

      expect(result.id).toBe(mockSharedLink.project.id);
      expect(result.name).toBe(mockSharedLink.project.name);
      expect(result.description).toBe(mockSharedLink.project.description);
      expect(result.deploymentUrl).toBe(mockSharedLink.project.deploymentUrl);
      expect(result.status).toBe(mockSharedLink.project.status);
      expect(result.updatedAt).toEqual(mockSharedLink.project.updatedAt);
      expect(result.poweredBy).toBe('Powered by DevOS');
    });

    it('should only include whitelisted fields', () => {
      const projectWithExtraFields = {
        ...mockSharedLink.project,
        apiKey: 'secret',
        workspaceId: 'workspace-id',
        createdByUserId: 'user-id',
        internalData: 'confidential',
      };

      const result = (controller as any).toProjectViewDto(
        projectWithExtraFields,
      );

      const resultKeys = Object.keys(result);
      expect(resultKeys).toContain('id');
      expect(resultKeys).toContain('name');
      expect(resultKeys).toContain('description');
      expect(resultKeys).toContain('deploymentUrl');
      expect(resultKeys).toContain('status');
      expect(resultKeys).toContain('updatedAt');
      expect(resultKeys).toContain('poweredBy');

      expect(resultKeys).not.toContain('apiKey');
      expect(resultKeys).not.toContain('workspaceId');
      expect(resultKeys).not.toContain('createdByUserId');
      expect(resultKeys).not.toContain('internalData');
    });
  });
});
