/**
 * ModelPreferencesController Tests
 *
 * Story 13-9: User Model Preferences
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ModelPreferencesController } from './model-preferences.controller';
import { ModelPreferencesService } from '../services/model-preferences.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../../../common/guards/role.guard';

describe('ModelPreferencesController', () => {
  let controller: ModelPreferencesController;
  let service: ModelPreferencesService;

  const workspaceId = 'test-workspace-id';

  const mockPreferencesResponse = {
    workspaceId,
    modelPreferencesEnabled: false,
    preset: 'balanced',
    taskOverrides: {},
    enabledProviders: [],
    providerPriority: [],
    availableModels: [],
    availableProviders: [],
    estimatedMonthlyCost: null,
  };

  const mockRouterPreferences = {
    preset: 'balanced' as const,
    taskOverrides: {},
    enabledProviders: [],
    providerPriority: [],
  };

  const mockEstimatedCost = {
    economyEstimate: 15,
    balancedEstimate: 100,
    qualityEstimate: 300,
    currentEstimate: 100,
  };

  const mockModelPreferencesService = {
    getPreferences: jest.fn(),
    updatePreferences: jest.fn(),
    getRouterPreferences: jest.fn(),
    getAvailableModels: jest.fn(),
    getEstimatedCost: jest.fn(),
    validateModelSelection: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ModelPreferencesController],
      providers: [
        {
          provide: ModelPreferencesService,
          useValue: mockModelPreferencesService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ModelPreferencesController>(ModelPreferencesController);
    service = module.get<ModelPreferencesService>(ModelPreferencesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /model-preferences', () => {
    it('should return 200 with ModelPreferencesResponse', async () => {
      mockModelPreferencesService.getPreferences.mockResolvedValue(mockPreferencesResponse);

      const result = await controller.getPreferences(workspaceId);

      expect(result).toEqual(mockPreferencesResponse);
      expect(mockModelPreferencesService.getPreferences).toHaveBeenCalledWith(workspaceId);
    });

    it('should call service with correct workspaceId', async () => {
      mockModelPreferencesService.getPreferences.mockResolvedValue(mockPreferencesResponse);

      await controller.getPreferences('another-workspace');

      expect(mockModelPreferencesService.getPreferences).toHaveBeenCalledWith('another-workspace');
    });
  });

  describe('PUT /model-preferences', () => {
    const mockRequest = { user: { id: 'user-123' } };

    it('should return 200 with updated preferences', async () => {
      const updatedResponse = { ...mockPreferencesResponse, preset: 'economy' };
      mockModelPreferencesService.updatePreferences.mockResolvedValue(updatedResponse);

      const result = await controller.updatePreferences(
        workspaceId,
        { preset: 'economy' },
        mockRequest,
      );

      expect(result.preset).toBe('economy');
    });

    it('should call service with UpdateModelPreferencesDto', async () => {
      mockModelPreferencesService.updatePreferences.mockResolvedValue(mockPreferencesResponse);
      const dto = { preset: 'quality', modelPreferencesEnabled: true };

      await controller.updatePreferences(workspaceId, dto, mockRequest);

      expect(mockModelPreferencesService.updatePreferences).toHaveBeenCalledWith(
        workspaceId,
        dto,
        'user-123',
      );
    });

    it('should pass userId from request', async () => {
      mockModelPreferencesService.updatePreferences.mockResolvedValue(mockPreferencesResponse);

      await controller.updatePreferences(
        workspaceId,
        { preset: 'economy' },
        { user: { id: 'admin-456' } },
      );

      expect(mockModelPreferencesService.updatePreferences).toHaveBeenCalledWith(
        workspaceId,
        { preset: 'economy' },
        'admin-456',
      );
    });
  });

  describe('GET /model-preferences/router', () => {
    const mockResponse = {
      status: jest.fn().mockReturnThis(),
    } as any;

    it('should return 200 with RouterPreferences', async () => {
      mockModelPreferencesService.getRouterPreferences.mockResolvedValue(mockRouterPreferences);

      const result = await controller.getRouterPreferences(workspaceId, mockResponse);

      expect(result).toEqual(mockRouterPreferences);
    });

    it('should return 204 No Content when preferences disabled', async () => {
      mockModelPreferencesService.getRouterPreferences.mockResolvedValue(null);

      const result = await controller.getRouterPreferences(workspaceId, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(204);
      expect(result).toBeUndefined();
    });
  });

  describe('GET /model-preferences/available-models', () => {
    it('should return 200 with AvailableModelInfo array', async () => {
      const mockModels = [
        {
          modelId: 'claude-sonnet-4',
          displayName: 'Claude Sonnet 4',
          provider: 'anthropic',
          qualityTier: 'standard',
          inputPricePer1M: 3.0,
          outputPricePer1M: 15.0,
          suitableFor: ['coding'],
          hasApiKey: true,
        },
      ];
      mockModelPreferencesService.getAvailableModels.mockResolvedValue(mockModels);

      const result = await controller.getAvailableModels(workspaceId);

      expect(result).toHaveLength(1);
      expect(result[0].modelId).toBe('claude-sonnet-4');
      expect(result[0].hasApiKey).toBe(true);
    });

    it('should call service with correct workspaceId', async () => {
      mockModelPreferencesService.getAvailableModels.mockResolvedValue([]);

      await controller.getAvailableModels(workspaceId);

      expect(mockModelPreferencesService.getAvailableModels).toHaveBeenCalledWith(workspaceId);
    });
  });

  describe('GET /model-preferences/estimate', () => {
    it('should return 200 with EstimatedCostInfo', async () => {
      mockModelPreferencesService.getEstimatedCost.mockResolvedValue(mockEstimatedCost);

      const result = await controller.getEstimate(workspaceId);

      expect(result).toEqual(mockEstimatedCost);
    });

    it('should accept preset query param', async () => {
      mockModelPreferencesService.getEstimatedCost.mockResolvedValue(mockEstimatedCost);

      await controller.getEstimate(workspaceId, 'economy');

      expect(mockModelPreferencesService.getEstimatedCost).toHaveBeenCalledWith(
        workspaceId,
        'economy',
      );
    });

    it('should call service without preset when not provided', async () => {
      mockModelPreferencesService.getEstimatedCost.mockResolvedValue(mockEstimatedCost);

      await controller.getEstimate(workspaceId);

      expect(mockModelPreferencesService.getEstimatedCost).toHaveBeenCalledWith(
        workspaceId,
        undefined,
      );
    });
  });

  describe('POST /model-preferences/validate-model', () => {
    it('should return 200 with validation result', async () => {
      mockModelPreferencesService.validateModelSelection.mockResolvedValue({
        valid: true,
        warnings: [],
      });

      const result = await controller.validateModel(workspaceId, {
        modelId: 'claude-sonnet-4',
      });

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should return warnings for missing BYOK key', async () => {
      mockModelPreferencesService.validateModelSelection.mockResolvedValue({
        valid: true,
        warnings: ['No active BYOK key found for provider'],
      });

      const result = await controller.validateModel(workspaceId, {
        modelId: 'deepseek-chat',
      });

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should call service with correct parameters', async () => {
      mockModelPreferencesService.validateModelSelection.mockResolvedValue({
        valid: true,
        warnings: [],
      });

      await controller.validateModel(workspaceId, { modelId: 'test-model' });

      expect(mockModelPreferencesService.validateModelSelection).toHaveBeenCalledWith(
        'test-model',
        workspaceId,
      );
    });
  });

  describe('Guards', () => {
    it('should have JwtAuthGuard and RoleGuard applied at controller level', () => {
      const guards = Reflect.getMetadata('__guards__', ModelPreferencesController);
      // Guards are applied via @UseGuards decorator
      expect(guards).toBeDefined();
      expect(guards).toHaveLength(2);
    });
  });
});
