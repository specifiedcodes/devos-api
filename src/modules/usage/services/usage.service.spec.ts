import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsageService } from './usage.service';
import { ApiUsage, ApiProvider } from '../../../database/entities/api-usage.entity';
import { PricingService } from './pricing.service';
import { RedisService } from '../../../modules/redis/redis.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';

describe('UsageService', () => {
  let service: UsageService;
  let repository: jest.Mocked<Repository<ApiUsage>>;
  let pricingService: jest.Mocked<PricingService>;
  let redisService: jest.Mocked<RedisService>;
  let auditService: jest.Mocked<AuditService>;

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
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
      ],
    }).compile();

    service = module.get<UsageService>(UsageService);
    repository = module.get(getRepositoryToken(ApiUsage));
    pricingService = module.get(PricingService);
    redisService = module.get(RedisService);
    auditService = module.get(AuditService);
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

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { projectId: 'project-1', projectName: 'Project 1', cost: '5.5', requests: '25' },
          { projectId: 'project-2', projectName: 'Project 2', cost: '3.2', requests: '15' },
        ]),
      };

      repository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

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
});
