/**
 * ModelRegistryController Tests
 *
 * Story 13-2: Model Registry
 *
 * Unit tests for model registry REST API endpoints.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ModelRegistryController } from '../controllers/model-registry.controller';
import { ModelRegistryService } from '../services/model-registry.service';
import { ModelDefinition } from '../../../database/entities/model-definition.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../../../common/guards/role.guard';

describe('ModelRegistryController', () => {
  let controller: ModelRegistryController;
  let mockService: any;

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
    modelId: 'gpt-4o',
    provider: 'openai',
    displayName: 'GPT-4o',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    supportsEmbedding: false,
    inputPricePer1M: 2.5,
    outputPricePer1M: 10.0,
    cachedInputPricePer1M: 1.25,
    avgLatencyMs: 0,
    qualityTier: 'standard',
    suitableFor: ['coding', 'planning', 'review', 'simple_chat'],
    available: true,
    deprecationDate: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    mockService = {
      findAll: jest.fn().mockResolvedValue([mockModel, mockModel2]),
      findByModelId: jest.fn().mockResolvedValue(mockModel),
      findByProvider: jest.fn().mockResolvedValue([mockModel]),
      findSuitableForTask: jest.fn().mockResolvedValue([mockModel, mockModel2]),
      create: jest.fn().mockResolvedValue(mockModel),
      update: jest.fn().mockResolvedValue(mockModel),
      deprecate: jest.fn().mockResolvedValue({ ...mockModel, deprecationDate: new Date('2026-12-01') }),
      setAvailability: jest.fn().mockResolvedValue({ ...mockModel, available: false }),
      getModelPricing: jest.fn().mockResolvedValue({ inputPer1M: 3.0, outputPer1M: 15.0, cachedInputPer1M: 0.3 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ModelRegistryController],
      providers: [
        {
          provide: ModelRegistryService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ModelRegistryController>(ModelRegistryController);
  });

  describe('GET /api/model-registry/models', () => {
    it('should return all models', async () => {
      const result = await controller.listModels({});
      expect(result).toEqual([mockModel, mockModel2]);
      expect(mockService.findAll).toHaveBeenCalled();
    });

    it('should pass query params as filters correctly', async () => {
      await controller.listModels({
        provider: 'anthropic',
        qualityTier: 'standard',
        available: true,
      });
      expect(mockService.findAll).toHaveBeenCalledWith({
        provider: 'anthropic',
        qualityTier: 'standard',
        available: true,
        taskType: undefined,
        supportsTools: undefined,
        supportsVision: undefined,
        supportsEmbedding: undefined,
      });
    });
  });

  describe('GET /api/model-registry/models/:modelId', () => {
    it('should return single model', async () => {
      const result = await controller.getModel('claude-sonnet-4-20250514');
      expect(result).toEqual(mockModel);
      expect(mockService.findByModelId).toHaveBeenCalledWith('claude-sonnet-4-20250514');
    });

    it('should return 404 for unknown model', async () => {
      mockService.findByModelId.mockResolvedValue(null);
      await expect(controller.getModel('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET /api/model-registry/models/task/:taskType', () => {
    it('should return suitable models', async () => {
      const result = await controller.getModelsForTask('coding');
      expect(result).toEqual([mockModel, mockModel2]);
      expect(mockService.findSuitableForTask).toHaveBeenCalledWith('coding');
    });

    it('should return 400 for invalid task type', async () => {
      await expect(controller.getModelsForTask('invalid_type')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('GET /api/model-registry/models/provider/:provider', () => {
    it('should return provider models', async () => {
      const result = await controller.getModelsByProvider('anthropic');
      expect(result).toEqual([mockModel]);
      expect(mockService.findByProvider).toHaveBeenCalledWith('anthropic');
    });
  });

  describe('POST /api/model-registry/models', () => {
    it('should create model', async () => {
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

      const result = await controller.createModel(dto as any);
      expect(mockService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockModel);
    });

    it('should return 409 for duplicate modelId', async () => {
      mockService.create.mockRejectedValue(
        new ConflictException('Model already exists'),
      );
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

      await expect(controller.createModel(dto as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('PATCH /api/model-registry/models/:modelId', () => {
    it('should update model', async () => {
      const dto = { displayName: 'Updated Name' };
      const result = await controller.updateModel('claude-sonnet-4-20250514', dto);
      expect(mockService.update).toHaveBeenCalledWith('claude-sonnet-4-20250514', dto);
      expect(result).toEqual(mockModel);
    });

    it('should return 404 for non-existent model', async () => {
      mockService.update.mockRejectedValue(
        new NotFoundException('Model not found'),
      );
      await expect(
        controller.updateModel('nonexistent', { displayName: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('POST /api/model-registry/models/:modelId/deprecate', () => {
    it('should set deprecation date', async () => {
      const result = await controller.deprecateModel('claude-sonnet-4-20250514', {
        deprecationDate: '2026-12-01',
      });
      expect(mockService.deprecate).toHaveBeenCalledWith(
        'claude-sonnet-4-20250514',
        expect.any(Date),
      );
      expect(result.deprecationDate).toBeDefined();
    });

    it('should return 400 for missing deprecation date', async () => {
      await expect(
        controller.deprecateModel('claude-sonnet-4-20250514', { deprecationDate: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return 400 for invalid date format', async () => {
      await expect(
        controller.deprecateModel('claude-sonnet-4-20250514', {
          deprecationDate: 'not-a-date',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('PATCH /api/model-registry/models/:modelId/availability', () => {
    it('should toggle availability', async () => {
      const result = await controller.setAvailability('claude-sonnet-4-20250514', {
        available: false,
      });
      expect(mockService.setAvailability).toHaveBeenCalledWith(
        'claude-sonnet-4-20250514',
        false,
      );
      expect(result.available).toBe(false);
    });

    it('should return 400 for missing available field', async () => {
      await expect(
        controller.setAvailability('claude-sonnet-4-20250514', {} as any),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
