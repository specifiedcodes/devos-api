import { Test, TestingModule } from '@nestjs/testing';
import { WorkspacesService } from '../workspaces.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { Workspace } from '../../../database/entities/workspace.entity';
import { SecurityEvent, SecurityEventType } from '../../../database/entities/security-event.entity';
import { User } from '../../../database/entities/user.entity';
import { WorkspaceInvitation } from '../../../database/entities/workspace-invitation.entity';
import { ForbiddenException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { RedisService } from '../../redis/redis.service';
import { EmailService } from '../../email/email.service';
import { AuditService } from '../../../shared/audit/audit.service';

describe('Workspace Ownership Transfer', () => {
  let service: WorkspacesService;
  let memberRepository: any;
  let workspaceRepository: any;
  let userRepository: any;
  let securityEventRepository: any;
  let emailService: any;

  const mockMemberRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockWorkspaceRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
  };

  const mockSecurityEventRepository = {
    save: jest.fn(),
    create: jest.fn((entity) => entity),
  };

  const mockEmailService = {
    sendEmail: jest.fn().mockResolvedValue(undefined),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      save: jest.fn(),
    },
  };

  const mockInvitationRepository = {};
  const mockDataSource = {
    createQueryRunner: jest.fn(() => mockQueryRunner),
  };
  const mockJwtService = {};
  const mockRedisService = {};

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
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(SecurityEvent),
          useValue: mockSecurityEventRepository,
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
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<WorkspacesService>(WorkspacesService);
    memberRepository = mockMemberRepository;
    workspaceRepository = mockWorkspaceRepository;
    userRepository = mockUserRepository;
    securityEventRepository = mockSecurityEventRepository;
    emailService = mockEmailService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Task 5.1-5.2: POST /api/v1/workspaces/:id/transfer-ownership', () => {
    it('should require current owner authentication', async () => {
      workspaceRepository.findOne.mockResolvedValue(null);

      await expect(
        service.transferOwnership('workspace-1', 'user-2', 'user-3'),
      ).rejects.toThrow(ForbiddenException);

      expect(workspaceRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'workspace-1', ownerUserId: 'user-2' },
      });
    });
  });

  describe('Task 5.3: Validate target user is workspace member', () => {
    it('should reject transfer if new owner is not a member', async () => {
      const workspace = {
        id: 'workspace-1',
        ownerUserId: 'user-1',
        name: 'Test Workspace',
      };

      workspaceRepository.findOne.mockResolvedValue(workspace);
      memberRepository.findOne.mockResolvedValue(null);

      await expect(
        service.transferOwnership('workspace-1', 'user-1', 'user-3'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Task 5.4-5.6: Update workspace ownership and roles', () => {
    it('should successfully transfer ownership', async () => {
      const workspace = {
        id: 'workspace-1',
        ownerUserId: 'user-1',
        name: 'Test Workspace',
      };

      const newOwnerMember = {
        id: 'member-2',
        userId: 'user-2',
        workspaceId: 'workspace-1',
        role: WorkspaceRole.ADMIN,
        user: { email: 'newowner@example.com' },
      };

      const currentOwnerMember = {
        id: 'member-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        role: WorkspaceRole.OWNER,
      };

      workspaceRepository.findOne.mockResolvedValue(workspace);
      memberRepository.findOne
        .mockResolvedValueOnce(newOwnerMember) // New owner member
        .mockResolvedValueOnce(currentOwnerMember); // Current owner member
      workspaceRepository.save.mockResolvedValue(workspace);
      memberRepository.save.mockResolvedValue({});

      const result = await service.transferOwnership('workspace-1', 'user-1', 'user-2');

      expect(result.message).toBe('Ownership transferred successfully');
      // All saves now go through queryRunner.manager.save (transaction)
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ ownerUserId: 'user-2' }),
      );
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: WorkspaceRole.OWNER }),
      );
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: WorkspaceRole.ADMIN }),
      );
      // Verify transaction was committed
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should prevent transferring ownership to yourself', async () => {
      const workspace = {
        id: 'workspace-1',
        ownerUserId: 'user-1',
        name: 'Test Workspace',
      };

      workspaceRepository.findOne.mockResolvedValue(workspace);

      await expect(
        service.transferOwnership('workspace-1', 'user-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Task 5.7: Log OWNERSHIP_TRANSFERRED security event', () => {
    it('should log ownership transfer event', async () => {
      const workspace = {
        id: 'workspace-1',
        ownerUserId: 'user-1',
        name: 'Test Workspace',
      };

      const newOwnerMember = {
        id: 'member-2',
        userId: 'user-2',
        workspaceId: 'workspace-1',
        role: WorkspaceRole.ADMIN,
        user: { email: 'newowner@example.com' },
      };

      const currentOwnerMember = {
        id: 'member-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        role: WorkspaceRole.OWNER,
      };

      workspaceRepository.findOne.mockResolvedValue(workspace);
      memberRepository.findOne
        .mockResolvedValueOnce(newOwnerMember)
        .mockResolvedValueOnce(currentOwnerMember);

      await service.transferOwnership('workspace-1', 'user-1', 'user-2');

      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          event_type: SecurityEventType.OWNERSHIP_TRANSFERRED,
          metadata: expect.objectContaining({
            workspaceId: 'workspace-1',
            fromUserId: 'user-1',
            toUserId: 'user-2',
            toUserEmail: 'newowner@example.com',
          }),
        }),
      );
    });
  });

  describe('Task 5.8: Send email notifications', () => {
    it('should send emails to both parties', async () => {
      const workspace = {
        id: 'workspace-1',
        ownerUserId: 'user-1',
        name: 'Test Workspace',
      };

      const newOwnerMember = {
        id: 'member-2',
        userId: 'user-2',
        workspaceId: 'workspace-1',
        role: WorkspaceRole.ADMIN,
        user: { email: 'newowner@example.com' },
      };

      const currentOwnerMember = {
        id: 'member-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        role: WorkspaceRole.OWNER,
      };

      const currentOwnerUser = {
        id: 'user-1',
        email: 'oldowner@example.com',
      };

      workspaceRepository.findOne.mockResolvedValue(workspace);
      memberRepository.findOne
        .mockResolvedValueOnce(newOwnerMember)
        .mockResolvedValueOnce(currentOwnerMember);
      userRepository.findOne.mockResolvedValue(currentOwnerUser);

      await service.transferOwnership('workspace-1', 'user-1', 'user-2');

      // Wait a bit for async email sending
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Emails should be sent (fire and forget)
      expect(emailService.sendEmail).toHaveBeenCalledTimes(2);
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'newowner@example.com',
          subject: expect.stringContaining('owner'),
        }),
      );
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'oldowner@example.com',
          subject: expect.stringContaining('transferred'),
        }),
      );
    });
  });
});
