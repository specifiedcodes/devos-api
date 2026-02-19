/**
 * Marketplace Installation Flow Tests
 *
 * Story 18-8: Agent Installation Flow
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  MarketplaceService,
} from '../marketplace.service';
import { PromptSecurityService } from '../prompt-security.service';
import { AgentDefinitionValidatorService } from '../../custom-agents/agent-definition-validator.service';
import { AgentDependencyService } from '../agent-dependency.service';
import { AgentConflictService } from '../agent-conflict.service';
import { MarketplaceEventsGateway } from '../marketplace-events.gateway';
import { MarketplaceAgent } from '../../../database/entities/marketplace-agent.entity';
import { MarketplaceReview } from '../../../database/entities/marketplace-review.entity';
import { InstalledAgent } from '../../../database/entities/installed-agent.entity';
import { AgentDefinition } from '../../../database/entities/agent-definition.entity';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { User } from '../../../database/entities/user.entity';
import { ReviewVote } from '../../../database/entities/review-vote.entity';
import { ReviewReport } from '../../../database/entities/review-report.entity';
import { InstallationLog, InstallationStatus } from '../../../database/entities/installation-log.entity';

describe('MarketplaceService - Installation Flow (Story 18-8)', () => {
  let service: MarketplaceService;
  let marketplaceAgentRepo: jest.Mocked<Repository<MarketplaceAgent>>;
  let installedAgentRepo: jest.Mocked<Repository<InstalledAgent>>;
  let definitionRepo: jest.Mocked<Repository<AgentDefinition>>;
  let installationLogRepo: jest.Mocked<Repository<InstallationLog>>;
  let memberRepo: jest.Mocked<Repository<WorkspaceMember>>;
  let dataSource: jest.Mocked<DataSource>;
  let eventsGateway: jest.Mocked<MarketplaceEventsGateway>;
  let dependencyService: jest.Mocked<AgentDependencyService>;
  let conflictService: jest.Mocked<AgentConflictService>;

  const mockMarketplaceAgent = {
    id: 'agent-1',
    name: 'test-agent',
    displayName: 'Test Agent',
    agentDefinitionId: 'def-1',
    latestVersion: '1.0.0',
    status: 'published',
    publisher: { name: 'Publisher' },
  };

  const mockDefinition = {
    id: 'def-1',
    definition: {
      spec: {
        tools: { allowed: ['read_file'] },
        permissions: ['file_access'],
      },
    },
    schemaVersion: '1.0',
    icon: null,
    category: 'development',
    tags: ['test'],
  };

  const mockMember = {
    workspaceId: 'workspace-1',
    userId: 'user-1',
    role: 'admin',
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      create: jest.fn().mockReturnValue({ id: 'new-id' }),
      save: jest.fn().mockResolvedValue({ id: 'new-id' }),
      increment: jest.fn(),
    },
  };

  beforeEach(async () => {
    const mockRepo = () => ({
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      increment: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      })),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceService,
        {
          provide: getRepositoryToken(MarketplaceAgent),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(MarketplaceReview),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(InstalledAgent),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(AgentDefinition),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(WorkspaceMember),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(ReviewVote),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(ReviewReport),
          useValue: mockRepo(),
        },
        {
          provide: getRepositoryToken(InstallationLog),
          useValue: mockRepo(),
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: PromptSecurityService,
          useValue: { analyzeAgentDefinition: jest.fn().mockResolvedValue({ isSafe: true }) },
        },
        {
          provide: AgentDefinitionValidatorService,
          useValue: { validateDefinition: jest.fn().mockReturnValue({ valid: true }) },
        },
        {
          provide: AgentDependencyService,
          useValue: {
            checkDependencies: jest.fn().mockResolvedValue({
              canInstall: true,
              missingDependencies: [],
              installedDependencies: [],
              conflicts: [],
              suggestions: [],
            }),
          },
        },
        {
          provide: AgentConflictService,
          useValue: {
            checkConflicts: jest.fn().mockResolvedValue({
              hasConflicts: false,
              conflicts: [],
              canForceInstall: true,
              warnings: [],
            }),
          },
        },
        {
          provide: MarketplaceEventsGateway,
          useValue: {
            emitProgress: jest.fn(),
            emitComplete: jest.fn(),
            emitError: jest.fn(),
            emitCancelled: jest.fn(),
            emitRollback: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MarketplaceService>(MarketplaceService);
    marketplaceAgentRepo = module.get(getRepositoryToken(MarketplaceAgent));
    installedAgentRepo = module.get(getRepositoryToken(InstalledAgent));
    definitionRepo = module.get(getRepositoryToken(AgentDefinition));
    installationLogRepo = module.get(getRepositoryToken(InstallationLog));
    memberRepo = module.get(getRepositoryToken(WorkspaceMember));
    dataSource = module.get(DataSource);
    eventsGateway = module.get(MarketplaceEventsGateway);
    dependencyService = module.get(AgentDependencyService);
    conflictService = module.get(AgentConflictService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAgentVersions', () => {
    it('should return available versions for an agent', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(mockMarketplaceAgent as any);

      const versions = await service.getAgentVersions('agent-1');

      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe('1.0.0');
      expect(versions[0].isLatest).toBe(true);
    });

    it('should throw NotFoundException when agent not found', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(null);

      await expect(service.getAgentVersions('non-existent')).rejects.toThrow('Marketplace agent not found');
    });
  });

  describe('preInstallCheck', () => {
    it('should return check result with canInstall true when no issues', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(mockMarketplaceAgent as any);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as any);
      installedAgentRepo.findOne.mockResolvedValue(null);

      const result = await service.preInstallCheck('agent-1', {
        workspaceId: 'workspace-1',
      });

      expect(result.canInstall).toBe(true);
      expect(result.agentId).toBe('agent-1');
      expect(result.targetVersion).toBe('1.0.0');
    });

    it('should return canInstall false when agent not published', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue({
        ...mockMarketplaceAgent,
        status: 'pending_review',
      } as any);

      const result = await service.preInstallCheck('agent-1', {
        workspaceId: 'workspace-1',
      });

      expect(result.canInstall).toBe(false);
      expect(result.conflicts.hasConflicts).toBe(true);
    });

    it('should include permissions and tools from definition', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(mockMarketplaceAgent as any);
      definitionRepo.findOne.mockResolvedValue(mockDefinition as any);
      installedAgentRepo.findOne.mockResolvedValue(null);

      const result = await service.preInstallCheck('agent-1', {
        workspaceId: 'workspace-1',
      });

      expect(result.permissions).toContain('file_access');
      expect(result.tools).toContain('read_file');
    });
  });

  describe('getInstallationStatus', () => {
    it('should return installation status', async () => {
      installationLogRepo.findOne.mockResolvedValue({
        id: 'install-1',
        workspaceId: 'workspace-1',
        marketplaceAgentId: 'agent-1',
        marketplaceAgent: mockMarketplaceAgent,
        targetVersion: '1.0.0',
        status: InstallationStatus.COMPLETED,
        currentStep: null,
        progressPercentage: 100,
        steps: [],
        startedAt: new Date(),
        completedAt: new Date(),
      } as any);

      const status = await service.getInstallationStatus('install-1');

      expect(status.id).toBe('install-1');
      expect(status.status).toBe(InstallationStatus.COMPLETED);
      expect(status.progressPercentage).toBe(100);
    });

    it('should throw NotFoundException when installation not found', async () => {
      installationLogRepo.findOne.mockResolvedValue(null);

      await expect(service.getInstallationStatus('non-existent')).rejects.toThrow('Installation not found');
    });
  });

  describe('cancelInstallation', () => {
    it('should cancel a pending installation', async () => {
      installationLogRepo.findOne.mockResolvedValue({
        id: 'install-1',
        status: InstallationStatus.VALIDATING,
      } as any);
      installationLogRepo.update.mockResolvedValue({} as any);

      await service.cancelInstallation('install-1', 'user-1');

      expect(installationLogRepo.update).toHaveBeenCalledWith(
        'install-1',
        expect.objectContaining({ status: InstallationStatus.ROLLED_BACK }),
      );
      expect(eventsGateway.emitCancelled).toHaveBeenCalled();
    });

    it('should throw error when trying to cancel completed installation', async () => {
      installationLogRepo.findOne.mockResolvedValue({
        id: 'install-1',
        status: InstallationStatus.COMPLETED,
      } as any);

      await expect(service.cancelInstallation('install-1', 'user-1')).rejects.toThrow(
        'Cannot cancel a completed installation',
      );
    });
  });

  describe('rollbackInstallation', () => {
    it('should rollback a failed installation', async () => {
      installationLogRepo.findOne.mockResolvedValue({
        id: 'install-1',
        status: InstallationStatus.FAILED,
        installedAgentId: null,
      } as any);
      installationLogRepo.update.mockResolvedValue({} as any);

      await service.rollbackInstallation('install-1', 'user-1');

      expect(installationLogRepo.update).toHaveBeenCalled();
      expect(eventsGateway.emitRollback).toHaveBeenCalled();
    });

    it('should cleanup partially installed agent', async () => {
      installationLogRepo.findOne.mockResolvedValue({
        id: 'install-1',
        status: InstallationStatus.FAILED,
        installedAgentId: 'installed-1',
      } as any);
      installedAgentRepo.delete.mockResolvedValue({} as any);
      installationLogRepo.update.mockResolvedValue({} as any);

      await service.rollbackInstallation('install-1', 'user-1');

      expect(installedAgentRepo.delete).toHaveBeenCalledWith({ id: 'installed-1' });
    });

    it('should throw error when trying to rollback non-failed installation', async () => {
      installationLogRepo.findOne.mockResolvedValue({
        id: 'install-1',
        status: InstallationStatus.INSTALLING,
      } as any);

      await expect(service.rollbackInstallation('install-1', 'user-1')).rejects.toThrow(
        'Can only rollback failed or cancelled installations',
      );
    });
  });

  describe('getInstallationHistory', () => {
    it('should return paginated installation history', async () => {
      memberRepo.findOne.mockResolvedValue(mockMember as any);
      installationLogRepo.createQueryBuilder.mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [
            {
              id: 'install-1',
              workspaceId: 'workspace-1',
              marketplaceAgentId: 'agent-1',
              marketplaceAgent: mockMarketplaceAgent,
              initiator: { name: 'User' },
              targetVersion: '1.0.0',
              status: InstallationStatus.COMPLETED,
              startedAt: new Date(),
              completedAt: new Date(),
              createdAt: new Date(),
            },
          ],
          1,
        ]),
      } as any);

      const result = await service.getInstallationHistory(
        'workspace-1',
        {},
        'user-1',
      );

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by status', async () => {
      memberRepo.findOne.mockResolvedValue(mockMember as any);
      const mockQb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      installationLogRepo.createQueryBuilder.mockReturnValue(mockQb as any);

      await service.getInstallationHistory(
        'workspace-1',
        { status: InstallationStatus.COMPLETED },
        'user-1',
      );

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'log.status = :status',
        { status: InstallationStatus.COMPLETED },
      );
    });
  });
});
