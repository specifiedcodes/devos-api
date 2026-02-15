import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UsageService } from './usage.service';
import { ApiUsage, ApiProvider } from '../../../database/entities/api-usage.entity';
import { PricingService } from './pricing.service';
import { RedisService } from '../../../modules/redis/redis.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import { CostGroupBy } from '../dto/cost-breakdown-query.dto';

describe('UsageService', () => {
  let service: UsageService;
  let repository: jest.Mocked<Repository<ApiUsage>>;
  let pricingService: jest.Mocked<PricingService>;
  let redisService: jest.Mocked<RedisService>;
  let auditService: jest.Mocked<AuditService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
      manager: {
        query: jest.fn(),
      },
    };

    const mockPricingService = {
      getCurrentPricing: jest.fn(),
      calculateCost: jest.fn(),
    };

    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      increment: jest.fn(),
      expire: jest.fn(),
    };

    const mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsageService,
        {
          provide: getRepositoryToken(ApiUsage),
          useValue: mockRepository,
        },
        {
          provide: PricingService,
          useValue: mockPricingService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<UsageService>(UsageService);
    repository = module.get(getRepositoryToken(ApiUsage));
    pricingService = module.get(PricingService);
    redisService = module.get(RedisService);
    auditService = module.get(AuditService);
    eventEmitter = module.get(EventEmitter2);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordUsage', () => {
    it('should record usage with calculated cost', async () => {
      const pricing = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        inputPricePerMillion: 3.0,
        outputPricePerMillion: 15.0,
        effectiveDate: '2026-01-01',
      };

      pricingService.getCurrentPricing.mockResolvedValue(pricing);
      pricingService.calculateCost.mockReturnValue(0.0165);

      const usage = {
        id: 'usage-id',
        workspaceId: 'workspace-id',
        projectId: 'project-id',
        provider: ApiProvider.ANTHROPIC,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1500,
        outputTokens: 800,
        costUsd: 0.0165,
      };

      repository.create.mockReturnValue(usage as ApiUsage);
      repository.save.mockResolvedValue(usage as ApiUsage);
      redisService.increment.mockResolvedValue(0.0165);
      redisService.expire.mockResolvedValue(true);

      const result = await service.recordUsage(
        'workspace-id',
        'project-id',
        ApiProvider.ANTHROPIC,
        'claude-3-5-sonnet-20241022',
        1500,
        800,
      );

      expect(result.costUsd).toBe(0.0165);
      expect(pricingService.getCurrentPricing).toHaveBeenCalledWith(
        'anthropic',
        'claude-3-5-sonnet-20241022',
      );
      expect(pricingService.calculateCost).toHaveBeenCalledWith(
        1500,
        800,
        pricing,
        undefined,
      );
      expect(repository.save).toHaveBeenCalled();
    });

    it('should increment Redis counter on usage record', async () => {
      const pricing = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        inputPricePerMillion: 3.0,
        outputPricePerMillion: 15.0,
        effectiveDate: '2026-01-01',
      };

      pricingService.getCurrentPricing.mockResolvedValue(pricing);
      pricingService.calculateCost.mockReturnValue(0.0165);

      const usage = {
        id: 'usage-id',
        workspaceId: 'workspace-id',
        projectId: null,
        provider: ApiProvider.ANTHROPIC,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1500,
        outputTokens: 800,
        costUsd: 0.0165,
      };

      repository.create.mockReturnValue(usage as ApiUsage);
      repository.save.mockResolvedValue(usage as ApiUsage);
      redisService.increment.mockResolvedValue(0.0165);
      redisService.expire.mockResolvedValue(true);

      await service.recordUsage(
        'workspace-id',
        null,
        ApiProvider.ANTHROPIC,
        'claude-3-5-sonnet-20241022',
        1500,
        800,
      );

      const monthKey = new Date().toISOString().slice(0, 7);
      expect(redisService.increment).toHaveBeenCalledWith(
        `workspace:workspace-id:cost:month:${monthKey}`,
        0.0165,
      );
    });

    it('should handle Redis errors gracefully', async () => {
      const pricing = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        inputPricePerMillion: 3.0,
        outputPricePerMillion: 15.0,
        effectiveDate: '2026-01-01',
      };

      pricingService.getCurrentPricing.mockResolvedValue(pricing);
      pricingService.calculateCost.mockReturnValue(0.0165);

      const usage = {
        id: 'usage-id',
        workspaceId: 'workspace-id',
        projectId: null,
        provider: ApiProvider.ANTHROPIC,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1500,
        outputTokens: 800,
        costUsd: 0.0165,
      };

      repository.create.mockReturnValue(usage as ApiUsage);
      repository.save.mockResolvedValue(usage as ApiUsage);
      redisService.increment.mockRejectedValue(new Error('Redis unavailable'));

      // Should not throw even if Redis fails
      await expect(
        service.recordUsage(
          'workspace-id',
          null,
          ApiProvider.ANTHROPIC,
          'claude-3-5-sonnet-20241022',
          1500,
          800,
        ),
      ).resolves.not.toThrow();
    });

    it('should record usage with BYOK key ID', async () => {
      const pricing = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        inputPricePerMillion: 3.0,
        outputPricePerMillion: 15.0,
        effectiveDate: '2026-01-01',
      };

      pricingService.getCurrentPricing.mockResolvedValue(pricing);
      pricingService.calculateCost.mockReturnValue(0.0165);

      const usage = {
        id: 'usage-id',
        workspaceId: 'workspace-id',
        projectId: 'project-id',
        byokKeyId: 'byok-key-id',
        provider: ApiProvider.ANTHROPIC,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1500,
        outputTokens: 800,
        costUsd: 0.0165,
      };

      repository.create.mockReturnValue(usage as ApiUsage);
      repository.save.mockResolvedValue(usage as ApiUsage);
      redisService.increment.mockResolvedValue(0.0165);
      redisService.expire.mockResolvedValue(true);

      const result = await service.recordUsage(
        'workspace-id',
        'project-id',
        ApiProvider.ANTHROPIC,
        'claude-3-5-sonnet-20241022',
        1500,
        800,
        'byok-key-id',
      );

      expect(result.byokKeyId).toBe('byok-key-id');
    });

    it('should create byok_key_used audit event when byokKeyId is provided', async () => {
      const pricing = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        inputPricePerMillion: 3.0,
        outputPricePerMillion: 15.0,
        effectiveDate: '2026-01-01',
      };

      pricingService.getCurrentPricing.mockResolvedValue(pricing);
      pricingService.calculateCost.mockReturnValue(0.0165);

      const usage = {
        id: 'usage-id',
        workspaceId: 'workspace-id',
        projectId: 'project-id',
        byokKeyId: 'byok-key-id',
        provider: ApiProvider.ANTHROPIC,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1500,
        outputTokens: 800,
        costUsd: 0.0165,
      };

      repository.create.mockReturnValue(usage as ApiUsage);
      repository.save.mockResolvedValue(usage as ApiUsage);
      redisService.increment.mockResolvedValue(0.0165);
      redisService.expire.mockResolvedValue(true);

      await service.recordUsage(
        'workspace-id',
        'project-id',
        ApiProvider.ANTHROPIC,
        'claude-3-5-sonnet-20241022',
        1500,
        800,
        'byok-key-id',
      );

      // Should have logged both CREATE and BYOK_KEY_USED audit events
      expect(auditService.log).toHaveBeenCalledWith(
        'workspace-id',
        'system',
        AuditAction.BYOK_KEY_USED,
        'byok_key',
        'byok-key-id',
        expect.objectContaining({
          keyId: 'byok-key-id',
          provider: ApiProvider.ANTHROPIC,
          model: 'claude-3-5-sonnet-20241022',
          costUsd: 0.0165,
        }),
      );
    });

    it('should NOT create byok_key_used audit event when byokKeyId is absent', async () => {
      const pricing = {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        inputPricePerMillion: 3.0,
        outputPricePerMillion: 15.0,
        effectiveDate: '2026-01-01',
      };

      pricingService.getCurrentPricing.mockResolvedValue(pricing);
      pricingService.calculateCost.mockReturnValue(0.0165);

      const usage = {
        id: 'usage-id',
        workspaceId: 'workspace-id',
        projectId: null,
        provider: ApiProvider.ANTHROPIC,
        model: 'claude-3-5-sonnet-20241022',
        inputTokens: 1500,
        outputTokens: 800,
        costUsd: 0.0165,
      };

      repository.create.mockReturnValue(usage as ApiUsage);
      repository.save.mockResolvedValue(usage as ApiUsage);
      redisService.increment.mockResolvedValue(0.0165);
      redisService.expire.mockResolvedValue(true);

      await service.recordUsage(
        'workspace-id',
        null,
        ApiProvider.ANTHROPIC,
        'claude-3-5-sonnet-20241022',
        1500,
        800,
      );

      // Should only have one audit call (CREATE), not BYOK_KEY_USED
      expect(auditService.log).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        AuditAction.BYOK_KEY_USED,
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('getWorkspaceUsageSummary', () => {
    it('should query usage summary from database', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalCost: '10.5',
          totalInputTokens: '100000',
          totalOutputTokens: '50000',
          totalRequests: '50',
        }),
      };

      repository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );
      redisService.get.mockResolvedValue(null);

      const summary = await service.getWorkspaceUsageSummary(
        'workspace-id',
        startDate,
        endDate,
      );

      expect(summary.totalCost).toBe(10.5);
      expect(summary.totalInputTokens).toBe(100000);
      expect(summary.totalOutputTokens).toBe(50000);
      expect(summary.totalRequests).toBe(50);
    });

    it('should use Redis counter for current month', async () => {
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      redisService.get.mockResolvedValue('10.5');

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalCost: '10.0',
          totalInputTokens: '100000',
          totalOutputTokens: '50000',
          totalRequests: '50',
        }),
      };

      repository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const summary = await service.getWorkspaceUsageSummary(
        'workspace-id',
        startDate,
        endDate,
      );

      // Should use Redis value for cost
      expect(summary.totalCost).toBe(10.5);
      expect(summary.totalRequests).toBe(50);
    });
  });

  describe('getProjectUsageBreakdown', () => {
    it('should group usage by project', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      (repository.manager as any).query.mockResolvedValue([
        { projectId: 'project-1', projectName: 'Project 1', cost: '5.5', requests: '25' },
        { projectId: 'project-2', projectName: 'Project 2', cost: '3.2', requests: '15' },
      ]);

      const breakdown = await service.getProjectUsageBreakdown(
        'workspace-id',
        startDate,
        endDate,
      );

      expect(breakdown).toHaveLength(2);
      expect(breakdown[0]).toEqual({
        projectId: 'project-1',
        projectName: 'Project 1',
        cost: 5.5,
        requests: 25,
      });
      expect(breakdown[1]).toEqual({
        projectId: 'project-2',
        projectName: 'Project 2',
        cost: 3.2,
        requests: 15,
      });
    });
  });

  describe('getModelUsageBreakdown', () => {
    it('should group usage by model', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            model: 'claude-3-5-sonnet-20241022',
            cost: '8.0',
            requests: '40',
          },
          { model: 'gpt-4-turbo', cost: '2.5', requests: '10' },
        ]),
      };

      repository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const breakdown = await service.getModelUsageBreakdown(
        'workspace-id',
        startDate,
        endDate,
      );

      expect(breakdown).toHaveLength(2);
      expect(breakdown[0]).toEqual({
        model: 'claude-3-5-sonnet-20241022',
        cost: 8.0,
        requests: 40,
      });
      expect(breakdown[1]).toEqual({
        model: 'gpt-4-turbo',
        cost: 2.5,
        requests: 10,
      });
    });
  });

  describe('getKeyUsage', () => {
    it('should query usage for specific BYOK key', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          requests: '15',
          cost: '5.25',
        }),
      };

      repository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const usage = await service.getKeyUsage('byok-key-id', 'workspace-id');

      expect(usage.requests).toBe(15);
      expect(usage.cost).toBe(5.25);
    });

    it('should handle zero usage for BYOK key', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          requests: null,
          cost: null,
        }),
      };

      repository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const usage = await service.getKeyUsage('byok-key-id', 'workspace-id');

      expect(usage.requests).toBe(0);
      expect(usage.cost).toBe(0);
    });
  });

  describe('recordUsage - new fields', () => {
    const setupMocks = () => {
      const pricing = {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        inputPricePerMillion: 3.0,
        outputPricePerMillion: 15.0,
        cachedInputPricePerMillion: 0.30,
        effectiveDate: '2026-01-01',
      };

      pricingService.getCurrentPricing.mockResolvedValue(pricing);
      pricingService.calculateCost.mockReturnValue(0.01);

      const usage = {
        id: 'usage-id',
        workspaceId: 'workspace-id',
        projectId: null,
        provider: ApiProvider.ANTHROPIC,
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 1000,
        outputTokens: 200,
        costUsd: 0.01,
        cachedTokens: 500,
        taskType: 'code_generation',
        routingReason: 'best quality for complex tasks',
      };

      repository.create.mockReturnValue(usage as any);
      repository.save.mockResolvedValue(usage as any);
      redisService.increment.mockResolvedValue(0.01);
      redisService.expire.mockResolvedValue(true);

      return { pricing, usage };
    };

    it('should store cachedTokens in the ApiUsage record', async () => {
      setupMocks();

      await service.recordUsage(
        'workspace-id',
        null,
        ApiProvider.ANTHROPIC,
        'claude-sonnet-4-5-20250929',
        1000,
        200,
        undefined,
        undefined,
        500,
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ cachedTokens: 500 }),
      );
    });

    it('should store taskType in the ApiUsage record', async () => {
      setupMocks();

      await service.recordUsage(
        'workspace-id',
        null,
        ApiProvider.ANTHROPIC,
        'claude-sonnet-4-5-20250929',
        1000,
        200,
        undefined,
        undefined,
        0,
        'code_generation',
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ taskType: 'code_generation' }),
      );
    });

    it('should store routingReason in the ApiUsage record', async () => {
      setupMocks();

      await service.recordUsage(
        'workspace-id',
        null,
        ApiProvider.ANTHROPIC,
        'claude-sonnet-4-5-20250929',
        1000,
        200,
        undefined,
        undefined,
        0,
        undefined,
        'best quality for complex tasks',
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ routingReason: 'best quality for complex tasks' }),
      );
    });

    it('should pass cachedTokens to calculateCost when > 0', async () => {
      const { pricing } = setupMocks();

      await service.recordUsage(
        'workspace-id',
        null,
        ApiProvider.ANTHROPIC,
        'claude-sonnet-4-5-20250929',
        1000,
        200,
        undefined,
        undefined,
        500,
      );

      expect(pricingService.calculateCost).toHaveBeenCalledWith(
        1000,
        200,
        pricing,
        500,
      );
    });

    it('should default cachedTokens to 0 when not provided', async () => {
      setupMocks();

      await service.recordUsage(
        'workspace-id',
        null,
        ApiProvider.ANTHROPIC,
        'claude-sonnet-4-5-20250929',
        1000,
        200,
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ cachedTokens: 0 }),
      );
    });

    it('should emit usage:cost_update event after recording', async () => {
      setupMocks();

      await service.recordUsage(
        'workspace-id',
        null,
        ApiProvider.ANTHROPIC,
        'claude-sonnet-4-5-20250929',
        1000,
        200,
        undefined,
        undefined,
        500,
        'code_generation',
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'usage:cost_update',
        expect.objectContaining({
          workspaceId: 'workspace-id',
          provider: ApiProvider.ANTHROPIC,
          model: 'claude-sonnet-4-5-20250929',
          taskType: 'code_generation',
          costUsd: 0.01,
          inputTokens: 1000,
          outputTokens: 200,
          cachedTokens: 500,
          monthlyTotal: expect.any(Number),
          timestamp: expect.any(String),
        }),
      );
    });
  });

  describe('getCostBreakdown', () => {
    it('should return model-level aggregation for groupBy=model', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      (repository.manager as any).query.mockResolvedValue([
        {
          group: 'claude-sonnet-4-5-20250929',
          totalCost: '8.5',
          requests: '40',
          inputTokens: '100000',
          outputTokens: '50000',
          cachedTokens: '20000',
        },
        {
          group: 'gpt-4-turbo',
          totalCost: '2.5',
          requests: '10',
          inputTokens: '30000',
          outputTokens: '15000',
          cachedTokens: '0',
        },
      ]);

      const result = await service.getCostBreakdown(
        'workspace-id',
        startDate,
        endDate,
        CostGroupBy.MODEL,
      );

      expect(result.breakdown).toHaveLength(2);
      expect(result.breakdown[0].group).toBe('claude-sonnet-4-5-20250929');
      expect(result.breakdown[0].totalCost).toBe(8.5);
      expect(result.breakdown[0].requests).toBe(40);
      expect(result.breakdown[0].inputTokens).toBe(100000);
      expect(result.breakdown[0].outputTokens).toBe(50000);
      expect(result.breakdown[0].cachedTokens).toBe(20000);
      expect(result.breakdown[0].avgCostPerRequest).toBeCloseTo(0.2125, 4);
      expect(result.totalCost).toBeCloseTo(11.0, 1);
      expect(result.totalRequests).toBe(50);
      expect(result.totalTokens).toBe(195000);
      expect(result.period.start).toBe(startDate.toISOString());
      expect(result.period.end).toBe(endDate.toISOString());
    });

    it('should return provider-level aggregation for groupBy=provider', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      (repository.manager as any).query.mockResolvedValue([
        {
          group: 'anthropic',
          totalCost: '8.5',
          requests: '40',
          inputTokens: '100000',
          outputTokens: '50000',
          cachedTokens: '20000',
        },
      ]);

      const result = await service.getCostBreakdown(
        'workspace-id',
        startDate,
        endDate,
        CostGroupBy.PROVIDER,
      );

      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].group).toBe('anthropic');
    });

    it('should return task-type-level aggregation for groupBy=taskType', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      (repository.manager as any).query.mockResolvedValue([
        {
          group: 'code_generation',
          totalCost: '5.0',
          requests: '20',
          inputTokens: '60000',
          outputTokens: '30000',
          cachedTokens: '10000',
        },
      ]);

      const result = await service.getCostBreakdown(
        'workspace-id',
        startDate,
        endDate,
        CostGroupBy.TASK_TYPE,
      );

      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].group).toBe('code_generation');
    });

    it('should return agent-level aggregation for groupBy=agent', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      (repository.manager as any).query.mockResolvedValue([
        {
          group: 'dev-agent',
          totalCost: '6.0',
          requests: '30',
          inputTokens: '80000',
          outputTokens: '40000',
          cachedTokens: '15000',
        },
      ]);

      const result = await service.getCostBreakdown(
        'workspace-id',
        startDate,
        endDate,
        CostGroupBy.AGENT,
      );

      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].group).toBe('dev-agent');
    });

    it('should return project-level aggregation with names for groupBy=project', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      (repository.manager as any).query.mockResolvedValue([
        {
          group: 'My Project',
          totalCost: '7.0',
          requests: '35',
          inputTokens: '90000',
          outputTokens: '45000',
          cachedTokens: '18000',
        },
      ]);

      const result = await service.getCostBreakdown(
        'workspace-id',
        startDate,
        endDate,
        CostGroupBy.PROJECT,
      );

      expect(result.breakdown).toHaveLength(1);
      expect(result.breakdown[0].group).toBe('My Project');
    });

    it('should return empty breakdown array when no data', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      (repository.manager as any).query.mockResolvedValue([]);

      const result = await service.getCostBreakdown(
        'workspace-id',
        startDate,
        endDate,
        CostGroupBy.MODEL,
      );

      expect(result.breakdown).toHaveLength(0);
      expect(result.totalCost).toBe(0);
      expect(result.totalRequests).toBe(0);
      expect(result.totalTokens).toBe(0);
    });

    it('should order by totalCost DESC', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      (repository.manager as any).query.mockResolvedValue([
        {
          group: 'claude-sonnet-4-5-20250929',
          totalCost: '10.0',
          requests: '50',
          inputTokens: '100000',
          outputTokens: '50000',
          cachedTokens: '0',
        },
        {
          group: 'deepseek-chat',
          totalCost: '1.0',
          requests: '100',
          inputTokens: '200000',
          outputTokens: '100000',
          cachedTokens: '50000',
        },
      ]);

      const result = await service.getCostBreakdown(
        'workspace-id',
        startDate,
        endDate,
        CostGroupBy.MODEL,
      );

      // First item has higher cost
      expect(result.breakdown[0].totalCost).toBeGreaterThan(result.breakdown[1].totalCost);
    });
  });

  describe('getProviderBreakdown', () => {
    it('should return provider-level data with nested model breakdown', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      // First call: provider-level aggregation
      (repository.manager as any).query
        .mockResolvedValueOnce([
          {
            provider: 'anthropic',
            totalCost: '8.5',
            requests: '40',
            inputTokens: '100000',
            outputTokens: '50000',
            cachedTokens: '20000',
          },
          {
            provider: 'openai',
            totalCost: '2.5',
            requests: '10',
            inputTokens: '30000',
            outputTokens: '15000',
            cachedTokens: '0',
          },
        ])
        // Second call: model-level breakdown
        .mockResolvedValueOnce([
          {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5-20250929',
            cost: '6.0',
            requests: '30',
          },
          {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet-20241022',
            cost: '2.5',
            requests: '10',
          },
          {
            provider: 'openai',
            model: 'gpt-4-turbo',
            cost: '2.5',
            requests: '10',
          },
        ]);

      const result = await service.getProviderBreakdown(
        'workspace-id',
        startDate,
        endDate,
      );

      expect(result).toHaveLength(2);
      expect(result[0].provider).toBe('anthropic');
      expect(result[0].totalCost).toBe(8.5);
      expect(result[0].requests).toBe(40);
      expect(result[0].inputTokens).toBe(100000);
      expect(result[0].outputTokens).toBe(50000);
      expect(result[0].cachedTokens).toBe(20000);
      expect(result[0].models).toHaveLength(2);
      expect(result[0].models[0].model).toBe('claude-sonnet-4-5-20250929');
      expect(result[0].models[0].cost).toBe(6.0);
      expect(result[1].provider).toBe('openai');
      expect(result[1].models).toHaveLength(1);
    });

    it('should return empty array when no data', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      (repository.manager as any).query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getProviderBreakdown(
        'workspace-id',
        startDate,
        endDate,
      );

      expect(result).toHaveLength(0);
    });
  });
});
