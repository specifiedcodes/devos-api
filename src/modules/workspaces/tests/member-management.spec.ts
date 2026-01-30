import { Test, TestingModule } from '@nestjs/testing';
import { WorkspacesService } from '../workspaces.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { Workspace } from '../../../database/entities/workspace.entity';
import { SecurityEvent, SecurityEventType } from '../../../database/entities/security-event.entity';
import { User } from '../../../database/entities/user.entity';
import { WorkspaceInvitation } from '../../../database/entities/workspace-invitation.entity';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { RedisService } from '../../redis/redis.service';
import { EmailService } from '../../email/email.service';

describe('Workspace Member Management', () => {
  let service: WorkspacesService;
  let memberRepository: any;
  let workspaceRepository: any;
  let securityEventRepository: any;

  const mockMemberRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockWorkspaceRepository = {
    findOne: jest.fn(),
  };

  const mockSecurityEventRepository = {
    save: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
  };

  const mockInvitationRepository = {
    findOne: jest.fn(),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockRedisService = {
    setex: jest.fn(),
    del: jest.fn(),
  };

  const mockEmailService = {
    sendEmail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: mockMemberRepository,
        },
        {
          provide: getRepositoryToken(Workspace),
          useValue: mockWorkspaceRepository,
        },
        {
          provide: getRepositoryToken(SecurityEvent),
          useValue: mockSecurityEventRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(WorkspaceInvitation),
          useValue: mockInvitationRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
      ],
    }).compile();

    service = module.get<WorkspacesService>(WorkspacesService);
    memberRepository = mockMemberRepository;
    workspaceRepository = mockWorkspaceRepository;
    securityEventRepository = mockSecurityEventRepository;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Task 3.1: GET /api/v1/workspaces/:id/members (list members)', () => {
    it('should return list of workspace members', async () => {
      const members = [
        {
          id: 'member-1',
          userId: 'user-1',
          workspaceId: 'workspace-1',
          role: WorkspaceRole.OWNER,
          user: { email: 'owner@example.com' },
          createdAt: new Date('2025-01-01'),
        },
        {
          id: 'member-2',
          userId: 'user-2',
          workspaceId: 'workspace-1',
          role: WorkspaceRole.DEVELOPER,
          user: { email: 'dev@example.com' },
          createdAt: new Date('2025-01-02'),
        },
      ];

      memberRepository.find.mockResolvedValue(members);

      const result = await service.getMembers('workspace-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'member-1',
        userId: 'user-1',
        email: 'owner@example.com',
        role: WorkspaceRole.OWNER,
      });
      expect(memberRepository.find).toHaveBeenCalledWith({
        where: { workspaceId: 'workspace-1' },
        relations: ['user'],
        order: { createdAt: 'ASC' },
      });
    });

    it('should handle members without user relation', async () => {
      const members = [
        {
          id: 'member-1',
          userId: 'user-1',
          workspaceId: 'workspace-1',
          role: WorkspaceRole.VIEWER,
          user: null,
          createdAt: new Date(),
        },
      ];

      memberRepository.find.mockResolvedValue(members);

      const result = await service.getMembers('workspace-1');

      expect(result[0].email).toBe('Unknown');
    });
  });

  describe('Task 3.2: PATCH /api/v1/workspaces/:id/members/:memberId/role (change role)', () => {
    it('should change member role from developer to admin', async () => {
      const member = {
        id: 'member-1',
        userId: 'user-2',
        workspaceId: 'workspace-1',
        role: WorkspaceRole.DEVELOPER,
        user: { email: 'dev@example.com' },
        createdAt: new Date(),
      };

      const workspace = {
        id: 'workspace-1',
        ownerUserId: 'user-1',
      };

      memberRepository.findOne.mockResolvedValue(member);
      workspaceRepository.findOne.mockResolvedValue(workspace);
      memberRepository.save.mockResolvedValue({ ...member, role: WorkspaceRole.ADMIN });

      const result = await service.changeMemberRole(
        'workspace-1',
        'member-1',
        WorkspaceRole.ADMIN,
        'user-1',
      );

      expect(result.role).toBe(WorkspaceRole.ADMIN);
      expect(memberRepository.save).toHaveBeenCalled();
      expect(securityEventRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: SecurityEventType.ROLE_CHANGED,
          metadata: expect.objectContaining({
            oldRole: WorkspaceRole.DEVELOPER,
            newRole: WorkspaceRole.ADMIN,
          }),
        }),
      );
    });

    it('should throw NotFoundException if member not found', async () => {
      memberRepository.findOne.mockResolvedValue(null);

      await expect(
        service.changeMemberRole('workspace-1', 'member-1', WorkspaceRole.ADMIN, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Task 3.4: Validate owner cannot be removed', () => {
    it('should prevent removing workspace owner', async () => {
      const ownerMember = {
        id: 'member-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        role: WorkspaceRole.OWNER,
        user: { email: 'owner@example.com' },
      };

      const workspace = {
        id: 'workspace-1',
        ownerUserId: 'user-1',
      };

      memberRepository.findOne.mockResolvedValue(ownerMember);
      workspaceRepository.findOne.mockResolvedValue(workspace);

      await expect(
        service.removeMember('workspace-1', 'member-1', 'user-2'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Task 3.5: Validate owner role cannot be changed by non-owners', () => {
    it('should prevent non-owner from changing owner role', async () => {
      const ownerMember = {
        id: 'member-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        role: WorkspaceRole.OWNER,
        user: { email: 'owner@example.com' },
      };

      const adminMember = {
        id: 'member-2',
        userId: 'user-2',
        workspaceId: 'workspace-1',
        role: WorkspaceRole.ADMIN,
      };

      const workspace = {
        id: 'workspace-1',
        ownerUserId: 'user-1',
      };

      memberRepository.findOne
        .mockResolvedValueOnce(ownerMember) // First call for target member
        .mockResolvedValueOnce(adminMember); // Second call for requesting member
      workspaceRepository.findOne.mockResolvedValue(workspace);

      await expect(
        service.changeMemberRole('workspace-1', 'member-1', WorkspaceRole.ADMIN, 'user-2'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow owner to change their own role', async () => {
      const ownerMember = {
        id: 'member-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        role: WorkspaceRole.OWNER,
        user: { email: 'owner@example.com' },
        createdAt: new Date(),
      };

      const workspace = {
        id: 'workspace-1',
        ownerUserId: 'user-1',
      };

      memberRepository.findOne
        .mockResolvedValueOnce(ownerMember) // Target member
        .mockResolvedValueOnce(ownerMember); // Requesting member (same as target)
      workspaceRepository.findOne.mockResolvedValue(workspace);
      memberRepository.save.mockResolvedValue({ ...ownerMember, role: WorkspaceRole.ADMIN });

      const result = await service.changeMemberRole(
        'workspace-1',
        'member-1',
        WorkspaceRole.ADMIN,
        'user-1',
      );

      expect(result.role).toBe(WorkspaceRole.ADMIN);
    });
  });

  describe('Task 3.3: DELETE /api/v1/workspaces/:id/members/:memberId (remove member)', () => {
    it('should successfully remove a member', async () => {
      const member = {
        id: 'member-2',
        userId: 'user-2',
        workspaceId: 'workspace-1',
        role: WorkspaceRole.DEVELOPER,
        user: { email: 'dev@example.com' },
      };

      const workspace = {
        id: 'workspace-1',
        ownerUserId: 'user-1',
      };

      memberRepository.findOne.mockResolvedValue(member);
      workspaceRepository.findOne.mockResolvedValue(workspace);
      memberRepository.remove.mockResolvedValue(member);

      const result = await service.removeMember('workspace-1', 'member-2', 'user-1');

      expect(result.message).toBe('Member removed successfully');
      expect(memberRepository.remove).toHaveBeenCalledWith(member);
      expect(securityEventRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: SecurityEventType.MEMBER_REMOVED,
        }),
      );
    });
  });

  describe('Task 3.6: Log all member role changes to security_events', () => {
    it('should log role change event', async () => {
      const member = {
        id: 'member-1',
        userId: 'user-2',
        workspaceId: 'workspace-1',
        role: WorkspaceRole.DEVELOPER,
        user: { email: 'dev@example.com' },
        createdAt: new Date(),
      };

      const workspace = {
        id: 'workspace-1',
        ownerUserId: 'user-1',
      };

      memberRepository.findOne.mockResolvedValue(member);
      workspaceRepository.findOne.mockResolvedValue(workspace);
      memberRepository.save.mockResolvedValue({ ...member, role: WorkspaceRole.ADMIN });

      await service.changeMemberRole('workspace-1', 'member-1', WorkspaceRole.ADMIN, 'user-1');

      expect(securityEventRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          event_type: SecurityEventType.ROLE_CHANGED,
          metadata: expect.objectContaining({
            workspaceId: 'workspace-1',
            targetUserId: 'user-2',
            oldRole: WorkspaceRole.DEVELOPER,
            newRole: WorkspaceRole.ADMIN,
          }),
        }),
      );
    });
  });

  describe('Task 3.7: Log all member removals to security_events', () => {
    it('should log member removal event', async () => {
      const member = {
        id: 'member-2',
        userId: 'user-2',
        workspaceId: 'workspace-1',
        role: WorkspaceRole.VIEWER,
        user: { email: 'viewer@example.com' },
      };

      const workspace = {
        id: 'workspace-1',
        ownerUserId: 'user-1',
      };

      memberRepository.findOne.mockResolvedValue(member);
      workspaceRepository.findOne.mockResolvedValue(workspace);

      await service.removeMember('workspace-1', 'member-2', 'user-1');

      expect(securityEventRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          event_type: SecurityEventType.MEMBER_REMOVED,
          metadata: expect.objectContaining({
            workspaceId: 'workspace-1',
            removedUserId: 'user-2',
            removedUserEmail: 'viewer@example.com',
            removedUserRole: WorkspaceRole.VIEWER,
          }),
        }),
      );
    });
  });
});
