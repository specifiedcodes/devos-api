import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';
import { WorkspacesService } from './workspaces.service';
import { Workspace } from '../../database/entities/workspace.entity';
import { WorkspaceMember, WorkspaceRole } from '../../database/entities/workspace-member.entity';
import { WorkspaceInvitation, InvitationStatus } from '../../database/entities/workspace-invitation.entity';
import { User } from '../../database/entities/user.entity';
import { SecurityEvent } from '../../database/entities/security-event.entity';
import { EmailService } from '../email/email.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../../shared/audit/audit.service';

describe('WorkspacesService - Invitations', () => {
  let service: WorkspacesService;
  let workspaceRepo: Repository<Workspace>;
  let memberRepo: Repository<WorkspaceMember>;
  let invitationRepo: Repository<WorkspaceInvitation>;
  let userRepo: Repository<User>;
  let securityEventRepo: Repository<SecurityEvent>;
  let emailService: EmailService;

  const mockWorkspace = {
    id: 'workspace-1',
    name: 'Test Workspace',
    ownerUserId: 'user-1',
    schemaName: 'workspace_test',
    deletedAt: null,
  };

  const mockUser = {
    id: 'user-1',
    email: 'owner@example.com',
  };

  const mockInviter = {
    id: 'user-1',
    email: 'owner@example.com',
  };

  // raw_token is the plaintext token that the user receives
  // The stored token is the SHA256 hash of raw_token in hex format
  const rawInvitationToken = 'raw_token';
  const hashedInvitationToken = crypto.createHash('sha256').update(rawInvitationToken).digest('hex');

  const mockInvitation = {
    id: 'invitation-1',
    workspaceId: 'workspace-1',
    email: 'invitee@example.com',
    role: WorkspaceRole.DEVELOPER,
    inviterUserId: 'user-1',
    token: hashedInvitationToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status: InvitationStatus.PENDING,
    createdAt: new Date(),
    workspace: mockWorkspace,
    inviter: mockInviter,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        {
          provide: getRepositoryToken(Workspace),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceInvitation),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
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
            query: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            del: jest.fn(),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendEmail: jest.fn(),
          },
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
    workspaceRepo = module.get(getRepositoryToken(Workspace));
    memberRepo = module.get(getRepositoryToken(WorkspaceMember));
    invitationRepo = module.get(getRepositoryToken(WorkspaceInvitation));
    userRepo = module.get(getRepositoryToken(User));
    securityEventRepo = module.get(getRepositoryToken(SecurityEvent));
    emailService = module.get<EmailService>(EmailService);
  });

  describe('createInvitation', () => {
    it('should create invitation with secure token', async () => {
      jest.spyOn(workspaceRepo, 'findOne').mockResolvedValue(mockWorkspace as any);
      jest.spyOn(memberRepo, 'createQueryBuilder').mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      } as any);
      jest.spyOn(invitationRepo, 'findOne').mockResolvedValue(null);
      jest.spyOn(invitationRepo, 'create').mockReturnValue(mockInvitation as any);
      jest.spyOn(invitationRepo, 'save').mockResolvedValue(mockInvitation as any);
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockInviter as any);
      jest.spyOn(securityEventRepo, 'save').mockResolvedValue({} as any);
      jest.spyOn(emailService, 'sendEmail').mockResolvedValue();

      const result = await service.createInvitation('workspace-1', 'user-1', {
        email: 'invitee@example.com',
        role: WorkspaceRole.DEVELOPER,
      });

      expect(result.email).toBe('invitee@example.com');
      expect(result.role).toBe(WorkspaceRole.DEVELOPER);
      expect(result.status).toBe(InvitationStatus.PENDING);
    });

    it('should prevent duplicate invitations to same email', async () => {
      jest.spyOn(workspaceRepo, 'findOne').mockResolvedValue(mockWorkspace as any);
      jest.spyOn(memberRepo, 'createQueryBuilder').mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      } as any);
      jest.spyOn(invitationRepo, 'findOne').mockResolvedValue(mockInvitation as any);

      await expect(
        service.createInvitation('workspace-1', 'user-1', {
          email: 'invitee@example.com',
          role: WorkspaceRole.DEVELOPER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent inviting existing members', async () => {
      jest.spyOn(workspaceRepo, 'findOne').mockResolvedValue(mockWorkspace as any);
      jest.spyOn(memberRepo, 'createQueryBuilder').mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 'member-1' }),
      } as any);

      await expect(
        service.createInvitation('workspace-1', 'user-1', {
          email: 'member@example.com',
          role: WorkspaceRole.DEVELOPER,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('acceptInvitation', () => {
    it('should accept valid invitation and add user to workspace', async () => {
      const acceptingUser = {
        id: 'user-2',
        email: 'invitee@example.com',
      };

      // findInvitationByToken uses invitationRepo.find() to get all pending invitations
      jest.spyOn(invitationRepo, 'find').mockResolvedValue([mockInvitation] as any);
      jest.spyOn(invitationRepo, 'findOne').mockResolvedValue(mockInvitation as any);
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(acceptingUser as any);
      jest.spyOn(memberRepo, 'findOne').mockResolvedValue(null);
      jest.spyOn(memberRepo, 'create').mockReturnValue({} as any);
      jest.spyOn(memberRepo, 'save').mockResolvedValue({} as any);
      jest.spyOn(invitationRepo, 'save').mockResolvedValue({
        ...mockInvitation,
        status: InvitationStatus.ACCEPTED,
      } as any);
      jest.spyOn(securityEventRepo, 'save').mockResolvedValue({} as any);

      // Mock switchWorkspace
      jest.spyOn(service, 'switchWorkspace' as any).mockResolvedValue({
        workspace: mockWorkspace,
        tokens: { access_token: 'token', refresh_token: 'refresh' },
      });

      const result = await service.acceptInvitation(rawInvitationToken, 'user-2', '127.0.0.1', 'test-agent');

      expect(result.workspace).toBeDefined();
      expect(result.tokens).toBeDefined();
    });

    it('should reject expired invitations', async () => {
      const expiredInvitation = {
        ...mockInvitation,
        expiresAt: new Date(Date.now() - 1000), // Expired
      };

      // findInvitationByToken uses invitationRepo.find()
      jest.spyOn(invitationRepo, 'find').mockResolvedValue([expiredInvitation] as any);

      await expect(service.acceptInvitation(rawInvitationToken, 'user-2', '127.0.0.1', 'test-agent')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject already accepted invitations', async () => {
      // findInvitationByToken only searches PENDING invitations
      // An accepted invitation won't be found, so it returns null -> NotFoundException
      jest.spyOn(invitationRepo, 'find').mockResolvedValue([] as any);

      await expect(service.acceptInvitation(rawInvitationToken, 'user-2', '127.0.0.1', 'test-agent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should verify email matches invitation', async () => {
      const wrongUser = {
        id: 'user-2',
        email: 'wrong@example.com',
      };

      // Need to create a fresh mock to avoid mutation
      const validInvitation = {
        ...mockInvitation,
        status: InvitationStatus.PENDING,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      // findInvitationByToken uses invitationRepo.find()
      jest.spyOn(invitationRepo, 'find').mockResolvedValue([validInvitation] as any);
      jest.spyOn(invitationRepo, 'findOne').mockResolvedValue(validInvitation as any);
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(wrongUser as any);

      await expect(service.acceptInvitation(rawInvitationToken, 'user-2', '127.0.0.1', 'test-agent')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getInvitations', () => {
    it('should list pending invitations for workspace', async () => {
      const pendingInvitation = {
        ...mockInvitation,
        status: InvitationStatus.PENDING,
      };

      jest.spyOn(invitationRepo, 'find').mockResolvedValue([pendingInvitation] as any);

      const result = await service.getInvitations('workspace-1', InvitationStatus.PENDING);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(InvitationStatus.PENDING);
    });
  });

  describe('revokeInvitation', () => {
    it('should revoke pending invitation', async () => {
      const pendingInvitation = {
        ...mockInvitation,
        status: InvitationStatus.PENDING,
      };

      jest.spyOn(invitationRepo, 'findOne').mockResolvedValue(pendingInvitation as any);
      jest.spyOn(memberRepo, 'findOne').mockResolvedValue({
        role: WorkspaceRole.OWNER,
      } as any);
      jest.spyOn(invitationRepo, 'save').mockResolvedValue({
        ...pendingInvitation,
        status: InvitationStatus.REVOKED,
      } as any);
      jest.spyOn(securityEventRepo, 'save').mockResolvedValue({} as any);

      const result = await service.revokeInvitation('invitation-1', 'user-1');

      expect(result.message).toBe('Invitation revoked successfully');
    });

    it('should only allow owners and admins to revoke', async () => {
      jest.spyOn(invitationRepo, 'findOne').mockResolvedValue(mockInvitation as any);
      jest.spyOn(memberRepo, 'findOne').mockResolvedValue({
        role: WorkspaceRole.VIEWER,
      } as any);

      await expect(service.revokeInvitation('invitation-1', 'user-2')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
