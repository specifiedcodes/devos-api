import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, QueryRunner, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { WorkspacesService } from './workspaces.service';
import { Workspace } from '../../database/entities/workspace.entity';
import { WorkspaceMember, WorkspaceRole } from '../../database/entities/workspace-member.entity';
import { User } from '../../database/entities/user.entity';
import { SecurityEvent } from '../../database/entities/security-event.entity';
import { WorkspaceInvitation } from '../../database/entities/workspace-invitation.entity';
import { RedisService } from '../redis/redis.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../../shared/audit/audit.service';

describe('WorkspacesService', () => {
  let service: WorkspacesService;
  let workspaceRepository: jest.Mocked<Repository<Workspace>>;
  let workspaceMemberRepository: jest.Mocked<Repository<WorkspaceMember>>;
  let mockQueryRunner: jest.Mocked<QueryRunner>;

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'testuser@example.com',
    passwordHash: 'hashedpassword',
    twoFactorEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    twoFactorSecret: null,
    workspaceMembers: [],
    lastLoginAt: null,
    deletedAt: null,
    currentWorkspaceId: null,
    currentWorkspace: null,
    backupCodes: [],
  };

  beforeEach(async () => {
    // Create mock query runner
    const mockSave = jest.fn();
    const mockQuery = jest.fn().mockImplementation((sql: string) => {
      // Mock responses based on query type
      if (sql.includes('information_schema.schemata')) {
        return Promise.resolve([]); // Schema doesn't exist
      } else if (sql.includes('information_schema.tables')) {
        // Table verification query
        return Promise.resolve([
          { table_name: 'projects' },
          { table_name: 'integrations' },
          { table_name: 'byok_secrets' },
        ]);
      }
      return Promise.resolve(undefined); // CREATE queries
    });

    mockQueryRunner = {
      manager: {
        save: mockSave,
      },
      query: mockQuery,
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      connection: {
        driver: {
          escape: jest.fn((name) => `"${name}"`), // Mock escape function
        },
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        {
          provide: getRepositoryToken(Workspace),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
            save: jest.fn(),
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
            createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            keys: jest.fn(),
            del: jest.fn(),
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
    workspaceRepository = module.get(getRepositoryToken(Workspace));
    workspaceMemberRepository = module.get(getRepositoryToken(WorkspaceMember));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createDefaultWorkspace', () => {
    it('should create workspace with correct name format', async () => {
      const mockWorkspace = {
        id: 'workspace-uuid',
        name: "Testuser's Workspace",
        ownerUserId: mockUser.id,
        schemaName: 'workspace_workspaceuuid',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockMember = {
        id: 'member-uuid',
        workspaceId: mockWorkspace.id,
        userId: mockUser.id,
        role: WorkspaceRole.OWNER,
        createdAt: new Date(),
      };

      workspaceRepository.create.mockReturnValue(mockWorkspace as any);
      workspaceMemberRepository.create.mockReturnValue(mockMember as any);
      (mockQueryRunner.manager.save as jest.Mock)
        .mockResolvedValueOnce(mockWorkspace)
        .mockResolvedValueOnce(mockMember);

      const result = await service.createDefaultWorkspace(mockUser, mockQueryRunner);

      expect(result).toBeDefined();
      expect(workspaceRepository.create).toHaveBeenCalled();
      expect(mockQueryRunner.manager.save).toHaveBeenCalledTimes(2);
    });

    it('should generate correct workspace name from email', async () => {
      const mockWorkspace = {
        id: 'workspace-uuid',
        name: "Testuser's Workspace",
        ownerUserId: mockUser.id,
        schemaName: 'workspace_abc',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      workspaceRepository.create.mockReturnValue(mockWorkspace as any);
      workspaceMemberRepository.create.mockReturnValue({} as any);
      (mockQueryRunner.manager.save as jest.Mock).mockResolvedValue(mockWorkspace);

      await service.createDefaultWorkspace(mockUser, mockQueryRunner);

      const createCall = workspaceRepository.create.mock.calls[0][0];
      expect(createCall.name).toBe("Testuser's Workspace");
    });

    it('should add user as workspace owner', async () => {
      const mockWorkspace = {
        id: 'workspace-uuid',
        name: "Testuser's Workspace",
        ownerUserId: mockUser.id,
        schemaName: 'workspace_abc',
      };

      const mockMember = {
        workspaceId: mockWorkspace.id,
        userId: mockUser.id,
        role: WorkspaceRole.OWNER,
      };

      workspaceRepository.create.mockReturnValue(mockWorkspace as any);
      workspaceMemberRepository.create.mockReturnValue(mockMember as any);
      (mockQueryRunner.manager.save as jest.Mock).mockResolvedValue(mockWorkspace);

      await service.createDefaultWorkspace(mockUser, mockQueryRunner);

      expect(workspaceMemberRepository.create).toHaveBeenCalledWith({
        workspaceId: mockWorkspace.id,
        userId: mockUser.id,
        role: WorkspaceRole.OWNER,
      });
    });

    it('should create PostgreSQL schema', async () => {
      const mockWorkspace = {
        id: 'abc123',
        schemaName: 'workspace_abc123',
        ownerUserId: mockUser.id,
      };

      workspaceRepository.create.mockReturnValue(mockWorkspace as any);
      workspaceMemberRepository.create.mockReturnValue({} as any);
      (mockQueryRunner.manager.save as jest.Mock).mockResolvedValue(mockWorkspace);

      await service.createDefaultWorkspace(mockUser, mockQueryRunner);

      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE SCHEMA IF NOT EXISTS'),
      );
    });

    it('should create base tables in workspace schema', async () => {
      const mockWorkspace = {
        id: 'workspace-uuid',
        schemaName: 'workspace_abc123def456',
        ownerUserId: mockUser.id,
      };

      workspaceRepository.create.mockReturnValue(mockWorkspace as any);
      workspaceMemberRepository.create.mockReturnValue({} as any);
      (mockQueryRunner.manager.save as jest.Mock).mockResolvedValue(mockWorkspace);

      await service.createDefaultWorkspace(mockUser, mockQueryRunner);

      // Verify projects table creation
      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE'),
      );
      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        expect.stringContaining('projects'),
      );
      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        expect.stringContaining('integrations'),
      );
      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        expect.stringContaining('byok_secrets'),
      );
    });

    it('should handle workspace creation errors', async () => {
      workspaceRepository.create.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(
        service.createDefaultWorkspace(mockUser, mockQueryRunner),
      ).rejects.toThrow('Failed to create default workspace');
    });

    it('should handle concurrent workspace creation', async () => {
      const mockWorkspace1 = {
        id: 'workspace-1',
        schemaName: 'workspace_1',
        ownerUserId: mockUser.id,
      };
      const mockWorkspace2 = {
        id: 'workspace-2',
        schemaName: 'workspace_2',
        ownerUserId: mockUser.id,
      };

      workspaceRepository.create
        .mockReturnValueOnce(mockWorkspace1 as any)
        .mockReturnValueOnce(mockWorkspace2 as any);
      workspaceMemberRepository.create.mockReturnValue({} as any);
      (mockQueryRunner.manager.save as jest.Mock)
        .mockResolvedValueOnce(mockWorkspace1)
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce(mockWorkspace2)
        .mockResolvedValueOnce({});

      const results = await Promise.all([
        service.createDefaultWorkspace(mockUser, mockQueryRunner),
        service.createDefaultWorkspace(mockUser, mockQueryRunner),
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].id).not.toBe(results[1].id);
    });
  });

  describe('workspace name generation', () => {
    it('should capitalize email prefix', async () => {
      const userWithLowercase = { ...mockUser, email: 'john@example.com' };
      const mockWorkspace = { id: 'test', schemaName: 'workspace_test' };

      workspaceRepository.create.mockReturnValue(mockWorkspace as any);
      workspaceMemberRepository.create.mockReturnValue({} as any);
      (mockQueryRunner.manager.save as jest.Mock).mockResolvedValue(mockWorkspace);

      await service.createDefaultWorkspace(userWithLowercase as any, mockQueryRunner);

      const createCall = workspaceRepository.create.mock.calls[0][0];
      expect(createCall.name).toBe("John's Workspace");
    });

    it('should handle emails with dots and numbers (title case)', async () => {
      const userWithDots = { ...mockUser, email: 'john.doe123@example.com' };
      const mockWorkspace = { id: 'test', schemaName: 'workspace_test' };

      workspaceRepository.create.mockReturnValue(mockWorkspace as any);
      workspaceMemberRepository.create.mockReturnValue({} as any);
      (mockQueryRunner.manager.save as jest.Mock).mockResolvedValue(mockWorkspace);

      await service.createDefaultWorkspace(userWithDots as any, mockQueryRunner);

      const createCall = workspaceRepository.create.mock.calls[0][0];
      // Fix Issue #5: Improved title case formatting
      expect(createCall.name).toBe("JohnDoe123's Workspace");
    });
  });

  describe('schema validation', () => {
    it('should validate schema name pattern', async () => {
      const mockWorkspace = {
        id: 'workspace-uuid',
        schemaName: 'invalid_schema_name',
        ownerUserId: mockUser.id,
      };

      workspaceRepository.create.mockReturnValue(mockWorkspace as any);
      workspaceMemberRepository.create.mockReturnValue({} as any);
      (mockQueryRunner.manager.save as jest.Mock).mockResolvedValue(mockWorkspace);
      (mockQueryRunner.query as jest.Mock).mockRejectedValue(new Error('Invalid schema name format'));

      await expect(
        service.createDefaultWorkspace(mockUser, mockQueryRunner),
      ).rejects.toThrow();
    });
  });
});
