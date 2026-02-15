/**
 * ModelPreferencesService Tests
 *
 * Story 13-9: User Model Preferences
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ModelPreferencesService } from './model-preferences.service';
import { WorkspaceSettings } from '../../../database/entities/workspace-settings.entity';
import { BYOKKey, KeyProvider } from '../../../database/entities/byok-key.entity';
import { ModelRegistryService } from '../../model-registry/services/model-registry.service';
import { UsageService } from '../../usage/services/usage.service';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { BadRequestException } from '@nestjs/common';

describe('ModelPreferencesService', () => {
  let service: ModelPreferencesService;

  const workspaceId = 'test-workspace-id';

  const mockWorkspaceSettingsRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockByokKeyRepo = {
    find: jest.fn(),
  };

  const mockModelRegistryService = {
    findAll: jest.fn(),
    findByModelId: jest.fn(),
  };

  const mockUsageService = {
    getWorkspaceUsageSummary: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockAuditService = {
    log: jest.fn(),
  };

  const defaultSettings: Partial<WorkspaceSettings> = {
    workspaceId,
    modelPreset: 'balanced',
    taskModelOverrides: {},
    enabledProviders: [],
    providerPriority: [],
    modelPreferencesEnabled: false,
  };

  const mockModels = [
    {
      modelId: 'claude-sonnet-4-20250514',
      displayName: 'Claude Sonnet 4',
      provider: 'anthropic',
      qualityTier: 'standard',
      inputPricePer1M: 3.0,
      outputPricePer1M: 15.0,
      suitableFor: ['coding', 'planning', 'review'],
      available: true,
      deprecationDate: null,
    },
    {
      modelId: 'gpt-4o',
      displayName: 'GPT-4o',
      provider: 'openai',
      qualityTier: 'standard',
      inputPricePer1M: 5.0,
      outputPricePer1M: 15.0,
      suitableFor: ['coding', 'planning'],
      available: true,
      deprecationDate: null,
    },
    {
      modelId: 'deepseek-chat',
      displayName: 'DeepSeek Chat',
      provider: 'deepseek',
      qualityTier: 'economy',
      inputPricePer1M: 0.27,
      outputPricePer1M: 1.1,
      suitableFor: ['coding', 'simple_chat'],
      available: true,
      deprecationDate: null,
    },
  ];

  const mockByokKeys = [
    {
      id: 'key-1',
      workspaceId,
      provider: KeyProvider.ANTHROPIC,
      isActive: true,
    },
    {
      id: 'key-2',
      workspaceId,
      provider: KeyProvider.OPENAI,
      isActive: true,
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModelPreferencesService,
        {
          provide: getRepositoryToken(WorkspaceSettings),
          useValue: mockWorkspaceSettingsRepo,
        },
        {
          provide: getRepositoryToken(BYOKKey),
          useValue: mockByokKeyRepo,
        },
        {
          provide: ModelRegistryService,
          useValue: mockModelRegistryService,
        },
        {
          provide: UsageService,
          useValue: mockUsageService,
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

    service = module.get<ModelPreferencesService>(ModelPreferencesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- getPreferences ---

  describe('getPreferences', () => {
    it('should return full ModelPreferencesResponse for workspace', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue({ ...defaultSettings });
      mockModelRegistryService.findAll.mockResolvedValue(mockModels);
      mockByokKeyRepo.find.mockResolvedValue(mockByokKeys);
      mockUsageService.getWorkspaceUsageSummary.mockResolvedValue({
        totalCost: 100,
        totalInputTokens: 1000000,
        totalOutputTokens: 500000,
        totalRequests: 100,
      });

      const result = await service.getPreferences(workspaceId);

      expect(result.workspaceId).toBe(workspaceId);
      expect(result.modelPreferencesEnabled).toBe(false);
      expect(result.preset).toBe('balanced');
      expect(result.taskOverrides).toEqual({});
      expect(result.enabledProviders).toEqual([]);
      expect(result.providerPriority).toEqual([]);
      expect(result.availableModels).toBeDefined();
      expect(result.availableProviders).toBeDefined();
    });

    it('should return default values when no preferences configured', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue({ ...defaultSettings });
      mockModelRegistryService.findAll.mockResolvedValue([]);
      mockByokKeyRepo.find.mockResolvedValue([]);
      mockUsageService.getWorkspaceUsageSummary.mockResolvedValue({
        totalCost: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalRequests: 0,
      });

      const result = await service.getPreferences(workspaceId);

      expect(result.preset).toBe('balanced');
      expect(result.modelPreferencesEnabled).toBe(false);
      expect(result.taskOverrides).toEqual({});
    });

    it('should include available models from model registry', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue({ ...defaultSettings });
      mockModelRegistryService.findAll.mockResolvedValue(mockModels);
      mockByokKeyRepo.find.mockResolvedValue(mockByokKeys);
      mockUsageService.getWorkspaceUsageSummary.mockResolvedValue({ totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, totalRequests: 0 });

      const result = await service.getPreferences(workspaceId);

      expect(result.availableModels).toHaveLength(3);
      expect(result.availableModels[0].modelId).toBe('claude-sonnet-4-20250514');
    });

    it('should enrich models with hasApiKey based on BYOK keys', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue({ ...defaultSettings });
      mockModelRegistryService.findAll.mockResolvedValue(mockModels);
      mockByokKeyRepo.find.mockResolvedValue(mockByokKeys);
      mockUsageService.getWorkspaceUsageSummary.mockResolvedValue({ totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, totalRequests: 0 });

      const result = await service.getPreferences(workspaceId);

      // Anthropic model has key
      const anthropicModel = result.availableModels.find(m => m.modelId === 'claude-sonnet-4-20250514');
      expect(anthropicModel?.hasApiKey).toBe(true);

      // OpenAI model has key
      const openaiModel = result.availableModels.find(m => m.modelId === 'gpt-4o');
      expect(openaiModel?.hasApiKey).toBe(true);

      // DeepSeek model does NOT have key
      const deepseekModel = result.availableModels.find(m => m.modelId === 'deepseek-chat');
      expect(deepseekModel?.hasApiKey).toBe(false);
    });

    it('should include available providers with key status', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue({ ...defaultSettings });
      mockModelRegistryService.findAll.mockResolvedValue(mockModels);
      mockByokKeyRepo.find.mockResolvedValue(mockByokKeys);
      mockUsageService.getWorkspaceUsageSummary.mockResolvedValue({ totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, totalRequests: 0 });

      const result = await service.getPreferences(workspaceId);

      expect(result.availableProviders).toHaveLength(4);
      const anthropicProvider = result.availableProviders.find(p => p.providerId === 'anthropic');
      expect(anthropicProvider?.hasApiKey).toBe(true);
      const deepseekProvider = result.availableProviders.find(p => p.providerId === 'deepseek');
      expect(deepseekProvider?.hasApiKey).toBe(false);
    });

    it('should use Redis cached value when available', async () => {
      const cached = JSON.stringify({
        workspaceId,
        modelPreferencesEnabled: true,
        preset: 'economy',
        taskOverrides: {},
        enabledProviders: [],
        providerPriority: [],
        availableModels: [],
        availableProviders: [],
        estimatedMonthlyCost: null,
      });
      mockRedisService.get.mockResolvedValue(cached);

      const result = await service.getPreferences(workspaceId);

      expect(result.preset).toBe('economy');
      expect(mockWorkspaceSettingsRepo.findOne).not.toHaveBeenCalled();
    });

    it('should fetch from DB on Redis cache miss', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue({ ...defaultSettings });
      mockModelRegistryService.findAll.mockResolvedValue([]);
      mockByokKeyRepo.find.mockResolvedValue([]);
      mockUsageService.getWorkspaceUsageSummary.mockResolvedValue({ totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, totalRequests: 0 });

      await service.getPreferences(workspaceId);

      expect(mockWorkspaceSettingsRepo.findOne).toHaveBeenCalledWith({
        where: { workspaceId },
      });
    });

    it('should create default workspace settings if none exist', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue(null);
      mockWorkspaceSettingsRepo.create.mockReturnValue({ ...defaultSettings });
      mockWorkspaceSettingsRepo.save.mockResolvedValue({ ...defaultSettings });
      mockModelRegistryService.findAll.mockResolvedValue([]);
      mockByokKeyRepo.find.mockResolvedValue([]);
      mockUsageService.getWorkspaceUsageSummary.mockResolvedValue({ totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, totalRequests: 0 });

      await service.getPreferences(workspaceId);

      expect(mockWorkspaceSettingsRepo.create).toHaveBeenCalled();
      expect(mockWorkspaceSettingsRepo.save).toHaveBeenCalled();
    });
  });

  // --- updatePreferences ---

  describe('updatePreferences', () => {
    beforeEach(() => {
      mockRedisService.get.mockResolvedValue(null);
      mockModelRegistryService.findAll.mockResolvedValue(mockModels);
      mockByokKeyRepo.find.mockResolvedValue(mockByokKeys);
      mockUsageService.getWorkspaceUsageSummary.mockResolvedValue({ totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, totalRequests: 0 });
    });

    it('should save preset to workspace settings', async () => {
      const settings = { ...defaultSettings };
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue(settings);
      mockWorkspaceSettingsRepo.save.mockResolvedValue({ ...settings, modelPreset: 'economy' });

      await service.updatePreferences(workspaceId, { preset: 'economy' });

      expect(mockWorkspaceSettingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ modelPreset: 'economy' }),
      );
    });

    it('should save taskOverrides to workspace settings', async () => {
      const overrides = {
        coding: { model: 'claude-sonnet-4-20250514', fallback: 'gpt-4o' },
      };
      const settings = { ...defaultSettings };
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue(settings);
      mockWorkspaceSettingsRepo.save.mockResolvedValue({ ...settings, taskModelOverrides: overrides });
      mockModelRegistryService.findByModelId.mockResolvedValue(mockModels[0]);

      await service.updatePreferences(workspaceId, { taskOverrides: overrides });

      expect(mockWorkspaceSettingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ taskModelOverrides: overrides }),
      );
    });

    it('should save enabledProviders to workspace settings', async () => {
      const settings = { ...defaultSettings };
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue(settings);
      mockWorkspaceSettingsRepo.save.mockResolvedValue({ ...settings, enabledProviders: ['anthropic'] });

      await service.updatePreferences(workspaceId, { enabledProviders: ['anthropic'] });

      expect(mockWorkspaceSettingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ enabledProviders: ['anthropic'] }),
      );
    });

    it('should save providerPriority to workspace settings', async () => {
      const settings = { ...defaultSettings };
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue(settings);
      mockWorkspaceSettingsRepo.save.mockResolvedValue({ ...settings, providerPriority: ['anthropic', 'openai'] });

      await service.updatePreferences(workspaceId, { providerPriority: ['anthropic', 'openai'] });

      expect(mockWorkspaceSettingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ providerPriority: ['anthropic', 'openai'] }),
      );
    });

    it('should enable modelPreferencesEnabled', async () => {
      const settings = { ...defaultSettings };
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue(settings);
      mockWorkspaceSettingsRepo.save.mockResolvedValue({ ...settings, modelPreferencesEnabled: true });

      await service.updatePreferences(workspaceId, { modelPreferencesEnabled: true });

      expect(mockWorkspaceSettingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ modelPreferencesEnabled: true }),
      );
    });

    it('should validate task types in taskOverrides are valid VALID_TASK_TYPES', async () => {
      const settings = { ...defaultSettings };
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue(settings);

      await expect(
        service.updatePreferences(workspaceId, {
          taskOverrides: {
            invalid_task: { model: 'claude-sonnet-4-20250514', fallback: 'gpt-4o' },
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate model IDs exist in model registry', async () => {
      const settings = { ...defaultSettings };
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue(settings);
      mockModelRegistryService.findByModelId.mockResolvedValue(null);

      await expect(
        service.updatePreferences(workspaceId, {
          taskOverrides: {
            coding: { model: 'nonexistent-model', fallback: 'gpt-4o' },
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid task type keys in overrides', async () => {
      const settings = { ...defaultSettings };
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue(settings);

      await expect(
        service.updatePreferences(workspaceId, {
          taskOverrides: {
            bogus_type: { model: 'claude-sonnet-4-20250514', fallback: 'gpt-4o' },
          },
        }),
      ).rejects.toThrow('Invalid task types');
    });

    it('should reject model IDs that do not exist in registry', async () => {
      const settings = { ...defaultSettings };
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue(settings);
      mockModelRegistryService.findByModelId
        .mockResolvedValueOnce(null); // first call for model

      await expect(
        service.updatePreferences(workspaceId, {
          taskOverrides: {
            coding: { model: 'does-not-exist', fallback: 'gpt-4o' },
          },
        }),
      ).rejects.toThrow("not found in model registry");
    });

    it('should validate provider IDs in enabledProviders', async () => {
      const settings = { ...defaultSettings };
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue(settings);

      await expect(
        service.updatePreferences(workspaceId, {
          enabledProviders: ['invalid_provider'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid provider IDs', async () => {
      const settings = { ...defaultSettings };
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue(settings);

      await expect(
        service.updatePreferences(workspaceId, {
          providerPriority: ['bogus'],
        }),
      ).rejects.toThrow('Invalid provider IDs');
    });

    it('should invalidate Redis cache after update', async () => {
      const settings = { ...defaultSettings };
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue(settings);
      mockWorkspaceSettingsRepo.save.mockResolvedValue(settings);

      await service.updatePreferences(workspaceId, { preset: 'economy' });

      expect(mockRedisService.del).toHaveBeenCalled();
    });

    it('should log change to audit trail', async () => {
      const settings = { ...defaultSettings };
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue(settings);
      mockWorkspaceSettingsRepo.save.mockResolvedValue(settings);

      await service.updatePreferences(workspaceId, { preset: 'quality' }, 'user-123');

      expect(mockAuditService.log).toHaveBeenCalledWith(
        workspaceId,
        'user-123',
        expect.any(String),
        'model_preferences',
        workspaceId,
        expect.objectContaining({
          action: 'model_preferences_updated',
        }),
      );
    });

    it('should return updated ModelPreferencesResponse', async () => {
      const settings = { ...defaultSettings };
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue(settings);
      mockWorkspaceSettingsRepo.save.mockResolvedValue({ ...settings, modelPreset: 'economy' });

      const result = await service.updatePreferences(workspaceId, { preset: 'economy' });

      expect(result).toBeDefined();
      expect(result.workspaceId).toBe(workspaceId);
    });

    it('should handle partial updates (only preset)', async () => {
      const settings = {
        ...defaultSettings,
        enabledProviders: ['anthropic'],
        providerPriority: ['anthropic'],
      };
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue(settings);
      mockWorkspaceSettingsRepo.save.mockResolvedValue({ ...settings, modelPreset: 'quality' });

      await service.updatePreferences(workspaceId, { preset: 'quality' });

      expect(mockWorkspaceSettingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          modelPreset: 'quality',
          enabledProviders: ['anthropic'],
          providerPriority: ['anthropic'],
        }),
      );
    });

    it('should handle partial updates (only taskOverrides)', async () => {
      const overrides = {
        coding: { model: 'claude-sonnet-4-20250514', fallback: 'gpt-4o' },
      };
      const settings = { ...defaultSettings, modelPreset: 'economy' };
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue(settings);
      mockWorkspaceSettingsRepo.save.mockResolvedValue({ ...settings, taskModelOverrides: overrides });
      mockModelRegistryService.findByModelId.mockResolvedValue(mockModels[0]);

      await service.updatePreferences(workspaceId, { taskOverrides: overrides });

      expect(mockWorkspaceSettingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          modelPreset: 'economy', // unchanged
          taskModelOverrides: overrides,
        }),
      );
    });
  });

  // --- getRouterPreferences ---

  describe('getRouterPreferences', () => {
    it('should return RouterPreferences when preferences enabled', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue({
        ...defaultSettings,
        modelPreferencesEnabled: true,
        modelPreset: 'economy',
        taskModelOverrides: {
          coding: { model: 'deepseek-chat', fallback: 'gemini-2.0-flash' },
        },
        enabledProviders: ['deepseek'],
        providerPriority: ['deepseek', 'anthropic'],
      });

      const result = await service.getRouterPreferences(workspaceId);

      expect(result).not.toBeNull();
      expect(result!.preset).toBe('economy');
      expect(result!.taskOverrides.coding.preferredModel).toBe('deepseek-chat');
      expect(result!.taskOverrides.coding.fallbackModel).toBe('gemini-2.0-flash');
      expect(result!.enabledProviders).toEqual(['deepseek']);
      expect(result!.providerPriority).toEqual(['deepseek', 'anthropic']);
    });

    it('should return null when preferences disabled', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue({
        ...defaultSettings,
        modelPreferencesEnabled: false,
      });

      const result = await service.getRouterPreferences(workspaceId);

      expect(result).toBeNull();
    });

    it('should map preset correctly', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue({
        ...defaultSettings,
        modelPreferencesEnabled: true,
        modelPreset: 'quality',
      });

      const result = await service.getRouterPreferences(workspaceId);

      expect(result!.preset).toBe('quality');
    });

    it('should map taskOverrides correctly', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue({
        ...defaultSettings,
        modelPreferencesEnabled: true,
        taskModelOverrides: {
          review: { model: 'gpt-4o', fallback: 'deepseek-chat' },
        },
      });

      const result = await service.getRouterPreferences(workspaceId);

      expect(result!.taskOverrides.review).toEqual({
        preferredModel: 'gpt-4o',
        fallbackModel: 'deepseek-chat',
      });
    });

    it('should include enabledProviders', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue({
        ...defaultSettings,
        modelPreferencesEnabled: true,
        enabledProviders: ['anthropic', 'google'],
      });

      const result = await service.getRouterPreferences(workspaceId);

      expect(result!.enabledProviders).toEqual(['anthropic', 'google']);
    });

    it('should include providerPriority', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue({
        ...defaultSettings,
        modelPreferencesEnabled: true,
        providerPriority: ['anthropic', 'openai'],
      });

      const result = await service.getRouterPreferences(workspaceId);

      expect(result!.providerPriority).toEqual(['anthropic', 'openai']);
    });

    it('should use Redis cached value when available', async () => {
      const cached = JSON.stringify({
        preset: 'quality',
        taskOverrides: {},
        enabledProviders: ['anthropic'],
        providerPriority: [],
      });
      mockRedisService.get.mockResolvedValue(cached);

      const result = await service.getRouterPreferences(workspaceId);

      expect(result!.preset).toBe('quality');
      expect(mockWorkspaceSettingsRepo.findOne).not.toHaveBeenCalled();
    });

    it('should fetch from DB on cache miss', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue({
        ...defaultSettings,
        modelPreferencesEnabled: true,
      });

      await service.getRouterPreferences(workspaceId);

      expect(mockWorkspaceSettingsRepo.findOne).toHaveBeenCalled();
    });
  });

  // --- getAvailableModels ---

  describe('getAvailableModels', () => {
    it('should return all available models from registry', async () => {
      mockModelRegistryService.findAll.mockResolvedValue(mockModels);
      mockByokKeyRepo.find.mockResolvedValue([]);

      const result = await service.getAvailableModels(workspaceId);

      expect(result).toHaveLength(3);
    });

    it('should enrich with hasApiKey=true when BYOK key exists', async () => {
      mockModelRegistryService.findAll.mockResolvedValue(mockModels);
      mockByokKeyRepo.find.mockResolvedValue(mockByokKeys);

      const result = await service.getAvailableModels(workspaceId);

      const anthropicModel = result.find(m => m.modelId === 'claude-sonnet-4-20250514');
      expect(anthropicModel?.hasApiKey).toBe(true);
    });

    it('should set hasApiKey=false when no BYOK key for provider', async () => {
      mockModelRegistryService.findAll.mockResolvedValue(mockModels);
      mockByokKeyRepo.find.mockResolvedValue(mockByokKeys); // only anthropic and openai

      const result = await service.getAvailableModels(workspaceId);

      const deepseekModel = result.find(m => m.modelId === 'deepseek-chat');
      expect(deepseekModel?.hasApiKey).toBe(false);
    });

    it('should include all fields (modelId, displayName, provider, qualityTier, pricing, suitableFor)', async () => {
      mockModelRegistryService.findAll.mockResolvedValue(mockModels);
      mockByokKeyRepo.find.mockResolvedValue([]);

      const result = await service.getAvailableModels(workspaceId);

      expect(result[0]).toEqual(
        expect.objectContaining({
          modelId: expect.any(String),
          displayName: expect.any(String),
          provider: expect.any(String),
          qualityTier: expect.any(String),
          inputPricePer1M: expect.any(Number),
          outputPricePer1M: expect.any(Number),
          suitableFor: expect.any(Array),
          hasApiKey: expect.any(Boolean),
        }),
      );
    });
  });

  // --- getAvailableProviders ---

  describe('getAvailableProviders', () => {
    it('should return all 4 providers', async () => {
      mockModelRegistryService.findAll.mockResolvedValue(mockModels);
      mockByokKeyRepo.find.mockResolvedValue([]);

      const result = await service.getAvailableProviders(workspaceId);

      expect(result).toHaveLength(4);
      const providerIds = result.map(p => p.providerId);
      expect(providerIds).toContain('anthropic');
      expect(providerIds).toContain('openai');
      expect(providerIds).toContain('google');
      expect(providerIds).toContain('deepseek');
    });

    it('should set hasApiKey based on BYOK keys', async () => {
      mockModelRegistryService.findAll.mockResolvedValue(mockModels);
      mockByokKeyRepo.find.mockResolvedValue(mockByokKeys);

      const result = await service.getAvailableProviders(workspaceId);

      const anthropic = result.find(p => p.providerId === 'anthropic');
      expect(anthropic?.hasApiKey).toBe(true);
      const google = result.find(p => p.providerId === 'google');
      expect(google?.hasApiKey).toBe(false);
    });

    it('should include model count per provider', async () => {
      mockModelRegistryService.findAll.mockResolvedValue(mockModels);
      mockByokKeyRepo.find.mockResolvedValue([]);

      const result = await service.getAvailableProviders(workspaceId);

      const anthropic = result.find(p => p.providerId === 'anthropic');
      expect(anthropic?.modelCount).toBe(1); // one anthropic model in mockModels
      const openai = result.find(p => p.providerId === 'openai');
      expect(openai?.modelCount).toBe(1);
    });
  });

  // --- getEstimatedCost ---

  describe('getEstimatedCost', () => {
    it('should return estimates for all presets', async () => {
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue({ ...defaultSettings });
      mockUsageService.getWorkspaceUsageSummary.mockResolvedValue({
        totalCost: 100,
        totalInputTokens: 1000000,
        totalOutputTokens: 500000,
        totalRequests: 100,
      });

      const result = await service.getEstimatedCost(workspaceId);

      expect(result).toHaveProperty('economyEstimate');
      expect(result).toHaveProperty('balancedEstimate');
      expect(result).toHaveProperty('qualityEstimate');
      expect(result).toHaveProperty('currentEstimate');
    });

    it('should calculate based on historical usage patterns', async () => {
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue({ ...defaultSettings });
      mockUsageService.getWorkspaceUsageSummary.mockResolvedValue({
        totalCost: 100,
        totalInputTokens: 1000000,
        totalOutputTokens: 500000,
        totalRequests: 100,
      });

      const result = await service.getEstimatedCost(workspaceId);

      expect(result.economyEstimate).toBeLessThan(result.balancedEstimate);
      expect(result.balancedEstimate).toBeLessThan(result.qualityEstimate);
    });

    it('should return zero estimates when no usage history', async () => {
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue({ ...defaultSettings });
      mockUsageService.getWorkspaceUsageSummary.mockResolvedValue({
        totalCost: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalRequests: 0,
      });

      const result = await service.getEstimatedCost(workspaceId);

      expect(result.economyEstimate).toBe(0);
      expect(result.balancedEstimate).toBe(0);
      expect(result.qualityEstimate).toBe(0);
      expect(result.currentEstimate).toBe(0);
    });

    it('should handle missing pricing data gracefully', async () => {
      mockWorkspaceSettingsRepo.findOne.mockResolvedValue({ ...defaultSettings });
      mockUsageService.getWorkspaceUsageSummary.mockRejectedValue(new Error('No data'));

      const result = await service.getEstimatedCost(workspaceId);

      expect(result.economyEstimate).toBe(0);
      expect(result.balancedEstimate).toBe(0);
    });
  });

  // --- validateModelSelection ---

  describe('validateModelSelection', () => {
    it('should return valid=true for available model with BYOK key', async () => {
      mockModelRegistryService.findByModelId.mockResolvedValue(mockModels[0]); // anthropic model
      mockByokKeyRepo.find.mockResolvedValue(mockByokKeys); // has anthropic key

      const result = await service.validateModelSelection('claude-sonnet-4-20250514', workspaceId);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should return valid=true with warning for model without BYOK key', async () => {
      mockModelRegistryService.findByModelId.mockResolvedValue(mockModels[2]); // deepseek model
      mockByokKeyRepo.find.mockResolvedValue(mockByokKeys); // no deepseek key

      const result = await service.validateModelSelection('deepseek-chat', workspaceId);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('No active BYOK key');
    });

    it('should return valid=false for non-existent model', async () => {
      mockModelRegistryService.findByModelId.mockResolvedValue(null);

      const result = await service.validateModelSelection('nonexistent', workspaceId);

      expect(result.valid).toBe(false);
      expect(result.warnings).toContain('Model not found in registry');
    });

    it('should return valid=false for unavailable model', async () => {
      mockModelRegistryService.findByModelId.mockResolvedValue({
        ...mockModels[0],
        available: false,
      });

      const result = await service.validateModelSelection('claude-sonnet-4-20250514', workspaceId);

      expect(result.valid).toBe(false);
      expect(result.warnings).toContain('Model is not available');
    });

    it('should return valid=false for deprecated model', async () => {
      mockModelRegistryService.findByModelId.mockResolvedValue({
        ...mockModels[0],
        available: true,
        deprecationDate: new Date('2020-01-01'),
      });

      const result = await service.validateModelSelection('claude-sonnet-4-20250514', workspaceId);

      expect(result.valid).toBe(false);
      expect(result.warnings).toContain('Model is deprecated');
    });
  });
});
