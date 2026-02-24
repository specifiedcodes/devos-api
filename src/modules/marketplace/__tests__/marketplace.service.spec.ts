/**
 * MarketplaceService Unit Tests
 *
 * Story 18-5: Agent Marketplace Backend
 */
import { Test, TestingModule } from '@nestjs/testing';
import { Repository, DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { MarketplaceService } from '../marketplace.service';
import { PromptSecurityService } from '../prompt-security.service';
import { AgentDefinitionValidatorService } from '../../custom-agents/agent-definition-validator.service';
import {
  MarketplaceAgent,
  MarketplaceAgentStatus,
  MarketplaceAgentCategory,
  MarketplacePricingType,
} from '../../../database/entities/marketplace-agent.entity';
import { MarketplaceReview } from '../../../database/entities/marketplace-review.entity';
import { InstalledAgent } from '../../../database/entities/installed-agent.entity';
import { AgentDefinition } from '../../../database/entities/agent-definition.entity';
import { WorkspaceMember, WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { User } from '../../../database/entities/user.entity';
import { InstallationLog } from '../../../database/entities/installation-log.entity';
import { ReviewVote } from '../../../database/entities/review-vote.entity';
import { ReviewReport } from '../../../database/entities/review-report.entity';
import { AgentDependencyService } from '../agent-dependency.service';
import { AgentConflictService } from '../agent-conflict.service';
import { MarketplaceEventsGateway } from '../marketplace-events.gateway';

describe('MarketplaceService', () => {
  let service: MarketplaceService;
  let marketplaceAgentRepo: jest.Mocked<Repository<MarketplaceAgent>>;
  let reviewRepo: jest.Mocked<Repository<MarketplaceReview>>;
  let installedAgentRepo: jest.Mocked<Repository<InstalledAgent>>;
  let definitionRepo: jest.Mocked<Repository<AgentDefinition>>;
  let memberRepo: jest.Mocked<Repository<WorkspaceMember>>;
  let promptSecurityService: jest.Mocked<PromptSecurityService>;
  let validatorService: jest.Mocked<AgentDefinitionValidatorService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let dataSource: jest.Mocked<DataSource>;

  const mockUserId = 'user-uuid-123';
  const mockWorkspaceId = 'workspace-uuid-123';
  const mockDefinitionId = 'definition-uuid-123';
  const mockMarketplaceAgentId = 'marketplace-agent-uuid-123';

  beforeEach(async () => {
    const mockRepo = () => ({
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      increment: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
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
          },
        },
        {
          provide: PromptSecurityService,
          useValue: {
            analyzePrompt: jest.fn(),
            analyzeAgentDefinition: jest.fn(),
          },
        },
        {
          provide: AgentDefinitionValidatorService,
          useValue: {
            validateDefinition: jest.fn(),
            validateModelReferences: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn(() => ({
              connect: jest.fn(),
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              rollbackTransaction: jest.fn(),
              release: jest.fn(),
              manager: {
                create: jest.fn(),
                save: jest.fn(),
                increment: jest.fn(),
              },
            })),
          },
        },
      ],
    }).compile();

    service = module.get<MarketplaceService>(MarketplaceService);
    marketplaceAgentRepo = module.get(getRepositoryToken(MarketplaceAgent));
    reviewRepo = module.get(getRepositoryToken(MarketplaceReview));
    installedAgentRepo = module.get(getRepositoryToken(InstalledAgent));
    definitionRepo = module.get(getRepositoryToken(AgentDefinition));
    memberRepo = module.get(getRepositoryToken(WorkspaceMember));
    promptSecurityService = module.get(PromptSecurityService);
    validatorService = module.get(AgentDefinitionValidatorService);
    eventEmitter = module.get(EventEmitter2);
    dataSource = module.get(DataSource);
  });

  describe('publishAgent', () => {
    const publishDto = {
      agentDefinitionId: mockDefinitionId,
      workspaceId: mockWorkspaceId,
      name: 'test-agent',
      displayName: 'Test Agent',
      shortDescription: 'A test agent',
      longDescription: 'A longer description',
      category: MarketplaceAgentCategory.DEVELOPMENT,
      pricingType: MarketplacePricingType.FREE,
    };

    it('should throw ForbiddenException if user is not a workspace member', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      await expect(
        service.publishAgent(mockWorkspaceId, mockDefinitionId, publishDto, mockUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if agent definition not found', async () => {
      memberRepo.findOne.mockResolvedValue({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        role: WorkspaceRole.DEVELOPER,
      } as WorkspaceMember);
      definitionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.publishAgent(mockWorkspaceId, mockDefinitionId, publishDto, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if definition validation fails', async () => {
      memberRepo.findOne.mockResolvedValue({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        role: WorkspaceRole.DEVELOPER,
      } as WorkspaceMember);
      definitionRepo.findOne.mockResolvedValue({
        id: mockDefinitionId,
        workspaceId: mockWorkspaceId,
        definition: { role: 'test', system_prompt: 'test' },
      } as AgentDefinition);
      validatorService.validateDefinition.mockReturnValue({
        valid: false,
        errors: [{ path: '/role', message: 'Invalid role', keyword: 'required' }],
        warnings: [],
      });

      await expect(
        service.publishAgent(mockWorkspaceId, mockDefinitionId, publishDto, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if security check fails', async () => {
      memberRepo.findOne.mockResolvedValue({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        role: WorkspaceRole.DEVELOPER,
      } as WorkspaceMember);
      definitionRepo.findOne.mockResolvedValue({
        id: mockDefinitionId,
        workspaceId: mockWorkspaceId,
        definition: { role: 'test', system_prompt: 'test' },
      } as AgentDefinition);
      validatorService.validateDefinition.mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      });
      promptSecurityService.analyzeAgentDefinition.mockResolvedValue({
        isSafe: false,
        riskLevel: 'high',
        findings: [{ type: 'malicious', severity: 'high', message: 'Malicious content' }],
      });

      await expect(
        service.publishAgent(mockWorkspaceId, mockDefinitionId, publishDto, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if name is already taken', async () => {
      memberRepo.findOne.mockResolvedValue({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        role: WorkspaceRole.DEVELOPER,
      } as WorkspaceMember);
      definitionRepo.findOne.mockResolvedValue({
        id: mockDefinitionId,
        workspaceId: mockWorkspaceId,
        definition: { role: 'test', system_prompt: 'test' },
      } as AgentDefinition);
      validatorService.validateDefinition.mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      });
      promptSecurityService.analyzeAgentDefinition.mockResolvedValue({
        isSafe: true,
        riskLevel: 'low',
        findings: [],
      });
      marketplaceAgentRepo.findOne.mockResolvedValueOnce({ id: 'existing' } as MarketplaceAgent);

      await expect(
        service.publishAgent(mockWorkspaceId, mockDefinitionId, publishDto, mockUserId),
      ).rejects.toThrow(ConflictException);
    });

    it('should create marketplace agent with PENDING_REVIEW status for first-time publishers', async () => {
      memberRepo.findOne.mockResolvedValue({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        role: WorkspaceRole.DEVELOPER,
      } as WorkspaceMember);
      definitionRepo.findOne.mockResolvedValue({
        id: mockDefinitionId,
        workspaceId: mockWorkspaceId,
        definition: { role: 'test', system_prompt: 'test' },
        version: '1.0.0',
      } as AgentDefinition);
      validatorService.validateDefinition.mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      });
      promptSecurityService.analyzeAgentDefinition.mockResolvedValue({
        isSafe: true,
        riskLevel: 'low',
        findings: [],
      });
      marketplaceAgentRepo.findOne.mockResolvedValueOnce(null);
      marketplaceAgentRepo.findOne.mockResolvedValueOnce(null);
      marketplaceAgentRepo.count.mockResolvedValue(0);
      marketplaceAgentRepo.create.mockReturnValue({
        id: mockMarketplaceAgentId,
        name: 'test-agent',
        displayName: 'Test Agent',
        status: MarketplaceAgentStatus.PENDING_REVIEW,
        avgRating: 0,
        totalInstalls: 0,
        ratingCount: 0,
        isFeatured: false,
        isVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as MarketplaceAgent);
      marketplaceAgentRepo.save.mockResolvedValue({
        id: mockMarketplaceAgentId,
        name: 'test-agent',
        displayName: 'Test Agent',
        status: MarketplaceAgentStatus.PENDING_REVIEW,
        publisherUserId: mockUserId,
        publisherWorkspaceId: mockWorkspaceId,
        agentDefinitionId: mockDefinitionId,
        avgRating: 0,
        totalInstalls: 0,
        ratingCount: 0,
        isFeatured: false,
        isVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as MarketplaceAgent);

      const result = await service.publishAgent(
        mockWorkspaceId,
        mockDefinitionId,
        publishDto,
        mockUserId,
      );

      expect(result.status).toBe(MarketplaceAgentStatus.PENDING_REVIEW);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'marketplace.agent.published',
        expect.objectContaining({ isFirstTimePublisher: true }),
      );
    });

    it('should create marketplace agent with PUBLISHED status for experienced publishers', async () => {
      memberRepo.findOne.mockResolvedValue({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        role: WorkspaceRole.DEVELOPER,
      } as WorkspaceMember);
      definitionRepo.findOne.mockResolvedValue({
        id: mockDefinitionId,
        workspaceId: mockWorkspaceId,
        definition: { role: 'test', system_prompt: 'test' },
        version: '1.0.0',
      } as AgentDefinition);
      validatorService.validateDefinition.mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      });
      promptSecurityService.analyzeAgentDefinition.mockResolvedValue({
        isSafe: true,
        riskLevel: 'low',
        findings: [],
      });
      marketplaceAgentRepo.findOne.mockResolvedValueOnce(null);
      marketplaceAgentRepo.findOne.mockResolvedValueOnce(null);
      marketplaceAgentRepo.count.mockResolvedValue(5); // Already published before
      marketplaceAgentRepo.create.mockReturnValue({
        id: mockMarketplaceAgentId,
        name: 'test-agent',
        displayName: 'Test Agent',
        status: MarketplaceAgentStatus.PUBLISHED,
        avgRating: 0,
        totalInstalls: 0,
        ratingCount: 0,
        isFeatured: false,
        isVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as MarketplaceAgent);
      marketplaceAgentRepo.save.mockResolvedValue({
        id: mockMarketplaceAgentId,
        name: 'test-agent',
        displayName: 'Test Agent',
        status: MarketplaceAgentStatus.PUBLISHED,
        publisherUserId: mockUserId,
        publisherWorkspaceId: mockWorkspaceId,
        agentDefinitionId: mockDefinitionId,
        publishedAt: new Date(),
        avgRating: 0,
        totalInstalls: 0,
        ratingCount: 0,
        isFeatured: false,
        isVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as MarketplaceAgent);

      const result = await service.publishAgent(
        mockWorkspaceId,
        mockDefinitionId,
        publishDto,
        mockUserId,
      );

      expect(result.status).toBe(MarketplaceAgentStatus.PUBLISHED);
      expect(result.publishedAt).toBeDefined();
    });
  });

  describe('browseAgents', () => {
    it('should return paginated list of published agents', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'agent-1',
          displayName: 'Agent 1',
          status: MarketplaceAgentStatus.PUBLISHED,
          publisher: { name: 'Publisher' },
          avgRating: 0,
          totalInstalls: 0,
          ratingCount: 0,
          isFeatured: false,
          isVerified: false,
          createdAt: new Date(),
        },
      ] as unknown as MarketplaceAgent[];

      marketplaceAgentRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockAgents, 1]),
      } as any);

      const result = await service.browseAgents({ page: 1, limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });

  describe('installAgent', () => {
    const installDto = {
      workspaceId: mockWorkspaceId,
      autoUpdate: true,
    };

    it('should throw ForbiddenException if user is not a workspace member', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      await expect(
        service.installAgent(mockMarketplaceAgentId, installDto, mockUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if marketplace agent not found', async () => {
      memberRepo.findOne.mockResolvedValue({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        role: WorkspaceRole.DEVELOPER,
      } as WorkspaceMember);
      marketplaceAgentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.installAgent(mockMarketplaceAgentId, installDto, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if agent is not published', async () => {
      memberRepo.findOne.mockResolvedValue({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        role: WorkspaceRole.DEVELOPER,
      } as WorkspaceMember);
      marketplaceAgentRepo.findOne.mockResolvedValue({
        id: mockMarketplaceAgentId,
        status: MarketplaceAgentStatus.DRAFT,
      } as MarketplaceAgent);

      await expect(
        service.installAgent(mockMarketplaceAgentId, installDto, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if agent already installed', async () => {
      memberRepo.findOne.mockResolvedValue({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        role: WorkspaceRole.DEVELOPER,
      } as WorkspaceMember);
      marketplaceAgentRepo.findOne.mockResolvedValue({
        id: mockMarketplaceAgentId,
        status: MarketplaceAgentStatus.PUBLISHED,
      } as MarketplaceAgent);
      installedAgentRepo.findOne.mockResolvedValue({ id: 'existing' } as InstalledAgent);

      await expect(
        service.installAgent(mockMarketplaceAgentId, installDto, mockUserId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('submitReview', () => {
    const reviewDto = {
      workspaceId: mockWorkspaceId,
      rating: 5,
      review: 'Great agent!',
    };

    it('should throw NotFoundException if marketplace agent not found', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.submitReview(mockMarketplaceAgentId, mockWorkspaceId, reviewDto, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if agent not installed', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue({
        id: mockMarketplaceAgentId,
        status: MarketplaceAgentStatus.PUBLISHED,
      } as MarketplaceAgent);
      installedAgentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.submitReview(mockMarketplaceAgentId, mockWorkspaceId, reviewDto, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create a new review', async () => {
      marketplaceAgentRepo.findOne.mockResolvedValue({
        id: mockMarketplaceAgentId,
        status: MarketplaceAgentStatus.PUBLISHED,
      } as MarketplaceAgent);
      installedAgentRepo.findOne.mockResolvedValue({
        marketplaceAgentId: mockMarketplaceAgentId,
        workspaceId: mockWorkspaceId,
        installedVersion: '1.0.0',
      } as InstalledAgent);
      reviewRepo.findOne.mockResolvedValueOnce(null);
      reviewRepo.create.mockReturnValue({
        id: 'review-id',
        marketplaceAgentId: mockMarketplaceAgentId,
        reviewerUserId: mockUserId,
        rating: 5,
        review: 'Great agent!',
      } as MarketplaceReview);
      reviewRepo.save.mockResolvedValue({
        id: 'review-id',
        marketplaceAgentId: mockMarketplaceAgentId,
        reviewerUserId: mockUserId,
        rating: 5,
        review: 'Great agent!',
      } as MarketplaceReview);
      reviewRepo.findOne.mockResolvedValueOnce({
        id: 'review-id',
        marketplaceAgentId: mockMarketplaceAgentId,
        reviewerUserId: mockUserId,
        rating: 5,
        review: 'Great agent!',
        reviewer: { name: 'Test User' },
      } as unknown as MarketplaceReview);
      reviewRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ avgRating: '5', count: '1' }),
      } as any);

      const result = await service.submitReview(
        mockMarketplaceAgentId,
        mockWorkspaceId,
        reviewDto,
        mockUserId,
      );

      expect(result.rating).toBe(5);
      expect(result.review).toBe('Great agent!');
    });
  });

  describe('checkForUpdates', () => {
    it('should throw ForbiddenException if user is not a workspace member', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      await expect(service.checkForUpdates(mockWorkspaceId, mockUserId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return empty array if no updates available', async () => {
      memberRepo.findOne.mockResolvedValue({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        role: WorkspaceRole.DEVELOPER,
      } as WorkspaceMember);
      installedAgentRepo.find.mockResolvedValue([
        {
          marketplaceAgentId: mockMarketplaceAgentId,
          installedVersion: '1.0.0',
          marketplaceAgent: { latestVersion: '1.0.0', name: 'test-agent' },
        },
      ] as InstalledAgent[]);

      const result = await service.checkForUpdates(mockWorkspaceId, mockUserId);

      expect(result).toHaveLength(0);
    });

    it('should return updates when newer versions available', async () => {
      memberRepo.findOne.mockResolvedValue({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        role: WorkspaceRole.DEVELOPER,
      } as WorkspaceMember);
      installedAgentRepo.find.mockResolvedValue([
        {
          marketplaceAgentId: mockMarketplaceAgentId,
          installedVersion: '1.0.0',
          marketplaceAgent: { latestVersion: '2.0.0', name: 'test-agent' },
        },
      ] as InstalledAgent[]);

      const result = await service.checkForUpdates(mockWorkspaceId, mockUserId);

      expect(result).toHaveLength(1);
      expect(result[0].installedVersion).toBe('1.0.0');
      expect(result[0].latestVersion).toBe('2.0.0');
    });
  });

  describe('listInstalledAgents', () => {
    it('should throw ForbiddenException if user is not a workspace member', async () => {
      memberRepo.findOne.mockResolvedValue(null);

      await expect(
        service.listInstalledAgents(mockWorkspaceId, { page: 1, limit: 20 }, mockUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return paginated list of installed agents', async () => {
      memberRepo.findOne.mockResolvedValue({
        userId: mockUserId,
        workspaceId: mockWorkspaceId,
        role: WorkspaceRole.VIEWER,
      } as WorkspaceMember);
      installedAgentRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.listInstalledAgents(
        mockWorkspaceId,
        { page: 1, limit: 20 },
        mockUserId,
      );

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});
