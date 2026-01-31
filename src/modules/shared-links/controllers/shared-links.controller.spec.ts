import { Test, TestingModule } from '@nestjs/testing';
import { SharedLinksController } from './shared-links.controller';
import { SharedLinksService } from '../services/shared-links.service';
import { CreateSharedLinkDto, ExpirationOption } from '../dto/create-shared-link.dto';
import { SharedLinkNotFoundException } from '../exceptions/shared-link.exceptions';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../../../common/guards/role.guard';
import { plainToInstance } from 'class-transformer';
import { SharedLinkResponseDto } from '../dto/shared-link-response.dto';

describe('SharedLinksController', () => {
  let controller: SharedLinksController;
  let service: SharedLinksService;

  const mockSharedLinksService = {
    create: jest.fn(),
    findAllByProject: jest.fn(),
    findById: jest.fn(),
    revoke: jest.fn(),
  };

  const mockRequest = {
    user: {
      id: 'user-uuid-789',
      email: 'user@example.com',
    },
  };

  const mockSharedLink = {
    id: 'link-uuid-123',
    projectId: 'project-uuid-456',
    workspaceId: 'workspace-uuid-789',
    token: 'secure-token-abc123',
    createdByUserId: 'user-uuid-789',
    expiresAt: new Date('2026-02-07T12:00:00Z'),
    passwordHash: undefined,
    isActive: true,
    viewCount: 5,
    lastViewedAt: new Date('2026-01-31T15:30:00Z'),
    createdAt: new Date('2026-01-31T12:00:00Z'),
    updatedAt: new Date('2026-01-31T12:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SharedLinksController],
      providers: [
        {
          provide: SharedLinksService,
          useValue: mockSharedLinksService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<SharedLinksController>(SharedLinksController);
    service = module.get<SharedLinksService>(SharedLinksService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /api/v1/workspaces/:workspaceId/projects/:projectId/shared-links', () => {
    const workspaceId = 'workspace-uuid-789';
    const projectId = 'project-uuid-456';

    it('should create a shared link without password', async () => {
      const createDto: CreateSharedLinkDto = {
        expiresIn: ExpirationOption.SEVEN_DAYS,
      };

      mockSharedLinksService.create.mockResolvedValue(mockSharedLink);

      const result = await controller.create(
        workspaceId,
        projectId,
        createDto,
        mockRequest as any,
      );

      expect(service.create).toHaveBeenCalledWith(
        projectId,
        workspaceId,
        mockRequest.user.id,
        createDto,
      );
      expect(result).toBeDefined();
      expect(result.id).toBe(mockSharedLink.id);
      expect(result.token).toBe(mockSharedLink.token);
      expect(result.url).toContain(mockSharedLink.token);
      expect(result.hasPassword).toBe(false);
    });

    it('should create a shared link with password', async () => {
      const createDto: CreateSharedLinkDto = {
        expiresIn: ExpirationOption.NEVER,
        password: 'secure-password-123',
      };

      const mockLinkWithPassword = {
        ...mockSharedLink,
        expiresAt: null,
      };

      mockSharedLinksService.create.mockResolvedValue(mockLinkWithPassword);

      const result = await controller.create(
        workspaceId,
        projectId,
        createDto,
        mockRequest as any,
      );

      expect(service.create).toHaveBeenCalledWith(
        projectId,
        workspaceId,
        mockRequest.user.id,
        createDto,
      );
      expect(result.expiresAt).toBeNull();
    });

    it('should include full URL in response', async () => {
      const createDto: CreateSharedLinkDto = {
        expiresIn: ExpirationOption.SEVEN_DAYS,
      };

      mockSharedLinksService.create.mockResolvedValue(mockSharedLink);

      const result = await controller.create(
        workspaceId,
        projectId,
        createDto,
        mockRequest as any,
      );

      const expectedUrl = `${process.env.FRONTEND_URL || 'https://devos.com'}/share/${mockSharedLink.token}`;
      expect(result.url).toBe(expectedUrl);
    });
  });

  describe('GET /api/v1/workspaces/:workspaceId/projects/:projectId/shared-links', () => {
    const workspaceId = 'workspace-uuid-789';
    const projectId = 'project-uuid-456';

    it('should return all shared links for a project', async () => {
      const mockLinks = [
        mockSharedLink,
        { ...mockSharedLink, id: 'link-uuid-456', token: 'another-token' },
      ];

      mockSharedLinksService.findAllByProject.mockResolvedValue(mockLinks);

      const result = await controller.findAll(workspaceId, projectId);

      expect(service.findAllByProject).toHaveBeenCalledWith(
        projectId,
        workspaceId,
      );
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(mockLinks[0].id);
      expect(result[0].url).toContain(mockLinks[0].token);
    });

    it('should return empty array if no links exist', async () => {
      mockSharedLinksService.findAllByProject.mockResolvedValue([]);

      const result = await controller.findAll(workspaceId, projectId);

      expect(result).toEqual([]);
    });

    it('should not expose password hash in response', async () => {
      const mockLinkWithHash = {
        ...mockSharedLink,
        passwordHash: 'hashed-password-should-not-be-exposed',
      };

      mockSharedLinksService.findAllByProject.mockResolvedValue([
        mockLinkWithHash,
      ]);

      const result = await controller.findAll(workspaceId, projectId);

      expect(result[0]).not.toHaveProperty('passwordHash');
    });
  });

  describe('GET /api/v1/workspaces/:workspaceId/projects/:projectId/shared-links/:linkId', () => {
    const workspaceId = 'workspace-uuid-789';
    const projectId = 'project-uuid-456';
    const linkId = 'link-uuid-123';

    it('should return a specific shared link', async () => {
      mockSharedLinksService.findById.mockResolvedValue(mockSharedLink);

      const result = await controller.findOne(workspaceId, projectId, linkId);

      expect(service.findById).toHaveBeenCalledWith(linkId, workspaceId);
      expect(result.id).toBe(mockSharedLink.id);
      expect(result.token).toBe(mockSharedLink.token);
      expect(result.url).toContain(mockSharedLink.token);
    });

    it('should throw NotFoundException if link does not exist', async () => {
      mockSharedLinksService.findById.mockRejectedValue(
        new SharedLinkNotFoundException(),
      );

      await expect(
        controller.findOne(workspaceId, projectId, linkId),
      ).rejects.toThrow(SharedLinkNotFoundException);
    });
  });

  describe('DELETE /api/v1/workspaces/:workspaceId/projects/:projectId/shared-links/:linkId', () => {
    const workspaceId = 'workspace-uuid-789';
    const projectId = 'project-uuid-456';
    const linkId = 'link-uuid-123';

    it('should revoke a shared link', async () => {
      mockSharedLinksService.revoke.mockResolvedValue(undefined);

      await controller.revoke(workspaceId, projectId, linkId);

      expect(service.revoke).toHaveBeenCalledWith(linkId, workspaceId);
    });

    it('should throw NotFoundException if link does not exist', async () => {
      mockSharedLinksService.revoke.mockRejectedValue(
        new SharedLinkNotFoundException(),
      );

      await expect(
        controller.revoke(workspaceId, projectId, linkId),
      ).rejects.toThrow(SharedLinkNotFoundException);
    });
  });

  describe('toResponseDto', () => {
    it('should transform entity to response DTO', () => {
      const result = (controller as any).toResponseDto(mockSharedLink);

      expect(result.id).toBe(mockSharedLink.id);
      expect(result.token).toBe(mockSharedLink.token);
      expect(result.url).toContain(mockSharedLink.token);
      expect(result.hasPassword).toBe(false);
      expect(result.isActive).toBe(true);
      expect(result.viewCount).toBe(5);
    });

    it('should set hasPassword to true when passwordHash exists', () => {
      const linkWithPassword = {
        ...mockSharedLink,
        passwordHash: 'hashed-password',
      };

      const result = (controller as any).toResponseDto(linkWithPassword);

      expect(result.hasPassword).toBe(true);
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should handle null expiresAt', () => {
      const linkNoExpiry = {
        ...mockSharedLink,
        expiresAt: null,
      };

      const result = (controller as any).toResponseDto(linkNoExpiry);

      expect(result.expiresAt).toBeNull();
    });
  });
});
