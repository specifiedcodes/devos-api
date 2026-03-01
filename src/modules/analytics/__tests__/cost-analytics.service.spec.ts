import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CostAnalyticsService } from '../services/cost-analytics.service';
import { ApiUsage, ApiProvider } from '../../../database/entities/api-usage.entity';
import { Agent } from '../../../database/entities/agent.entity';
import { RedisService } from '../../redis/redis.service';

describe('CostAnalyticsService', () => {
  let service: CostAnalyticsService;
  let apiUsageRepository: Repository<ApiUsage>;
  let agentRepository: Repository<Agent>;
  let redisService: RedisService;

  const mockApiUsageRepository = {
    createQueryBuilder: jest.fn(),
  };

  const mockAgentRepository = {
    find: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CostAnalyticsService,
        {
          provide: getRepositoryToken(ApiUsage),
          useValue: mockApiUsageRepository,
        },
        {
          provide: getRepositoryToken(Agent),
          useValue: mockAgentRepository,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<CostAnalyticsService>(CostAnalyticsService);
    apiUsageRepository = module.get<Repository<ApiUsage>>(getRepositoryToken(ApiUsage));
    agentRepository = module.get<Repository<Agent>>(getRepositoryToken(Agent));
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCostAnalytics', () => {
    it('should return cost analytics data', async () => {
      const mockDailyCosts = [
        { date: '2026-01-01', cost: '10.50' },
        { date: '2026-01-02', cost: '15.25' },
      ];

      const mockCostByModel = [
        { model: 'claude-sonnet', cost: '20.00' },
        { model: 'claude-haiku', cost: '5.75' },
      ];

      const mockCostByAgent = [
        { agentId: 'agent-1', cost: '15.00' },
        { agentId: 'agent-2', cost: '10.75' },
      ];

      mockRedisService.get.mockResolvedValue(null);

      const mockDailyBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockDailyCosts),
      };

      const mockModelBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockCostByModel),
      };

      const mockAgentBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockCostByAgent),
      };

      mockApiUsageRepository.createQueryBuilder
        .mockReturnValueOnce(mockDailyBuilder)
        .mockReturnValueOnce(mockModelBuilder)
        .mockReturnValueOnce(mockAgentBuilder);

      mockAgentRepository.find.mockResolvedValue([
        { id: 'agent-1', name: 'Dev Agent' },
        { id: 'agent-2', name: 'QA Agent' },
      ]);

      const result = await service.getCostAnalytics('workspace-1', 'project-1', {});

      expect(result.dailyCosts).toBeDefined();
      expect(result.byModel).toBeDefined();
      expect(result.byAgent).toBeDefined();
      expect(result.totalCost).toBeGreaterThanOrEqual(0);
      expect(result.currency).toBe('USD');
      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('should return cached data if available', async () => {
      const cachedData = {
        dailyCosts: [],
        byModel: [],
        byAgent: [],
        projectedMonthlyCost: 0,
        recommendations: [],
        totalCost: 0,
        currency: 'USD',
      };

      mockRedisService.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.getCostAnalytics('workspace-1', 'project-1', {});

      expect(result).toEqual(cachedData);
      expect(mockApiUsageRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should generate recommendations based on usage patterns', async () => {
      mockRedisService.get.mockResolvedValue(null);

      const mockDailyBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      const mockModelBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { model: 'claude-sonnet', cost: '150.00' },
        ]),
      };

      const mockAgentBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockApiUsageRepository.createQueryBuilder
        .mockReturnValueOnce(mockDailyBuilder)
        .mockReturnValueOnce(mockModelBuilder)
        .mockReturnValueOnce(mockAgentBuilder);

      mockAgentRepository.find.mockResolvedValue([]);

      const result = await service.getCostAnalytics('workspace-1', 'project-1', {});

      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });
});
