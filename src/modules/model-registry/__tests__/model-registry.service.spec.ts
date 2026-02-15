/**
 * ModelRegistryService Tests
 *
 * Story 13-2: Model Registry
 *
 * Unit tests for CRUD operations, filtering, task-based lookup,
 * pricing, and idempotent seeding.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ModelRegistryService } from '../services/model-registry.service';
import { ModelDefinition, TaskType } from '../../../database/entities/model-definition.entity';

// Mock createQueryBuilder
const createMockQueryBuilder = (result: any[] = []) => ({
  andWhere: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(result),
});

describe('ModelRegistryService', () => {
  let service: ModelRegistryService;
  let mockRepository: any;
  let mockQueryBuilder: any;

  const mockModel: Partial<ModelDefinition> = {
    id: 'uuid-1',
    modelId: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4',
    contextWindow: 200000,
    maxOutputTokens: 16000,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    supportsEmbedding: false,
    inputPricePer1M: 3.0,
    outputPricePer1M: 15.0,
    cachedInputPricePer1M: 0.3,
    avgLatencyMs: 0,
    qualityTier: 'standard',
    suitableFor: ['coding', 'planning', 'review', 'simple_chat'],
    available: true,
    deprecationDate: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const mockModel2: Partial<ModelDefinition> = {
    id: 'uuid-2',
    modelId: 'gpt-4o-mini',
    provider: 'openai',
    displayName: 'GPT-4o Mini',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    supportsEmbedding: false,
    inputPricePer1M: 0.15,
    outputPricePer1M: 0.6,
    cachedInputPricePer1M: 0.075,
    avgLatencyMs: 0,
    qualityTier: 'economy',
    suitableFor: ['summarization', 'simple_chat'],
    available: true,
    deprecationDate: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const mockEmbeddingModel: Partial<ModelDefinition> = {
    id: 'uuid-3',
    modelId: 'text-embedding-3-small',
    provider: 'openai',
    displayName: 'OpenAI Embedding Small',
    contextWindow: 8191,
    maxOutputTokens: 0,
    supportsTools: false,
    supportsVision: false,
    supportsStreaming: false,
    supportsEmbedding: true,
    inputPricePer1M: 0.02,
    outputPricePer1M: 0.0,
    cachedInputPricePer1M: null,
    avgLatencyMs: 0,
    qualityTier: 'economy',
    suitableFor: ['embedding'],
    available: true,
    deprecationDate: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    mockQueryBuilder = createMockQueryBuilder([mockModel, mockModel2]);

    mockRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((data: any) => ({ ...data })),
      save: jest.fn((entity: any) => Promise.resolve({ id: 'uuid-new', ...entity })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModelRegistryService,
        {
          provide: getRepositoryToken(ModelDefinition),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ModelRegistryService>(ModelRegistryService);
  });

  describe('findAll', () => {
    it('should return all models when no filters', async () => {
      const result = await service.findAll();
      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('model');
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('model.provider', 'ASC');
      expect(mockQueryBuilder.addOrderBy).toHaveBeenCalledWith('model.modelId', 'ASC');
      expect(mockQueryBuilder.getMany).toHaveBeenCalled();
      expect(result).toEqual([mockModel, mockModel2]);
    });

    it('should filter by provider correctly', async () => {
      await service.findAll({ provider: 'anthropic' });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'model.provider = :provider',
        { provider: 'anthropic' },
      );
    });

    it('should filter by qualityTier correctly', async () => {
      await service.findAll({ qualityTier: 'premium' });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'model.qualityTier = :qualityTier',
        { qualityTier: 'premium' },
      );
    });

    it('should filter by available status', async () => {
      await service.findAll({ available: true });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'model.available = :available',
        { available: true },
      );
    });

    it('should filter by taskType using JSON contains query', async () => {
      await service.findAll({ taskType: 'coding' });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'model.suitableFor @> :taskType',
        { taskType: JSON.stringify(['coding']) },
      );
    });

    it('should combine multiple filters correctly', async () => {
      await service.findAll({
        provider: 'anthropic',
        qualityTier: 'standard',
        available: true,
        taskType: 'coding',
      });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledTimes(4);
    });

    it('should filter by supportsTools', async () => {
      await service.findAll({ supportsTools: true });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'model.supportsTools = :supportsTools',
        { supportsTools: true },
      );
    });

    it('should filter by supportsVision', async () => {
      await service.findAll({ supportsVision: false });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'model.supportsVision = :supportsVision',
        { supportsVision: false },
      );
    });

    it('should filter by supportsEmbedding', async () => {
      await service.findAll({ supportsEmbedding: true });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'model.supportsEmbedding = :supportsEmbedding',
        { supportsEmbedding: true },
      );
    });
  });

  describe('findByModelId', () => {
    it('should return model when found', async () => {
      mockRepository.findOne.mockResolvedValue(mockModel);
      const result = await service.findByModelId('claude-sonnet-4-20250514');
      expect(result).toEqual(mockModel);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { modelId: 'claude-sonnet-4-20250514' },
      });
    });

    it('should return null when model not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      const result = await service.findByModelId('nonexistent-model');
      expect(result).toBeNull();
    });
  });

  describe('findByProvider', () => {
    it('should return models for given provider', async () => {
      mockRepository.find.mockResolvedValue([mockModel]);
      const result = await service.findByProvider('anthropic');
      expect(result).toEqual([mockModel]);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { provider: 'anthropic' },
        order: { modelId: 'ASC' },
      });
    });
  });

  describe('findSuitableForTask', () => {
    it('should return models ordered by input price ascending', async () => {
      const qb = createMockQueryBuilder([mockModel2, mockModel]);
      mockRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findSuitableForTask('coding');
      expect(qb.where).toHaveBeenCalledWith('model.available = :available', { available: true });
      expect(qb.andWhere).toHaveBeenCalledWith('model.suitableFor @> :taskType', {
        taskType: JSON.stringify(['coding']),
      });
      expect(qb.orderBy).toHaveBeenCalledWith('model.inputPricePer1M', 'ASC');
      expect(result).toEqual([mockModel2, mockModel]);
    });

    it('should only return available models', async () => {
      const qb = createMockQueryBuilder([]);
      mockRepository.createQueryBuilder.mockReturnValue(qb);

      await service.findSuitableForTask('embedding');
      expect(qb.where).toHaveBeenCalledWith('model.available = :available', { available: true });
    });
  });

  describe('create', () => {
    it('should save new model definition to database', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      const dto = {
        modelId: 'new-model',
        provider: 'anthropic',
        displayName: 'New Model',
        contextWindow: 100000,
        maxOutputTokens: 8192,
        inputPricePer1M: 5.0,
        outputPricePer1M: 25.0,
        qualityTier: 'standard' as const,
      };

      const result = await service.create(dto as any);
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw ConflictException for duplicate modelId', async () => {
      mockRepository.findOne.mockResolvedValue(mockModel);
      const dto = {
        modelId: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
        displayName: 'Duplicate',
        contextWindow: 100000,
        maxOutputTokens: 8192,
        inputPricePer1M: 5.0,
        outputPricePer1M: 25.0,
        qualityTier: 'standard' as const,
      };

      await expect(service.create(dto as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should modify existing model definition', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockModel });
      const dto = { displayName: 'Updated Name' };

      const result = await service.update('claude-sonnet-4-20250514', dto);
      expect(mockRepository.save).toHaveBeenCalled();
      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.displayName).toBe('Updated Name');
    });

    it('should throw NotFoundException for non-existent modelId', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.update('nonexistent', { displayName: 'Test' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should only change provided fields with partial update', async () => {
      const original = { ...mockModel };
      mockRepository.findOne.mockResolvedValue(original);
      const dto = { inputPricePer1M: 5.0 };

      await service.update('claude-sonnet-4-20250514', dto);
      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.inputPricePer1M).toBe(5.0);
      expect(savedEntity.displayName).toBe('Claude Sonnet 4'); // unchanged
      expect(savedEntity.provider).toBe('anthropic'); // unchanged
    });
  });

  describe('deprecate', () => {
    it('should set deprecationDate on model', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockModel });
      const deprecationDate = new Date('2026-12-01');

      const result = await service.deprecate('claude-sonnet-4-20250514', deprecationDate);
      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.deprecationDate).toEqual(deprecationDate);
    });

    it('should throw NotFoundException for non-existent model', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.deprecate('nonexistent', new Date())).rejects.toThrow(NotFoundException);
    });
  });

  describe('setAvailability', () => {
    it('should toggle available flag', async () => {
      mockRepository.findOne.mockResolvedValue({ ...mockModel, available: true });

      await service.setAvailability('claude-sonnet-4-20250514', false);
      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.available).toBe(false);
    });

    it('should throw NotFoundException for non-existent model', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.setAvailability('nonexistent', false)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getModelPricing', () => {
    it('should return pricing in ModelPricing format', async () => {
      mockRepository.findOne.mockResolvedValue(mockModel);

      const pricing = await service.getModelPricing('claude-sonnet-4-20250514');
      expect(pricing).toEqual({
        inputPer1M: 3.0,
        outputPer1M: 15.0,
        cachedInputPer1M: 0.3,
      });
    });

    it('should return pricing without cachedInputPer1M when null', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockModel,
        cachedInputPricePer1M: null,
      });

      const pricing = await service.getModelPricing('claude-sonnet-4-20250514');
      expect(pricing).toEqual({
        inputPer1M: 3.0,
        outputPer1M: 15.0,
      });
      expect(pricing.cachedInputPer1M).toBeUndefined();
    });

    it('should throw NotFoundException for non-existent model', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.getModelPricing('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('seedDefaults', () => {
    it('should create all default models when none exist', async () => {
      // No models exist yet
      mockRepository.find.mockResolvedValue([]);

      await service.seedDefaults();

      // Should have queried for existing modelIds
      expect(mockRepository.find).toHaveBeenCalledWith({ select: ['modelId'] });
      // Should have created all 13 models in a batch
      expect(mockRepository.create).toHaveBeenCalledTimes(13);
      // Batch save with array of entities
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should be idempotent (does not duplicate on re-run)', async () => {
      // All models already exist - return all modelIds
      const existingModelIds = [
        { modelId: 'claude-opus-4-20250514' },
        { modelId: 'claude-sonnet-4-20250514' },
        { modelId: 'claude-haiku-3-5-20241022' },
        { modelId: 'gpt-4o' },
        { modelId: 'gpt-4o-mini' },
        { modelId: 'gpt-4-turbo' },
        { modelId: 'gemini-2.0-flash' },
        { modelId: 'gemini-2.0-pro' },
        { modelId: 'deepseek-chat' },
        { modelId: 'deepseek-reasoner' },
        { modelId: 'text-embedding-3-small' },
        { modelId: 'text-embedding-3-large' },
        { modelId: 'text-embedding-004' },
      ];
      mockRepository.find.mockResolvedValue(existingModelIds);

      await service.seedDefaults();

      // Should NOT have created any models
      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should not overwrite manually updated models (partial seed)', async () => {
      // Only the first model exists
      mockRepository.find.mockResolvedValue([{ modelId: 'claude-opus-4-20250514' }]);

      await service.seedDefaults();

      // Should have created 12 new models (skipping the existing one)
      expect(mockRepository.create).toHaveBeenCalledTimes(12);
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });
  });
});
