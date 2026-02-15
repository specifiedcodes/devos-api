import { Test, TestingModule } from '@nestjs/testing';
import { UsageV2Controller } from './usage-v2.controller';
import { UsageService } from '../services/usage.service';
import { CsvExportService } from '../services/csv-export.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ApiProvider } from '../../../database/entities/api-usage.entity';
import { CostGroupBy } from '../dto/cost-breakdown-query.dto';

describe('UsageV2Controller', () => {
  let controller: UsageV2Controller;
  let usageService: jest.Mocked<UsageService>;

  beforeEach(async () => {
    const mockUsageService = {
      recordUsage: jest.fn(),
      getWorkspaceUsageSummary: jest.fn(),
      getProjectUsageBreakdown: jest.fn(),
      getModelUsageBreakdown: jest.fn(),
      getDailyUsage: jest.fn(),
      getCostBreakdown: jest.fn(),
      getProviderBreakdown: jest.fn(),
    };

    const mockCsvExportService = {
      generateCsvStream: jest.fn(),
      getEstimatedRowCount: jest.fn(),
    };

    const mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsageV2Controller],
      providers: [
        {
          provide: UsageService,
          useValue: mockUsageService,
        },
        {
          provide: CsvExportService,
          useValue: mockCsvExportService,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
      ],
    }).compile();

    controller = module.get<UsageV2Controller>(UsageV2Controller);
    usageService = module.get(UsageService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /usage - recordUsage', () => {
    it('should accept google as provider value', async () => {
      const usage = {
        id: 'usage-id',
        costUsd: 0.001,
        createdAt: new Date(),
      };

      usageService.recordUsage.mockResolvedValue(usage as any);

      const result = await controller.recordUsage('workspace-id', {
        provider: ApiProvider.GOOGLE,
        model: 'gemini-2.0-flash',
        inputTokens: 1000,
        outputTokens: 500,
      });

      expect(result.id).toBe('usage-id');
      expect(usageService.recordUsage).toHaveBeenCalledWith(
        'workspace-id',
        null,
        ApiProvider.GOOGLE,
        'gemini-2.0-flash',
        1000,
        500,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });

    it('should accept deepseek as provider value', async () => {
      const usage = {
        id: 'usage-id',
        costUsd: 0.002,
        createdAt: new Date(),
      };

      usageService.recordUsage.mockResolvedValue(usage as any);

      const result = await controller.recordUsage('workspace-id', {
        provider: ApiProvider.DEEPSEEK,
        model: 'deepseek-chat',
        inputTokens: 1000,
        outputTokens: 500,
      });

      expect(result.id).toBe('usage-id');
      expect(usageService.recordUsage).toHaveBeenCalledWith(
        'workspace-id',
        null,
        ApiProvider.DEEPSEEK,
        'deepseek-chat',
        1000,
        500,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });

    it('should pass cachedTokens, taskType, routingReason to service', async () => {
      const usage = {
        id: 'usage-id',
        costUsd: 0.01,
        createdAt: new Date(),
      };

      usageService.recordUsage.mockResolvedValue(usage as any);

      await controller.recordUsage('workspace-id', {
        provider: ApiProvider.ANTHROPIC,
        model: 'claude-sonnet-4-5-20250929',
        inputTokens: 1000,
        outputTokens: 200,
        cachedTokens: 500,
        taskType: 'code_generation',
        routingReason: 'best quality for complex tasks',
      });

      expect(usageService.recordUsage).toHaveBeenCalledWith(
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
        'best quality for complex tasks',
      );
    });
  });

  describe('GET /breakdown', () => {
    it('should return 200 with valid CostBreakdownResponse', async () => {
      const mockResponse = {
        breakdown: [
          {
            group: 'claude-sonnet-4-5-20250929',
            totalCost: 8.5,
            requests: 40,
            inputTokens: 100000,
            outputTokens: 50000,
            cachedTokens: 20000,
            avgCostPerRequest: 0.2125,
          },
        ],
        totalCost: 8.5,
        totalRequests: 40,
        totalTokens: 150000,
        period: {
          start: '2026-01-01T00:00:00.000Z',
          end: '2026-01-31T23:59:59.999Z',
        },
      };

      usageService.getCostBreakdown.mockResolvedValue(mockResponse);

      const result = await controller.getCostBreakdown('workspace-id', {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        groupBy: CostGroupBy.MODEL,
      });

      expect(result).toEqual(mockResponse);
      expect(result.breakdown).toHaveLength(1);
      expect(result.totalCost).toBe(8.5);
    });

    it('should default groupBy to model when not specified', async () => {
      const mockResponse = {
        breakdown: [],
        totalCost: 0,
        totalRequests: 0,
        totalTokens: 0,
        period: { start: expect.any(String), end: expect.any(String) },
      };

      usageService.getCostBreakdown.mockResolvedValue(mockResponse);

      await controller.getCostBreakdown('workspace-id', {});

      expect(usageService.getCostBreakdown).toHaveBeenCalledWith(
        'workspace-id',
        expect.any(Date),
        expect.any(Date),
        CostGroupBy.MODEL,
      );
    });

    it('should use default date range when not specified', async () => {
      const mockResponse = {
        breakdown: [],
        totalCost: 0,
        totalRequests: 0,
        totalTokens: 0,
        period: { start: expect.any(String), end: expect.any(String) },
      };

      usageService.getCostBreakdown.mockResolvedValue(mockResponse);

      await controller.getCostBreakdown('workspace-id', {});

      // Should use defaults (current month start/end)
      expect(usageService.getCostBreakdown).toHaveBeenCalledWith(
        'workspace-id',
        expect.any(Date),
        expect.any(Date),
        CostGroupBy.MODEL,
      );
    });

    it('should pass custom groupBy to service', async () => {
      const mockResponse = {
        breakdown: [],
        totalCost: 0,
        totalRequests: 0,
        totalTokens: 0,
        period: { start: expect.any(String), end: expect.any(String) },
      };

      usageService.getCostBreakdown.mockResolvedValue(mockResponse);

      await controller.getCostBreakdown('workspace-id', {
        groupBy: CostGroupBy.PROVIDER,
      });

      expect(usageService.getCostBreakdown).toHaveBeenCalledWith(
        'workspace-id',
        expect.any(Date),
        expect.any(Date),
        CostGroupBy.PROVIDER,
      );
    });
  });

  describe('GET /by-provider', () => {
    it('should return 200 with provider breakdown', async () => {
      const mockResponse = [
        {
          provider: 'anthropic',
          totalCost: 8.5,
          requests: 40,
          inputTokens: 100000,
          outputTokens: 50000,
          cachedTokens: 20000,
          models: [
            { model: 'claude-sonnet-4-5-20250929', cost: 6.0, requests: 30 },
            { model: 'claude-3-5-sonnet-20241022', cost: 2.5, requests: 10 },
          ],
        },
      ];

      usageService.getProviderBreakdown.mockResolvedValue(mockResponse);

      const result = await controller.getProviderBreakdown('workspace-id', {});

      expect(result).toEqual(mockResponse);
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe('anthropic');
      expect(result[0].models).toHaveLength(2);
    });

    it('should pass date range to service', async () => {
      usageService.getProviderBreakdown.mockResolvedValue([]);

      await controller.getProviderBreakdown('workspace-id', {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

      expect(usageService.getProviderBreakdown).toHaveBeenCalledWith(
        'workspace-id',
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );
    });
  });
});
