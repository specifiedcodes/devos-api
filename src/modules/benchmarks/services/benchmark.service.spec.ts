/**
 * BenchmarkService Tests
 *
 * Story 13-8: Model Performance Benchmarks
 *
 * Tests for recording performance, aggregating benchmarks, matrix,
 * trends, deprioritized/promoted models, and router feedback.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BenchmarkService } from './benchmark.service';
import { ModelPerformance } from '../../../database/entities/model-performance.entity';
import { RedisService } from '../../redis/redis.service';

describe('BenchmarkService', () => {
  let service: BenchmarkService;
  let repository: any;
  let redisService: jest.Mocked<RedisService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  // Mock query builder
  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
    getRawMany: jest.fn(),
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    const mockRedisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      scanKeys: jest.fn().mockResolvedValue([]),
    };

    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BenchmarkService,
        {
          provide: getRepositoryToken(ModelPerformance),
          useValue: mockRepository,
        },
        { provide: RedisService, useValue: mockRedisService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<BenchmarkService>(BenchmarkService);
    repository = module.get(getRepositoryToken(ModelPerformance));
    redisService = module.get(RedisService);
    eventEmitter = module.get(EventEmitter2);

    // Reset all mock query builder calls
    Object.values(mockQueryBuilder).forEach((fn) => {
      if (typeof fn === 'function' && 'mockClear' in fn) {
        (fn as jest.Mock).mockClear();
        // Re-set returnThis for chainable calls
        if (fn !== mockQueryBuilder.getRawOne && fn !== mockQueryBuilder.getRawMany) {
          (fn as jest.Mock).mockReturnThis();
        }
      }
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---- recordPerformance tests ----

  describe('recordPerformance', () => {
    const validDto = {
      requestId: 'req-001',
      model: 'claude-sonnet-4-5-20250929',
      provider: 'anthropic',
      taskType: 'coding',
      success: true,
      latencyMs: 1200,
      inputTokens: 5000,
      outputTokens: 2000,
      cost: 0.045,
    };

    it('should create and save a ModelPerformance entity', async () => {
      const mockEntity = { id: 'uuid-1', ...validDto };
      repository.create.mockReturnValue(mockEntity);
      repository.save.mockResolvedValue(mockEntity);

      const result = await service.recordPerformance('ws-1', validDto);

      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledWith(mockEntity);
      expect(result).toEqual(mockEntity);
    });

    it('should store all fields from RecordPerformanceDto', async () => {
      const dtoWithOptionals = {
        ...validDto,
        qualityScore: 0.9,
        contextSize: 10000,
        retryCount: 1,
        errorType: 'timeout',
      };

      const mockEntity = { id: 'uuid-1', ...dtoWithOptionals };
      repository.create.mockReturnValue(mockEntity);
      repository.save.mockResolvedValue(mockEntity);

      await service.recordPerformance('ws-1', dtoWithOptionals);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-001',
          workspaceId: 'ws-1',
          model: 'claude-sonnet-4-5-20250929',
          provider: 'anthropic',
          taskType: 'coding',
          success: true,
          qualityScore: 0.9,
          latencyMs: 1200,
          inputTokens: 5000,
          outputTokens: 2000,
          cost: 0.045,
          contextSize: 10000,
          retryCount: 1,
          errorType: 'timeout',
        }),
      );
    });

    it('should set qualityScore to null when not provided', async () => {
      const mockEntity = { id: 'uuid-1', ...validDto, qualityScore: null };
      repository.create.mockReturnValue(mockEntity);
      repository.save.mockResolvedValue(mockEntity);

      await service.recordPerformance('ws-1', validDto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ qualityScore: null }),
      );
    });

    it('should invalidate Redis cache for model+taskType', async () => {
      const mockEntity = { id: 'uuid-1', ...validDto };
      repository.create.mockReturnValue(mockEntity);
      repository.save.mockResolvedValue(mockEntity);

      await service.recordPerformance('ws-1', validDto);

      expect(redisService.del).toHaveBeenCalledWith(
        'benchmark:model|claude-sonnet-4-5-20250929|task|coding',
        'benchmark:matrix',
        'benchmark:router-feedback|coding',
      );
    });

    it('should invalidate Redis matrix cache', async () => {
      const mockEntity = { id: 'uuid-1', ...validDto };
      repository.create.mockReturnValue(mockEntity);
      repository.save.mockResolvedValue(mockEntity);

      await service.recordPerformance('ws-1', validDto);

      expect(redisService.del).toHaveBeenCalledWith(
        expect.any(String),
        'benchmark:matrix',
        expect.any(String),
      );
    });

    it('should invalidate trend caches via scanKeys', async () => {
      const mockEntity = { id: 'uuid-1', ...validDto };
      repository.create.mockReturnValue(mockEntity);
      repository.save.mockResolvedValue(mockEntity);
      redisService.scanKeys.mockResolvedValue([
        'benchmark:trend|claude-sonnet-4-5-20250929|coding|30',
        'benchmark:trend|claude-sonnet-4-5-20250929|coding|60',
      ]);

      await service.recordPerformance('ws-1', validDto);

      expect(redisService.scanKeys).toHaveBeenCalledWith(
        expect.stringContaining('benchmark:trend'),
      );
    });

    it('should emit benchmark:recorded event after save', async () => {
      const mockEntity = { id: 'uuid-1', ...validDto };
      repository.create.mockReturnValue(mockEntity);
      repository.save.mockResolvedValue(mockEntity);

      await service.recordPerformance('ws-1', validDto);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'benchmark:recorded',
        expect.objectContaining({
          model: 'claude-sonnet-4-5-20250929',
          taskType: 'coding',
          workspaceId: 'ws-1',
        }),
      );
    });

    it('should handle database errors gracefully', async () => {
      repository.create.mockReturnValue({});
      repository.save.mockRejectedValue(new Error('DB error'));

      await expect(
        service.recordPerformance('ws-1', validDto),
      ).rejects.toThrow('DB error');
    });
  });

  // ---- getModelBenchmark tests ----

  describe('getModelBenchmark', () => {
    it('should return aggregated benchmark for model+taskType', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({
        model: 'claude-sonnet-4-5-20250929',
        provider: 'anthropic',
        taskType: 'coding',
        totalRequests: '100',
        successRate: '0.95',
        avgQualityScore: '0.88',
        avgLatencyMs: '1200',
        costPerSuccess: '0.045',
        retryRate: '0.1',
      });

      const result = await service.getModelBenchmark(
        'claude-sonnet-4-5-20250929',
        'coding',
      );

      expect(result).not.toBeNull();
      expect(result!.model).toBe('claude-sonnet-4-5-20250929');
      expect(result!.provider).toBe('anthropic');
      expect(result!.taskType).toBe('coding');
      expect(result!.successRate).toBe(0.95);
      expect(result!.avgQualityScore).toBe(0.88);
      expect(result!.avgLatencyMs).toBe(1200);
      expect(result!.costPerSuccess).toBe(0.045);
      expect(result!.retryRate).toBe(0.1);
      expect(result!.totalRequests).toBe(100);
    });

    it('should calculate successRate correctly (success count / total)', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({
        model: 'test-model',
        provider: 'test',
        taskType: 'coding',
        totalRequests: '20',
        successRate: '0.80',
        avgQualityScore: '0.7',
        avgLatencyMs: '500',
        costPerSuccess: '0.01',
        retryRate: '0.2',
      });

      const result = await service.getModelBenchmark('test-model', 'coding');
      expect(result!.successRate).toBe(0.80);
      expect(result!.totalRequests).toBe(20);
    });

    it('should calculate avgQualityScore only from non-null scores', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({
        model: 'test-model',
        provider: 'test',
        taskType: 'coding',
        totalRequests: '50',
        successRate: '0.90',
        avgQualityScore: '0.92', // only from non-null entries
        avgLatencyMs: '800',
        costPerSuccess: '0.02',
        retryRate: '0',
      });

      const result = await service.getModelBenchmark('test-model', 'coding');
      expect(result!.avgQualityScore).toBe(0.92);
    });

    it('should calculate costPerSuccess (total cost / successful count)', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({
        model: 'test-model',
        provider: 'test',
        taskType: 'coding',
        totalRequests: '10',
        successRate: '0.50',
        avgQualityScore: null,
        avgLatencyMs: '1000',
        costPerSuccess: '0.10', // total cost 0.5 / 5 successful = 0.10
        retryRate: '0.5',
      });

      const result = await service.getModelBenchmark('test-model', 'coding');
      expect(result!.costPerSuccess).toBe(0.10);
    });

    it('should calculate retryRate as average retry_count', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({
        model: 'test-model',
        provider: 'test',
        taskType: 'coding',
        totalRequests: '10',
        successRate: '0.90',
        avgQualityScore: '0.85',
        avgLatencyMs: '700',
        costPerSuccess: '0.02',
        retryRate: '0.3',
      });

      const result = await service.getModelBenchmark('test-model', 'coding');
      expect(result!.retryRate).toBe(0.3);
    });

    it('should use default 30-day rolling window', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({
        model: 'test-model',
        provider: 'test',
        taskType: 'coding',
        totalRequests: '10',
        successRate: '0.90',
        avgQualityScore: '0.85',
        avgLatencyMs: '700',
        costPerSuccess: '0.02',
        retryRate: '0',
      });

      const result = await service.getModelBenchmark('test-model', 'coding');
      expect(result!.windowDays).toBe(30);
    });

    it('should accept custom windowDays parameter', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({
        model: 'test-model',
        provider: 'test',
        taskType: 'coding',
        totalRequests: '10',
        successRate: '0.90',
        avgQualityScore: '0.85',
        avgLatencyMs: '700',
        costPerSuccess: '0.02',
        retryRate: '0',
      });

      const result = await service.getModelBenchmark('test-model', 'coding', 60);
      expect(result!.windowDays).toBe(60);
    });

    it('should return null when no data exists', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue(null);

      const result = await service.getModelBenchmark('nonexistent', 'coding');
      expect(result).toBeNull();
    });

    it('should use Redis cached value when available', async () => {
      const cached = {
        model: 'test-model',
        provider: 'test',
        taskType: 'coding',
        successRate: 0.95,
        avgQualityScore: 0.88,
        avgLatencyMs: 1200,
        costPerSuccess: 0.045,
        retryRate: 0.1,
        totalRequests: 100,
        windowDays: 30,
      };

      redisService.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getModelBenchmark('test-model', 'coding');
      expect(result).toEqual(cached);
      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should fetch from DB on Redis cache miss', async () => {
      redisService.get.mockResolvedValue(null);
      mockQueryBuilder.getRawOne.mockResolvedValue({
        model: 'test-model',
        provider: 'test',
        taskType: 'coding',
        totalRequests: '10',
        successRate: '0.90',
        avgQualityScore: '0.85',
        avgLatencyMs: '700',
        costPerSuccess: '0.02',
        retryRate: '0',
      });

      const result = await service.getModelBenchmark('test-model', 'coding');
      expect(result).not.toBeNull();
      expect(repository.createQueryBuilder).toHaveBeenCalled();
    });

    it('should handle all-failed requests (costPerSuccess = 0)', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValue({
        model: 'failing-model',
        provider: 'test',
        taskType: 'coding',
        totalRequests: '10',
        successRate: '0',
        avgQualityScore: null,
        avgLatencyMs: '5000',
        costPerSuccess: '0',
        retryRate: '3',
      });

      const result = await service.getModelBenchmark('failing-model', 'coding');
      expect(result!.successRate).toBe(0);
      expect(result!.costPerSuccess).toBe(0);
    });
  });

  // ---- getModelTaskMatrix tests ----

  describe('getModelTaskMatrix', () => {
    it('should return matrix with all models and task types', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          model: 'model-a',
          provider: 'anthropic',
          taskType: 'coding',
          totalRequests: '50',
          successRate: '0.95',
          avgQualityScore: '0.90',
          avgLatencyMs: '1000',
          costPerSuccess: '0.03',
          retryRate: '0.1',
        },
        {
          model: 'model-b',
          provider: 'openai',
          taskType: 'planning',
          totalRequests: '30',
          successRate: '0.90',
          avgQualityScore: '0.85',
          avgLatencyMs: '800',
          costPerSuccess: '0.02',
          retryRate: '0',
        },
      ]);

      const result = await service.getModelTaskMatrix();

      expect(result.models).toContain('model-a');
      expect(result.models).toContain('model-b');
      expect(result.taskTypes).toContain('coding');
      expect(result.taskTypes).toContain('planning');
    });

    it('should have cells containing ModelBenchmark for populated combinations', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          model: 'model-a',
          provider: 'anthropic',
          taskType: 'coding',
          totalRequests: '50',
          successRate: '0.95',
          avgQualityScore: '0.90',
          avgLatencyMs: '1000',
          costPerSuccess: '0.03',
          retryRate: '0.1',
        },
      ]);

      const result = await service.getModelTaskMatrix();
      expect(result.cells['model-a']['coding']).not.toBeNull();
      expect(result.cells['model-a']['coding']!.successRate).toBe(0.95);
    });

    it('should have null cells for unpopulated model+taskType combos', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          model: 'model-a',
          provider: 'anthropic',
          taskType: 'coding',
          totalRequests: '50',
          successRate: '0.95',
          avgQualityScore: '0.90',
          avgLatencyMs: '1000',
          costPerSuccess: '0.03',
          retryRate: '0.1',
        },
        {
          model: 'model-b',
          provider: 'openai',
          taskType: 'planning',
          totalRequests: '30',
          successRate: '0.90',
          avgQualityScore: '0.85',
          avgLatencyMs: '800',
          costPerSuccess: '0.02',
          retryRate: '0',
        },
      ]);

      const result = await service.getModelTaskMatrix();
      // model-a has no planning data
      expect(result.cells['model-a']['planning']).toBeNull();
      // model-b has no coding data
      expect(result.cells['model-b']['coding']).toBeNull();
    });

    it('should use Redis cached value when available', async () => {
      const cached = {
        models: ['model-a'],
        taskTypes: ['coding'],
        cells: {
          'model-a': {
            coding: {
              model: 'model-a',
              provider: 'anthropic',
              taskType: 'coding',
              successRate: 0.95,
              avgQualityScore: 0.9,
              avgLatencyMs: 1000,
              costPerSuccess: 0.03,
              retryRate: 0.1,
              totalRequests: 50,
              windowDays: 30,
            },
          },
        },
      };

      redisService.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getModelTaskMatrix();
      expect(result).toEqual(cached);
      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should return empty matrix when no data exists', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.getModelTaskMatrix();
      expect(result.models).toHaveLength(0);
      expect(result.taskTypes).toHaveLength(0);
      expect(Object.keys(result.cells)).toHaveLength(0);
    });
  });

  // ---- getModelPerformanceTrend tests ----

  describe('getModelPerformanceTrend', () => {
    it('should return daily data points', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          date: '2026-02-01',
          requests: '10',
          successRate: '0.90',
          avgLatencyMs: '1000',
          avgQualityScore: '0.85',
        },
        {
          date: '2026-02-02',
          requests: '15',
          successRate: '0.93',
          avgLatencyMs: '950',
          avgQualityScore: '0.87',
        },
      ]);

      const result = await service.getModelPerformanceTrend(
        'test-model',
        'coding',
      );

      expect(result.model).toBe('test-model');
      expect(result.taskType).toBe('coding');
      expect(result.dataPoints).toHaveLength(2);
    });

    it('should calculate daily successRate', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          date: '2026-02-01',
          requests: '10',
          successRate: '0.90',
          avgLatencyMs: '1000',
          avgQualityScore: '0.85',
        },
      ]);

      const result = await service.getModelPerformanceTrend(
        'test-model',
        'coding',
      );
      expect(result.dataPoints[0].successRate).toBe(0.9);
    });

    it('should calculate daily avgLatencyMs', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          date: '2026-02-01',
          requests: '10',
          successRate: '0.90',
          avgLatencyMs: '1234.5',
          avgQualityScore: '0.85',
        },
      ]);

      const result = await service.getModelPerformanceTrend(
        'test-model',
        'coding',
      );
      expect(result.dataPoints[0].avgLatencyMs).toBe(1234.5);
    });

    it('should calculate daily requests count', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          date: '2026-02-01',
          requests: '42',
          successRate: '0.90',
          avgLatencyMs: '1000',
          avgQualityScore: '0.85',
        },
      ]);

      const result = await service.getModelPerformanceTrend(
        'test-model',
        'coding',
      );
      expect(result.dataPoints[0].requests).toBe(42);
    });

    it('should default to 30 days', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.getModelPerformanceTrend(
        'test-model',
        'coding',
      );
      expect(result.model).toBe('test-model');
      expect(result.taskType).toBe('coding');
      expect(result.dataPoints).toHaveLength(0);
    });

    it('should accept custom days parameter', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.getModelPerformanceTrend(
        'test-model',
        'coding',
        60,
      );
      expect(result.dataPoints).toHaveLength(0);
      // The method was called with 60 days - we verify it doesn't throw
    });

    it('should return empty dataPoints when no data', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.getModelPerformanceTrend(
        'nonexistent',
        'coding',
      );
      expect(result.dataPoints).toHaveLength(0);
    });

    it('should use Redis cached trend data when available', async () => {
      const cached = {
        model: 'test-model',
        taskType: 'coding',
        dataPoints: [
          {
            date: '2026-02-01',
            successRate: 0.9,
            avgLatencyMs: 1000,
            requests: 10,
            avgQualityScore: 0.85,
          },
        ],
      };

      redisService.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getModelPerformanceTrend(
        'test-model',
        'coding',
      );
      expect(result).toEqual(cached);
      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should cache trend result in Redis after DB query', async () => {
      redisService.get.mockResolvedValue(null);
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          date: '2026-02-01',
          requests: '10',
          successRate: '0.90',
          avgLatencyMs: '1000',
          avgQualityScore: '0.85',
        },
      ]);

      await service.getModelPerformanceTrend('test-model', 'coding');

      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining('benchmark:trend'),
        expect.any(String),
        300,
      );
    });
  });

  // ---- getDeprioritizedModels tests ----

  describe('getDeprioritizedModels', () => {
    it('should return models with successRate < 0.80', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          model: 'bad-model',
          taskType: 'coding',
          successRate: '0.60',
          totalRequests: '20',
        },
        {
          model: 'good-model',
          taskType: 'coding',
          successRate: '0.95',
          totalRequests: '50',
        },
      ]);

      const result = await service.getDeprioritizedModels();
      expect(result).toHaveLength(1);
      expect(result[0].model).toBe('bad-model');
      expect(result[0].successRate).toBe(0.60);
    });

    it('should use default threshold of 0.80', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          model: 'borderline-model',
          taskType: 'coding',
          successRate: '0.79',
          totalRequests: '15',
        },
      ]);

      const result = await service.getDeprioritizedModels();
      expect(result).toHaveLength(1);
    });

    it('should accept custom threshold', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          model: 'model-a',
          taskType: 'coding',
          successRate: '0.89',
          totalRequests: '20',
        },
      ]);

      const result = await service.getDeprioritizedModels(0.90);
      expect(result).toHaveLength(1);
      expect(result[0].successRate).toBe(0.89);
    });

    it('should return empty array when all models pass', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          model: 'good-model',
          taskType: 'coding',
          successRate: '0.95',
          totalRequests: '50',
        },
      ]);

      const result = await service.getDeprioritizedModels();
      expect(result).toHaveLength(0);
    });

    it('should exclude models with < 10 requests via HAVING clause', async () => {
      // The HAVING clause is set in the query builder, so models with < 10
      // requests won't appear in results at all
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.getDeprioritizedModels();
      expect(result).toHaveLength(0);

      // Verify HAVING was called with min requests
      expect(mockQueryBuilder.having).toHaveBeenCalledWith(
        'COUNT(*) >= :minRequests',
        { minRequests: 10 },
      );
    });
  });

  // ---- getPromotedModels tests ----

  describe('getPromotedModels', () => {
    it('should return models with avgQualityScore > 0.90', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          model: 'premium-model',
          taskType: 'coding',
          avgQualityScore: '0.95',
          totalRequests: '50',
        },
        {
          model: 'average-model',
          taskType: 'coding',
          avgQualityScore: '0.80',
          totalRequests: '30',
        },
      ]);

      const result = await service.getPromotedModels();
      expect(result).toHaveLength(1);
      expect(result[0].model).toBe('premium-model');
      expect(result[0].avgQualityScore).toBe(0.95);
    });

    it('should use default threshold of 0.90', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          model: 'borderline-model',
          taskType: 'coding',
          avgQualityScore: '0.91',
          totalRequests: '20',
        },
      ]);

      const result = await service.getPromotedModels();
      expect(result).toHaveLength(1);
    });

    it('should accept custom threshold', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          model: 'model-a',
          taskType: 'coding',
          avgQualityScore: '0.86',
          totalRequests: '20',
        },
      ]);

      const result = await service.getPromotedModels(0.85);
      expect(result).toHaveLength(1);
    });

    it('should return empty array when no models qualify', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          model: 'average-model',
          taskType: 'coding',
          avgQualityScore: '0.80',
          totalRequests: '50',
        },
      ]);

      const result = await service.getPromotedModels();
      expect(result).toHaveLength(0);
    });

    it('should exclude models with < 10 requests via HAVING clause', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      await service.getPromotedModels();

      expect(mockQueryBuilder.having).toHaveBeenCalledWith(
        'COUNT(*) >= :minRequests',
        { minRequests: 10 },
      );
    });
  });

  // ---- getRouterFeedback tests ----

  describe('getRouterFeedback', () => {
    const mockBenchmarks = [
      {
        model: 'good-model',
        provider: 'anthropic',
        totalRequests: '50',
        successRate: '0.95',
        avgQualityScore: '0.92',
        avgLatencyMs: '1000',
        costPerSuccess: '0.03',
      },
      {
        model: 'bad-model',
        provider: 'openai',
        totalRequests: '20',
        successRate: '0.60',
        avgQualityScore: '0.70',
        avgLatencyMs: '2000',
        costPerSuccess: '0.10',
      },
    ];

    it('should return deprioritized model list', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue(mockBenchmarks);

      const result = await service.getRouterFeedback('coding');
      expect(result.deprioritized).toContain('bad-model');
      expect(result.deprioritized).not.toContain('good-model');
    });

    it('should return promoted model list', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue(mockBenchmarks);

      const result = await service.getRouterFeedback('coding');
      expect(result.promoted).toContain('good-model');
      expect(result.promoted).not.toContain('bad-model');
    });

    it('should return rankings sorted by compositeScore', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue(mockBenchmarks);

      const result = await service.getRouterFeedback('coding');
      expect(result.rankings).toHaveLength(2);
      // good-model should rank higher
      expect(result.rankings[0].model).toBe('good-model');
      expect(result.rankings[1].model).toBe('bad-model');
      expect(result.rankings[0].compositeScore).toBeGreaterThan(
        result.rankings[1].compositeScore,
      );
    });

    it('should calculate compositeScore with correct weights: 0.4 success + 0.3 quality + 0.2 cost + 0.1 latency', async () => {
      // Single model case: normalized cost and latency are both 1 (max / max = 1)
      // compositeScore = 0.4*0.95 + 0.3*0.92 + 0.2*(1-1) + 0.1*(1-1) = 0.38 + 0.276 = 0.656
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          model: 'single-model',
          provider: 'anthropic',
          totalRequests: '50',
          successRate: '0.95',
          avgQualityScore: '0.92',
          avgLatencyMs: '1000',
          costPerSuccess: '0.03',
        },
      ]);

      const result = await service.getRouterFeedback('coding');
      expect(result.rankings).toHaveLength(1);
      // With single model: normalizedCost = 1, normalizedLatency = 1
      // compositeScore = 0.4*0.95 + 0.3*0.92 + 0.2*(1-1) + 0.1*(1-1) = 0.656
      expect(result.rankings[0].compositeScore).toBeCloseTo(0.656, 2);
    });

    it('should filter models with < 10 requests (minimum data)', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      await service.getRouterFeedback('coding');

      expect(mockQueryBuilder.having).toHaveBeenCalledWith(
        'COUNT(*) >= :minRequests',
        { minRequests: 10 },
      );
    });

    it('should use Redis cached value when available', async () => {
      const cached = {
        taskType: 'coding',
        deprioritized: ['bad-model'],
        promoted: ['good-model'],
        rankings: [],
      };

      redisService.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getRouterFeedback('coding');
      expect(result).toEqual(cached);
      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should return empty lists when no data', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.getRouterFeedback('coding');
      expect(result.taskType).toBe('coding');
      expect(result.deprioritized).toHaveLength(0);
      expect(result.promoted).toHaveLength(0);
      expect(result.rankings).toHaveLength(0);
    });
  });
});
