import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SharedLinksService } from './shared-links.service';
import { SharedLink } from '../../../database/entities/shared-link.entity';
import { Project } from '../../../database/entities/project.entity';
import { ExpirationOption } from '../dto/create-shared-link.dto';
import {
  SharedLinkNotFoundException,
  SharedLinkExpiredException,
  SharedLinkRevokedException,
  InvalidPasswordException,
} from '../exceptions/shared-link.exceptions';
import * as bcrypt from 'bcrypt';

describe('SharedLinksService', () => {
  let service: SharedLinksService;
  let sharedLinkRepository: Repository<SharedLink>;
  let projectRepository: Repository<Project>;

  const mockSharedLinkRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockProjectRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SharedLinksService,
        {
          provide: getRepositoryToken(SharedLink),
          useValue: mockSharedLinkRepository,
        },
        {
          provide: getRepositoryToken(Project),
          useValue: mockProjectRepository,
        },
      ],
    }).compile();

    service = module.get<SharedLinksService>(SharedLinksService);
    sharedLinkRepository = module.get<Repository<SharedLink>>(
      getRepositoryToken(SharedLink),
    );
    projectRepository = module.get<Repository<Project>>(
      getRepositoryToken(Project),
    );

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const projectId = 'project-uuid';
    const workspaceId = 'workspace-uuid';
    const userId = 'user-uuid';

    it('should create a shared link without password and 7 days expiration', async () => {
      const mockProject = {
        id: projectId,
        workspaceId,
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockSharedLinkRepository.create.mockReturnValue({
        id: 'link-uuid',
        token: 'generated-token',
      });
      mockSharedLinkRepository.save.mockResolvedValue({
        id: 'link-uuid',
        projectId,
        workspaceId,
        token: 'generated-token',
        createdByUserId: userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        passwordHash: null,
        isActive: true,
        viewCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(projectId, workspaceId, userId, {
        expiresIn: ExpirationOption.SEVEN_DAYS,
      });

      expect(mockProjectRepository.findOne).toHaveBeenCalledWith({
        where: { id: projectId, workspaceId },
      });
      expect(result.token).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      expect(result.passwordHash).toBeUndefined();
    });

    it('should create a shared link with password protection', async () => {
      const mockProject = {
        id: projectId,
        workspaceId,
      };

      const password = 'secure-password';
      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockSharedLinkRepository.create.mockReturnValue({
        id: 'link-uuid',
        token: 'generated-token',
      });
      mockSharedLinkRepository.save.mockResolvedValue({
        id: 'link-uuid',
        projectId,
        workspaceId,
        token: 'generated-token',
        createdByUserId: userId,
        expiresAt: null,
        passwordHash: 'hashed-password',
        isActive: true,
        viewCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(projectId, workspaceId, userId, {
        expiresIn: ExpirationOption.NEVER,
        password,
      });

      expect(result.passwordHash).toBeUndefined(); // Should not expose hash
      expect(mockSharedLinkRepository.save).toHaveBeenCalled();
    });

    it('should create a shared link that never expires', async () => {
      const mockProject = {
        id: projectId,
        workspaceId,
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);
      mockSharedLinkRepository.create.mockReturnValue({
        id: 'link-uuid',
        token: 'generated-token',
      });
      mockSharedLinkRepository.save.mockResolvedValue({
        id: 'link-uuid',
        projectId,
        workspaceId,
        token: 'generated-token',
        createdByUserId: userId,
        expiresAt: null,
        passwordHash: null,
        isActive: true,
        viewCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(projectId, workspaceId, userId, {
        expiresIn: ExpirationOption.NEVER,
      });

      expect(result.expiresAt).toBeNull();
    });

    it('should throw NotFoundException if project does not exist', async () => {
      mockProjectRepository.findOne.mockResolvedValue(null);

      await expect(
        service.create(projectId, workspaceId, userId, {
          expiresIn: ExpirationOption.SEVEN_DAYS,
        }),
      ).rejects.toThrow('Project not found or does not belong to workspace');
    });

    it('should generate unique cryptographically secure tokens', async () => {
      const mockProject = {
        id: projectId,
        workspaceId,
      };

      mockProjectRepository.findOne.mockResolvedValue(mockProject);

      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        mockSharedLinkRepository.create.mockReturnValue({
          id: `link-uuid-${i}`,
          token: `token-${i}`,
        });
        mockSharedLinkRepository.save.mockResolvedValue({
          id: `link-uuid-${i}`,
          token: `token-${i}`,
          projectId,
          workspaceId,
          createdByUserId: userId,
        });

        const result = await service.create(projectId, workspaceId, userId, {
          expiresIn: ExpirationOption.NEVER,
        });
        tokens.add(result.token);
      }

      // All tokens should be unique
      expect(tokens.size).toBe(100);
    });
  });

  describe('findByToken', () => {
    it('should find an active shared link by token', async () => {
      const token = 'valid-token';
      const mockLink = {
        id: 'link-uuid',
        token,
        isActive: true,
        expiresAt: null,
        project: {
          id: 'project-uuid',
          name: 'Test Project',
        },
      };

      mockSharedLinkRepository.findOne.mockResolvedValue(mockLink);

      const result = await service.findByToken(token);

      expect(result).toEqual(mockLink);
      expect(mockSharedLinkRepository.findOne).toHaveBeenCalledWith({
        where: { token, isActive: true },
        relations: ['project', 'workspace'],
      });
    });

    it('should throw NotFoundException if token does not exist', async () => {
      mockSharedLinkRepository.findOne.mockResolvedValue(null);

      await expect(service.findByToken('invalid-token')).rejects.toThrow(
        SharedLinkNotFoundException,
      );
    });

    it('should throw SharedLinkExpiredException if link has expired', async () => {
      const token = 'expired-token';
      const mockLink = {
        id: 'link-uuid',
        token,
        isActive: true,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      };

      mockSharedLinkRepository.findOne.mockResolvedValue(mockLink);

      await expect(service.findByToken(token)).rejects.toThrow(
        SharedLinkExpiredException,
      );
    });

    it('should throw SharedLinkRevokedException if link is not active', async () => {
      const token = 'revoked-token';
      const mockLink = {
        id: 'link-uuid',
        token,
        isActive: false,
      };

      mockSharedLinkRepository.findOne.mockResolvedValue(mockLink);

      await expect(service.findByToken(token)).rejects.toThrow(
        SharedLinkRevokedException,
      );
    });
  });

  describe('findAllByProject', () => {
    it('should return all active shared links for a project', async () => {
      const projectId = 'project-uuid';
      const workspaceId = 'workspace-uuid';

      const mockLinks = [
        { id: 'link-1', token: 'token-1', isActive: true },
        { id: 'link-2', token: 'token-2', isActive: true },
      ];

      mockSharedLinkRepository.find.mockResolvedValue(mockLinks);

      const result = await service.findAllByProject(projectId, workspaceId);

      expect(result).toEqual(mockLinks);
      expect(mockSharedLinkRepository.find).toHaveBeenCalledWith({
        where: { projectId, workspaceId, isActive: true },
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty array if no links exist', async () => {
      mockSharedLinkRepository.find.mockResolvedValue([]);

      const result = await service.findAllByProject(
        'project-uuid',
        'workspace-uuid',
      );

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should find a shared link by id and workspace', async () => {
      const linkId = 'link-uuid';
      const workspaceId = 'workspace-uuid';
      const mockLink = {
        id: linkId,
        workspaceId,
        token: 'token',
      };

      mockSharedLinkRepository.findOne.mockResolvedValue(mockLink);

      const result = await service.findById(linkId, workspaceId);

      expect(result).toEqual(mockLink);
      expect(mockSharedLinkRepository.findOne).toHaveBeenCalledWith({
        where: { id: linkId, workspaceId },
      });
    });

    it('should throw NotFoundException if link does not exist', async () => {
      mockSharedLinkRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findById('invalid-id', 'workspace-uuid'),
      ).rejects.toThrow(SharedLinkNotFoundException);
    });
  });

  describe('revoke', () => {
    it('should revoke a shared link', async () => {
      const linkId = 'link-uuid';
      const workspaceId = 'workspace-uuid';
      const mockLink = {
        id: linkId,
        workspaceId,
        isActive: true,
      };

      mockSharedLinkRepository.findOne.mockResolvedValue(mockLink);
      mockSharedLinkRepository.update.mockResolvedValue({ affected: 1 });

      await service.revoke(linkId, workspaceId);

      expect(mockSharedLinkRepository.update).toHaveBeenCalledWith(
        { id: linkId, workspaceId },
        { isActive: false },
      );
    });

    it('should throw NotFoundException if link does not exist', async () => {
      mockSharedLinkRepository.findOne.mockResolvedValue(null);

      await expect(
        service.revoke('invalid-id', 'workspace-uuid'),
      ).rejects.toThrow(SharedLinkNotFoundException);
    });
  });

  describe('validatePassword', () => {
    it('should return true for correct password', async () => {
      const password = 'correct-password';
      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await service.validatePassword(password, hashedPassword);

      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const password = 'wrong-password';
      const hashedPassword = await bcrypt.hash('correct-password', 10);

      const result = await service.validatePassword(password, hashedPassword);

      expect(result).toBe(false);
    });

    it('should return true if no password hash exists', async () => {
      const result = await service.validatePassword('any-password', undefined);

      expect(result).toBe(true);
    });
  });

  describe('incrementViewCount', () => {
    it('should increment view count and update last viewed timestamp', async () => {
      const linkId = 'link-uuid';
      const mockQueryBuilder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockSharedLinkRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.incrementViewCount(linkId);

      expect(mockQueryBuilder.update).toHaveBeenCalledWith(SharedLink);
      expect(mockQueryBuilder.set).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('id = :id', { id: linkId });
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });
  });

  describe('generateToken', () => {
    it('should generate a URL-safe token of at least 32 characters', () => {
      const token = (service as any).generateToken();

      expect(token).toBeDefined();
      expect(token.length).toBeGreaterThanOrEqual(32);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // URL-safe base64url format
    });
  });

  describe('calculateExpirationDate', () => {
    it('should calculate 7 days expiration', () => {
      const expiration = (service as any).calculateExpirationDate(
        ExpirationOption.SEVEN_DAYS,
      );

      const expectedDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      expect(expiration.getTime()).toBeCloseTo(expectedDate.getTime(), -3);
    });

    it('should calculate 30 days expiration', () => {
      const expiration = (service as any).calculateExpirationDate(
        ExpirationOption.THIRTY_DAYS,
      );

      const expectedDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      expect(expiration.getTime()).toBeCloseTo(expectedDate.getTime(), -3);
    });

    it('should return null for never expiration', () => {
      const expiration = (service as any).calculateExpirationDate(
        ExpirationOption.NEVER,
      );

      expect(expiration).toBeNull();
    });
  });
});
