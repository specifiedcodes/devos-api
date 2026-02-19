/**
 * AgentVersionService Unit Tests
 *
 * Story 18-4: Agent Versioning
 *
 * Tests for version management service including:
 * - Version creation with auto-increment
 * - Version listing with pagination
 * - Version comparison and diff
 * - Publishing and rollback
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentVersionService } from '../agent-version.service';
import { AgentVersion } from '../../../database/entities/agent-version.entity';
import { AgentDefinition } from '../../../database/entities/agent-definition.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { AgentDefinitionAuditService } from '../agent-definition-audit.service';
import { VersionIncrementType } from '../dto/create-agent-version.dto';

describe('AgentVersionService', () => {
  let service: AgentVersionService;
  let versionRepo: jest.Mocked<Repository<AgentVersion>>;
  let definitionRepo: jest.Mocked<Repository<AgentDefinition>>;
  let memberRepo: jest.Mocked<Repository<WorkspaceMember>>;
  let auditService: jest.Mocked<AgentDefinitionAuditService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let dataSource: jest.Mocked<DataSource>;

  const mockWorkspaceId = 'workspace-123';
  const mockDefinitionId = 'definition-123';
  const mockActorId = 'user-123';

  const mockDefinition: Partial<AgentDefinition> = {
    id: mockDefinitionId,
    workspaceId: mockWorkspaceId,
    name: 'test-agent',
    displayName: 'Test Agent',
    description: 'A test agent',
    version: '1.0.0',
    schemaVersion: 'v1',
    definition: {
      role: 'Test role',
      system_prompt: 'Test prompt',
      model_preferences: {
        preferred: 'claude-3-sonnet',
      },
    },
    icon: 'bot',
    category: 'custom' as any,
    tags: ['test'],
    isPublished: false,
    isActive: true,
    createdBy: mockActorId,
  };

  const mockMember: Partial<WorkspaceMember> = {
    workspaceId: mockWorkspaceId,
    userId: mockActorId,
    role: WorkspaceRole.DEVELOPER,
  };

  beforeEach(async () => {
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    const mockVersionRepoValue = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    const mockDefinitionRepoValue = {
      findOne: jest.fn(),
      update: jest.fn(),
    };

    const mockMemberRepoValue = {
      findOne: jest.fn(),
    };

    const mockAuditServiceValue = {
      logEvent: jest.fn().mockResolvedValue({}),
    };

    const mockEventEmitterValue = {
      emit: jest.fn(),
    };

    const mockDataSourceValue = {
      transaction: jest.fn((cb) => cb({
        save: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockReturnValue({}),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentVersionService,
        {
          provide: getRepositoryToken(AgentVersion),
          useValue: mockVersionRepoValue,
        },
        {
          provide: getRepositoryToken(AgentDefinition),
          useValue: mockDefinitionRepoValue,
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: mockMemberRepoValue,
        },
        {
          provide: AgentDefinitionAuditService,
          useValue: mockAuditServiceValue,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitterValue,
        },
        {
          provide: DataSource,
          useValue: mockDataSourceValue,
        },
      ],
    }).compile();

    service = module.get(AgentVersionService);
    versionRepo = module.get(getRepositoryToken(AgentVersion));
    definitionRepo = module.get(getRepositoryToken(AgentDefinition));
    memberRepo = module.get(getRepositoryToken(WorkspaceMember));
    auditService = module.get(AgentDefinitionAuditService);
    eventEmitter = module.get(EventEmitter2);
    dataSource = module.get(DataSource);
  });

  describe('createVersion', () => {
    it('should create a version with explicit version number', async () => {
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as AgentDefinition);
      versionRepo.find.mockResolvedValue([]);
      versionRepo.create.mockReturnValue({
        id: 'version-123',
        agentDefinitionId: mockDefinitionId,
        version: '2.0.0',
        definitionSnapshot: {},
        isPublished: false,
        createdBy: mockActorId,
      } as AgentVersion);
      versionRepo.save.mockResolvedValue({
        id: 'version-123',
        agentDefinitionId: mockDefinitionId,
        version: '2.0.0',
        definitionSnapshot: {},
        isPublished: false,
        createdBy: mockActorId,
        createdAt: new Date(),
      } as AgentVersion);

      const result = await service.createVersion(
        mockWorkspaceId,
        mockDefinitionId,
        { version: '2.0.0', changelog: 'Major update' },
        mockActorId,
      );

      expect(result.version).toBe('2.0.0');
      expect(auditService.logEvent).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent.version.created',
        expect.objectContaining({ version: '2.0.0' }),
      );
    });

    it('should auto-increment patch version when not specified', async () => {
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as AgentDefinition);
      versionRepo.find.mockResolvedValue([
        { version: '1.0.0' } as AgentVersion,
      ]);
      versionRepo.create.mockReturnValue({
        id: 'version-123',
        version: '1.0.1',
      } as AgentVersion);
      versionRepo.save.mockResolvedValue({
        id: 'version-123',
        version: '1.0.1',
        createdAt: new Date(),
      } as AgentVersion);

      const result = await service.createVersion(
        mockWorkspaceId,
        mockDefinitionId,
        { incrementType: VersionIncrementType.PATCH },
        mockActorId,
      );

      expect(result.version).toBe('1.0.1');
    });

    it('should auto-increment minor version', async () => {
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as AgentDefinition);
      versionRepo.find.mockResolvedValue([
        { version: '1.2.3' } as AgentVersion,
      ]);
      versionRepo.create.mockReturnValue({
        id: 'version-123',
        version: '1.3.0',
      } as AgentVersion);
      versionRepo.save.mockResolvedValue({
        id: 'version-123',
        version: '1.3.0',
        createdAt: new Date(),
      } as AgentVersion);

      const result = await service.createVersion(
        mockWorkspaceId,
        mockDefinitionId,
        { incrementType: VersionIncrementType.MINOR },
        mockActorId,
      );

      expect(result.version).toBe('1.3.0');
    });

    it('should auto-increment major version', async () => {
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as AgentDefinition);
      versionRepo.find.mockResolvedValue([
        { version: '1.2.3' } as AgentVersion,
      ]);
      versionRepo.create.mockReturnValue({
        id: 'version-123',
        version: '2.0.0',
      } as AgentVersion);
      versionRepo.save.mockResolvedValue({
        id: 'version-123',
        version: '2.0.0',
        createdAt: new Date(),
      } as AgentVersion);

      const result = await service.createVersion(
        mockWorkspaceId,
        mockDefinitionId,
        { incrementType: VersionIncrementType.MAJOR },
        mockActorId,
      );

      expect(result.version).toBe('2.0.0');
    });

    it('should reject duplicate version numbers', async () => {
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as AgentDefinition);
      versionRepo.find.mockResolvedValue([
        { version: '1.0.0' } as AgentVersion,
      ]);

      await expect(
        service.createVersion(
          mockWorkspaceId,
          mockDefinitionId,
          { version: '1.0.0' },
          mockActorId,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject version lower than existing versions', async () => {
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as AgentDefinition);
      versionRepo.find.mockResolvedValue([
        { version: '2.0.0' } as AgentVersion,
      ]);

      await expect(
        service.createVersion(
          mockWorkspaceId,
          mockDefinitionId,
          { version: '1.0.0' },
          mockActorId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject non-workspace members', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createVersion(
          mockWorkspaceId,
          mockDefinitionId,
          { version: '2.0.0' },
          mockActorId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject if definition not found', async () => {
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      definitionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createVersion(
          mockWorkspaceId,
          mockDefinitionId,
          { version: '2.0.0' },
          mockActorId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listVersions', () => {
    it('should return paginated versions', async () => {
      definitionRepo.findOne.mockResolvedValue(mockDefinition as AgentDefinition);

      const mockVersions = [
        { id: 'v1', version: '1.0.0', createdAt: new Date() },
        { id: 'v2', version: '1.1.0', createdAt: new Date() },
      ] as AgentVersion[];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockVersions, 2]),
      };

      versionRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.listVersions(
        mockWorkspaceId,
        mockDefinitionId,
        { page: 1, limit: 10 },
      );

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should filter published only versions', async () => {
      definitionRepo.findOne.mockResolvedValue(mockDefinition as AgentDefinition);

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      versionRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      await service.listVersions(
        mockWorkspaceId,
        mockDefinitionId,
        { page: 1, limit: 10, publishedOnly: true },
      );

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'version.isPublished = :isPublished',
        { isPublished: true },
      );
    });
  });

  describe('getVersion', () => {
    it('should return a specific version', async () => {
      definitionRepo.findOne.mockResolvedValue(mockDefinition as AgentDefinition);
      versionRepo.findOne.mockResolvedValue({
        id: 'v1',
        version: '1.0.0',
        definitionSnapshot: {},
        isPublished: false,
        createdBy: mockActorId,
        createdAt: new Date(),
      } as AgentVersion);

      const result = await service.getVersion(
        mockWorkspaceId,
        mockDefinitionId,
        '1.0.0',
      );

      expect(result.version).toBe('1.0.0');
    });

    it('should throw if version not found', async () => {
      definitionRepo.findOne.mockResolvedValue(mockDefinition as AgentDefinition);
      versionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getVersion(mockWorkspaceId, mockDefinitionId, '9.9.9'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('compareVersions', () => {
    it('should return diff between two versions', async () => {
      definitionRepo.findOne.mockResolvedValue(mockDefinition as AgentDefinition);

      versionRepo.findOne
        .mockResolvedValueOnce({
          id: 'v1',
          agentDefinitionId: mockDefinitionId,
          version: '1.0.0',
          definitionSnapshot: {
            displayName: 'Test Agent',
            definition: { role: 'Old role' },
          },
          changelog: null,
          isPublished: true,
          publishedAt: new Date(),
          createdBy: mockActorId,
          createdAt: new Date(),
        } as AgentVersion)
        .mockResolvedValueOnce({
          id: 'v2',
          agentDefinitionId: mockDefinitionId,
          version: '1.1.0',
          definitionSnapshot: {
            displayName: 'Test Agent',
            definition: { role: 'New role' },
          },
          changelog: null,
          isPublished: true,
          publishedAt: new Date(),
          createdBy: mockActorId,
          createdAt: new Date(),
        } as AgentVersion);

      const result = await service.compareVersions(
        mockWorkspaceId,
        mockDefinitionId,
        '1.0.0',
        '1.1.0',
      );

      expect(result.fromVersion).toBe('1.0.0');
      expect(result.toVersion).toBe('1.1.0');
      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.summary.modified).toBeGreaterThan(0);
    });

    it('should throw if source version not found', async () => {
      definitionRepo.findOne.mockResolvedValue(mockDefinition as AgentDefinition);
      versionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.compareVersions(
          mockWorkspaceId,
          mockDefinitionId,
          '9.9.9',
          '1.0.0',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if target version not found', async () => {
      definitionRepo.findOne.mockResolvedValue(mockDefinition as AgentDefinition);
      versionRepo.findOne
        .mockResolvedValueOnce({ version: '1.0.0' } as AgentVersion)
        .mockResolvedValueOnce(null);

      await expect(
        service.compareVersions(
          mockWorkspaceId,
          mockDefinitionId,
          '1.0.0',
          '9.9.9',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('publishVersion', () => {
    it('should publish a version', async () => {
      const mockMemberAdmin = { ...mockMember, role: WorkspaceRole.ADMIN };
      memberRepo.findOne.mockResolvedValue(mockMemberAdmin as WorkspaceMember);

      const mockVersion = {
        id: 'v1',
        version: '1.0.0',
        isPublished: false,
        publishedAt: null,
      } as AgentVersion;

      versionRepo.findOne.mockResolvedValue(mockVersion);

      (dataSource.transaction as any) = jest.fn((cb: any) =>
        cb({
          save: jest.fn().mockResolvedValue({ ...mockVersion, isPublished: true }),
          update: jest.fn().mockResolvedValue({}),
        }),
      );

      const result = await service.publishVersion(
        mockWorkspaceId,
        mockDefinitionId,
        '1.0.0',
        mockActorId,
      );

      expect(result.isPublished).toBe(true);
      expect(auditService.logEvent).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent.version.published',
        expect.objectContaining({ version: '1.0.0' }),
      );
    });

    it('should reject non-admin users', async () => {
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);

      await expect(
        service.publishVersion(
          mockWorkspaceId,
          mockDefinitionId,
          '1.0.0',
          mockActorId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject already published versions', async () => {
      const mockMemberAdmin = { ...mockMember, role: WorkspaceRole.ADMIN };
      memberRepo.findOne.mockResolvedValue(mockMemberAdmin as WorkspaceMember);

      versionRepo.findOne.mockResolvedValue({
        version: '1.0.0',
        isPublished: true,
      } as AgentVersion);

      await expect(
        service.publishVersion(
          mockWorkspaceId,
          mockDefinitionId,
          '1.0.0',
          mockActorId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('rollbackToVersion', () => {
    it('should rollback to a previous version', async () => {
      const mockMemberAdmin = { ...mockMember, role: WorkspaceRole.ADMIN };
      memberRepo.findOne.mockResolvedValue(mockMemberAdmin as WorkspaceMember);

      // Create a definition with a different current version (1.5.0) to allow rollback to 1.0.0
      const mockDefinitionWithNewerVersion = {
        ...mockDefinition,
        version: '1.5.0',
      } as AgentDefinition;

      const targetVersion = {
        id: 'target-version-id',
        agentDefinitionId: mockDefinitionId,
        version: '1.0.0',
        definitionSnapshot: {
          displayName: 'Old Name',
          definition: { role: 'Old role' },
        },
        changelog: null,
        isPublished: true,
        publishedAt: new Date(),
        createdBy: mockActorId,
        createdAt: new Date(),
      } as AgentVersion;

      versionRepo.findOne.mockResolvedValue(targetVersion);
      definitionRepo.findOne.mockResolvedValue(mockDefinitionWithNewerVersion);
      versionRepo.find.mockResolvedValue([{ version: '1.5.0' } as AgentVersion]);

      const mockNewVersion = {
        id: 'new-version',
        agentDefinitionId: mockDefinitionId,
        version: '1.5.1',
        changelog: 'Rollback to version 1.0.0',
        definitionSnapshot: {},
        isPublished: false,
        publishedAt: null,
        createdBy: mockActorId,
        createdAt: new Date(),
      };

      (dataSource.transaction as any) = jest.fn(async (cb: any) => {
        const mockManager = {
          save: jest.fn()
            .mockResolvedValueOnce({}) // First save for definition
            .mockResolvedValueOnce(mockNewVersion), // Second save for version entity
          update: jest.fn().mockResolvedValue({}),
          create: jest.fn().mockReturnValue(mockNewVersion),
        };
        const result = await cb(mockManager);
        return result;
      });

      const result = await service.rollbackToVersion(
        mockWorkspaceId,
        mockDefinitionId,
        '1.0.0',
        mockActorId,
      );

      expect(result.version).toBe('1.5.1');
      expect(auditService.logEvent).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'agent.version.rollback',
        expect.objectContaining({ targetVersion: '1.0.0' }),
      );
    });

    it('should reject rollback to current version', async () => {
      const mockMemberAdmin = { ...mockMember, role: WorkspaceRole.ADMIN };
      memberRepo.findOne.mockResolvedValue(mockMemberAdmin as WorkspaceMember);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as AgentDefinition);

      // mockDefinition has version '1.0.0', so rolling back to '1.0.0' should fail
      await expect(
        service.rollbackToVersion(
          mockWorkspaceId,
          mockDefinitionId,
          '1.0.0',
          mockActorId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject non-admin users for rollback', async () => {
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);

      await expect(
        service.rollbackToVersion(
          mockWorkspaceId,
          mockDefinitionId,
          '0.9.0',
          mockActorId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if target version not found', async () => {
      const mockMemberAdmin = { ...mockMember, role: WorkspaceRole.ADMIN };
      memberRepo.findOne.mockResolvedValue(mockMemberAdmin as WorkspaceMember);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as AgentDefinition);
      versionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.rollbackToVersion(
          mockWorkspaceId,
          mockDefinitionId,
          '9.9.9',
          mockActorId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('semver comparison', () => {
    it('should correctly compare pre-release versions', async () => {
      memberRepo.findOne.mockResolvedValue(mockMember as WorkspaceMember);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as AgentDefinition);
      versionRepo.find.mockResolvedValue([
        { version: '1.0.0-alpha.1' } as AgentVersion,
      ]);
      versionRepo.create.mockReturnValue({
        version: '1.0.0',
      } as AgentVersion);
      versionRepo.save.mockResolvedValue({
        version: '1.0.0',
        createdAt: new Date(),
      } as AgentVersion);

      // 1.0.0 should be allowed after 1.0.0-alpha.1
      const result = await service.createVersion(
        mockWorkspaceId,
        mockDefinitionId,
        { version: '1.0.0' },
        mockActorId,
      );

      expect(result.version).toBe('1.0.0');
    });
  });
});
