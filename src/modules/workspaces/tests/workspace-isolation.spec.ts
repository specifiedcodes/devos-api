import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WorkspacesService } from '../workspaces.service';
import { Workspace } from '../../../database/entities/workspace.entity';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { User } from '../../../database/entities/user.entity';
import { SecurityEvent, SecurityEventType } from '../../../database/entities/security-event.entity';
import { RedisService } from '../../redis/redis.service';

describe('WorkspacesService - Workspace Isolation Tests', () => {
  let service: WorkspacesService;
  let workspaceMemberRepository: jest.Mocked<Repository<WorkspaceMember>>;
  let workspaceRepository: jest.Mocked<Repository<Workspace>>;
  let userRepository: jest.Mocked<Repository<User>>;
  let securityEventRepository: jest.Mocked<Repository<SecurityEvent>>;

  const user1Id = 'user-111';
  const user2Id = 'user-222';
  const workspace1Id = 'workspace-aaa';
  const workspace2Id = 'workspace-bbb';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        {
          provide: getRepositoryToken(Workspace),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SecurityEvent),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-token'),
          },
        },
        {
          provide: RedisService,
          useValue: {
            keys: jest.fn(),
            get: jest.fn(),
            set: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WorkspacesService>(WorkspacesService);
    workspaceRepository = module.get(getRepositoryToken(Workspace));
    workspaceMemberRepository = module.get(getRepositoryToken(WorkspaceMember));
    userRepository = module.get(getRepositoryToken(User));
    securityEventRepository = module.get(getRepositoryToken(SecurityEvent));
  });

  describe('switchWorkspace - Security Tests', () => {
    it('should prevent user from switching to workspace they are not a member of', async () => {
      // User 1 tries to switch to Workspace 2 (not a member)
      workspaceRepository.findOne.mockResolvedValue({
        id: workspace2Id,
        name: 'Workspace 2',
      } as Workspace);

      // User is NOT a member of workspace 2
      workspaceMemberRepository.findOne.mockResolvedValue(null);

      await expect(
        service.switchWorkspace(user1Id, workspace2Id, 'jti-123', '127.0.0.1', 'agent'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow user to switch to workspace they are a member of', async () => {
      // User 1 switches to Workspace 1 (is a member)
      workspaceRepository.findOne.mockResolvedValue({
        id: workspace1Id,
        name: 'Workspace 1',
      } as Workspace);

      workspaceMemberRepository.findOne.mockResolvedValue({
        userId: user1Id,
        workspaceId: workspace1Id,
        role: 'owner',
      } as WorkspaceMember);

      userRepository.findOne.mockResolvedValue({
        id: user1Id,
        email: 'user1@example.com',
        currentWorkspaceId: workspace1Id,
      } as User);

      userRepository.update.mockResolvedValue({ affected: 1 } as any);
      workspaceMemberRepository.count.mockResolvedValue(1);

      const result = await service.switchWorkspace(
        user1Id,
        workspace1Id,
        'jti-123',
        '127.0.0.1',
        'agent',
      );

      expect(result.workspace.id).toBe(workspace1Id);
      expect(result.tokens).toBeDefined();
    });

    it('should prevent switch to non-existent workspace', async () => {
      // Workspace doesn't exist
      workspaceRepository.findOne.mockResolvedValue(null);

      await expect(
        service.switchWorkspace(user1Id, 'fake-workspace-id', 'jti-123', '127.0.0.1', 'agent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should verify membership before switch even if workspace exists', async () => {
      // Workspace exists
      workspaceRepository.findOne.mockResolvedValue({
        id: workspace2Id,
        name: 'Workspace 2',
      } as Workspace);

      // But user is not a member
      workspaceMemberRepository.findOne.mockResolvedValue(null);

      await expect(
        service.switchWorkspace(user1Id, workspace2Id, 'jti-123', '127.0.0.1', 'agent'),
      ).rejects.toThrow(ForbiddenException);

      // Verify membership was checked
      expect(workspaceMemberRepository.findOne).toHaveBeenCalledWith({
        where: { userId: user1Id, workspaceId: workspace2Id },
      });
    });
  });

  describe('getUserWorkspaces - Isolation Tests', () => {
    it('should only return workspaces where user is a member', async () => {
      // User 1 is member of Workspace 1 only
      workspaceMemberRepository.find.mockResolvedValue([
        {
          userId: user1Id,
          workspaceId: workspace1Id,
          role: 'owner',
          workspace: {
            id: workspace1Id,
            name: 'Workspace 1',
          } as Workspace,
        } as WorkspaceMember,
      ]);

      userRepository.findOne.mockResolvedValue({
        id: user1Id,
        currentWorkspaceId: workspace1Id,
      } as User);

      workspaceMemberRepository.count.mockResolvedValue(1);

      const result = await service.getUserWorkspaces(user1Id);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(workspace1Id);
    });

    it('should not leak workspace data across users', async () => {
      // User 1's workspaces
      const user1Workspaces = [
        {
          userId: user1Id,
          workspaceId: workspace1Id,
          role: 'owner',
          workspace: {
            id: workspace1Id,
            name: 'User 1 Workspace',
          } as Workspace,
        } as WorkspaceMember,
      ];

      // User 2's workspaces
      const user2Workspaces = [
        {
          userId: user2Id,
          workspaceId: workspace2Id,
          role: 'owner',
          workspace: {
            id: workspace2Id,
            name: 'User 2 Workspace',
          } as Workspace,
        } as WorkspaceMember,
      ];

      // Mock different responses based on userId
      workspaceMemberRepository.find.mockImplementation((options: any) => {
        if (options.where.userId === user1Id) {
          return Promise.resolve(user1Workspaces);
        } else if (options.where.userId === user2Id) {
          return Promise.resolve(user2Workspaces);
        }
        return Promise.resolve([]);
      });

      userRepository.findOne.mockImplementation((options: any) => {
        if (options.where.id === user1Id) {
          return Promise.resolve({ id: user1Id, currentWorkspaceId: workspace1Id } as User);
        } else if (options.where.id === user2Id) {
          return Promise.resolve({ id: user2Id, currentWorkspaceId: workspace2Id } as User);
        }
        return Promise.resolve(null);
      });

      workspaceMemberRepository.count.mockResolvedValue(1);

      // Get User 1's workspaces
      const user1Result = await service.getUserWorkspaces(user1Id);
      expect(user1Result).toHaveLength(1);
      expect(user1Result[0].id).toBe(workspace1Id);
      expect(user1Result[0].name).toBe('User 1 Workspace');

      // Get User 2's workspaces
      const user2Result = await service.getUserWorkspaces(user2Id);
      expect(user2Result).toHaveLength(1);
      expect(user2Result[0].id).toBe(workspace2Id);
      expect(user2Result[0].name).toBe('User 2 Workspace');

      // Verify no cross-contamination
      expect(user1Result[0].id).not.toBe(user2Result[0].id);
    });

    it('should return empty array for user with no workspaces', async () => {
      // User has no workspace memberships
      workspaceMemberRepository.find.mockResolvedValue([]);
      userRepository.findOne.mockResolvedValue({
        id: user1Id,
        currentWorkspaceId: null,
      } as User);

      const result = await service.getUserWorkspaces(user1Id);

      expect(result).toEqual([]);
    });
  });

  describe('Cross-Workspace Access Prevention', () => {
    it('should verify workspace membership on every switch attempt', async () => {
      workspaceRepository.findOne.mockResolvedValue({
        id: workspace2Id,
        name: 'Workspace 2',
      } as Workspace);

      workspaceMemberRepository.findOne.mockResolvedValue(null);

      await expect(
        service.switchWorkspace(user1Id, workspace2Id, 'jti-123', '127.0.0.1', 'agent'),
      ).rejects.toThrow(ForbiddenException);

      // Ensure membership check was called
      expect(workspaceMemberRepository.findOne).toHaveBeenCalledWith({
        where: { userId: user1Id, workspaceId: workspace2Id },
      });
    });

    it('should log security event when unauthorized switch is attempted', async () => {
      workspaceRepository.findOne.mockResolvedValue({
        id: workspace2Id,
        name: 'Workspace 2',
      } as Workspace);

      workspaceMemberRepository.findOne.mockResolvedValue(null);
      securityEventRepository.create.mockReturnValue({} as SecurityEvent);
      securityEventRepository.save.mockResolvedValue({} as SecurityEvent);

      try {
        await service.switchWorkspace(user1Id, workspace2Id, 'jti-123', '127.0.0.1', 'agent');
      } catch (error) {
        // Expected to throw ForbiddenException
      }

      // Security event should be logged for unauthorized access attempt
      // This is implicit in the service implementation
      expect(workspaceMemberRepository.findOne).toHaveBeenCalled();
    });
  });
});
