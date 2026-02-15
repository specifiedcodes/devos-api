/**
 * ModelPreferencesService
 *
 * Story 13-9: User Model Preferences
 *
 * Core service for managing workspace model preferences.
 * Provides CRUD operations, validation, router integration, and cost estimation.
 */
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkspaceSettings } from '../../../database/entities/workspace-settings.entity';
import { BYOKKey } from '../../../database/entities/byok-key.entity';
import { ModelRegistryService } from '../../model-registry/services/model-registry.service';
import { UsageService } from '../../usage/services/usage.service';
import { RedisService } from '../../redis/redis.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import { UpdateModelPreferencesDto } from '../dto/update-model-preferences.dto';
import { PRESET_DEFINITIONS, VALID_PRESETS, VALID_PROVIDERS } from '../constants/preset-definitions';
import { VALID_TASK_TYPES } from '../../../database/entities/model-definition.entity';

// --- Response Interfaces ---

export interface ModelPreferencesResponse {
  workspaceId: string;
  modelPreferencesEnabled: boolean;
  preset: string;
  taskOverrides: Record<string, { model: string; fallback: string }>;
  enabledProviders: string[];
  providerPriority: string[];
  availableModels: AvailableModelInfo[];
  availableProviders: AvailableProviderInfo[];
  estimatedMonthlyCost: EstimatedCostInfo | null;
}

export interface AvailableModelInfo {
  modelId: string;
  displayName: string;
  provider: string;
  qualityTier: string;
  inputPricePer1M: number;
  outputPricePer1M: number;
  suitableFor: string[];
  hasApiKey: boolean;
}

export interface AvailableProviderInfo {
  providerId: string;
  name: string;
  hasApiKey: boolean;
  modelCount: number;
}

export interface EstimatedCostInfo {
  economyEstimate: number;
  balancedEstimate: number;
  qualityEstimate: number;
  currentEstimate: number;
}

export interface RouterPreferences {
  preset: 'auto' | 'economy' | 'quality' | 'balanced';
  taskOverrides: Record<string, { preferredModel: string; fallbackModel: string }>;
  enabledProviders: string[];
  providerPriority: string[];
}

// --- Cache Keys ---
const PREFERENCES_CACHE_PREFIX = 'workspace:';
const PREFERENCES_CACHE_SUFFIX = ':model_preferences';
const ROUTER_CACHE_SUFFIX = ':router_preferences';
const CACHE_TTL = 120; // 120 seconds

// --- Provider Display Names ---
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google AI',
  deepseek: 'DeepSeek',
};

@Injectable()
export class ModelPreferencesService {
  private readonly logger = new Logger(ModelPreferencesService.name);

  constructor(
    @InjectRepository(WorkspaceSettings)
    private readonly workspaceSettingsRepository: Repository<WorkspaceSettings>,
    @InjectRepository(BYOKKey)
    private readonly byokKeyRepository: Repository<BYOKKey>,
    private readonly modelRegistryService: ModelRegistryService,
    private readonly usageService: UsageService,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Get full model preferences for a workspace
   */
  async getPreferences(workspaceId: string): Promise<ModelPreferencesResponse> {
    // Check Redis cache first
    const cacheKey = `${PREFERENCES_CACHE_PREFIX}${workspaceId}${PREFERENCES_CACHE_SUFFIX}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Cache corrupted, fall through to DB
      }
    }

    // Get workspace settings
    const settings = await this.getOrCreateSettings(workspaceId);

    // Get available models and providers
    const availableModels = await this.getAvailableModels(workspaceId);
    const availableProviders = await this.getAvailableProviders(workspaceId);

    // Build response
    const response: ModelPreferencesResponse = {
      workspaceId,
      modelPreferencesEnabled: settings.modelPreferencesEnabled,
      preset: settings.modelPreset,
      taskOverrides: settings.taskModelOverrides || {},
      enabledProviders: settings.enabledProviders || [],
      providerPriority: settings.providerPriority || [],
      availableModels,
      availableProviders,
      estimatedMonthlyCost: null,
    };

    // Try to get cost estimate (non-blocking)
    try {
      response.estimatedMonthlyCost = await this.getEstimatedCost(workspaceId);
    } catch (error) {
      this.logger.warn(`Failed to get cost estimate for workspace ${workspaceId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Cache the response
    await this.redisService.set(cacheKey, JSON.stringify(response), CACHE_TTL);

    return response;
  }

  /**
   * Update model preferences for a workspace
   */
  async updatePreferences(
    workspaceId: string,
    dto: UpdateModelPreferencesDto,
    userId?: string,
  ): Promise<ModelPreferencesResponse> {
    // Get or create settings
    const settings = await this.getOrCreateSettings(workspaceId);

    // Validate task types in overrides
    if (dto.taskOverrides) {
      const invalidTaskTypes = Object.keys(dto.taskOverrides).filter(
        (taskType) => !VALID_TASK_TYPES.includes(taskType as any),
      );
      if (invalidTaskTypes.length > 0) {
        throw new BadRequestException(
          `Invalid task types in taskOverrides: ${invalidTaskTypes.join(', ')}. Valid types: ${VALID_TASK_TYPES.join(', ')}`,
        );
      }

      // Validate model IDs exist in registry
      for (const [taskType, override] of Object.entries(dto.taskOverrides)) {
        const modelExists = await this.modelRegistryService.findByModelId(override.model);
        if (!modelExists) {
          throw new BadRequestException(
            `Model '${override.model}' for task type '${taskType}' not found in model registry`,
          );
        }
        const fallbackExists = await this.modelRegistryService.findByModelId(override.fallback);
        if (!fallbackExists) {
          throw new BadRequestException(
            `Fallback model '${override.fallback}' for task type '${taskType}' not found in model registry`,
          );
        }
      }
    }

    // Validate provider IDs
    if (dto.enabledProviders) {
      const invalidProviders = dto.enabledProviders.filter(
        (p) => !(VALID_PROVIDERS as readonly string[]).includes(p),
      );
      if (invalidProviders.length > 0) {
        throw new BadRequestException(
          `Invalid provider IDs in enabledProviders: ${invalidProviders.join(', ')}. Valid providers: ${VALID_PROVIDERS.join(', ')}`,
        );
      }
    }

    if (dto.providerPriority) {
      const invalidProviders = dto.providerPriority.filter(
        (p) => !(VALID_PROVIDERS as readonly string[]).includes(p),
      );
      if (invalidProviders.length > 0) {
        throw new BadRequestException(
          `Invalid provider IDs in providerPriority: ${invalidProviders.join(', ')}. Valid providers: ${VALID_PROVIDERS.join(', ')}`,
        );
      }
      // Check for duplicates
      const uniqueProviders = new Set(dto.providerPriority);
      if (uniqueProviders.size !== dto.providerPriority.length) {
        throw new BadRequestException(
          'Duplicate provider IDs in providerPriority. Each provider should appear at most once.',
        );
      }
    }

    // Apply updates
    if (dto.modelPreferencesEnabled !== undefined) {
      settings.modelPreferencesEnabled = dto.modelPreferencesEnabled;
    }
    if (dto.preset !== undefined) {
      settings.modelPreset = dto.preset;
    }
    if (dto.taskOverrides !== undefined) {
      settings.taskModelOverrides = dto.taskOverrides;
    }
    if (dto.enabledProviders !== undefined) {
      settings.enabledProviders = dto.enabledProviders;
    }
    if (dto.providerPriority !== undefined) {
      settings.providerPriority = dto.providerPriority;
    }

    // Save
    await this.workspaceSettingsRepository.save(settings);

    // Invalidate caches
    await this.invalidateCaches(workspaceId);

    // Audit log
    try {
      await this.auditService.log(
        workspaceId,
        userId || 'system',
        AuditAction.UPDATE,
        'model_preferences',
        workspaceId,
        {
          action: 'model_preferences_updated',
          changes: dto,
        },
      );
    } catch (error) {
      this.logger.warn(`Failed to audit log model preferences update: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Build response from already-loaded data to avoid redundant DB reads
    const availableModels = await this.getAvailableModels(workspaceId);
    const availableProviders = await this.getAvailableProviders(workspaceId);

    const response: ModelPreferencesResponse = {
      workspaceId,
      modelPreferencesEnabled: settings.modelPreferencesEnabled,
      preset: settings.modelPreset,
      taskOverrides: settings.taskModelOverrides || {},
      enabledProviders: settings.enabledProviders || [],
      providerPriority: settings.providerPriority || [],
      availableModels,
      availableProviders,
      estimatedMonthlyCost: null,
    };

    // Try to get cost estimate (non-blocking)
    try {
      response.estimatedMonthlyCost = await this.getEstimatedCost(workspaceId);
    } catch (error) {
      this.logger.warn(`Failed to get cost estimate for workspace ${workspaceId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Cache the response
    const cacheKey = `${PREFERENCES_CACHE_PREFIX}${workspaceId}${PREFERENCES_CACHE_SUFFIX}`;
    await this.redisService.set(cacheKey, JSON.stringify(response), CACHE_TTL);

    return response;
  }

  /**
   * Get lightweight router preferences for the orchestrator
   * Returns null if preferences are disabled
   */
  async getRouterPreferences(workspaceId: string): Promise<RouterPreferences | null> {
    // Check Redis cache
    const cacheKey = `${PREFERENCES_CACHE_PREFIX}${workspaceId}${ROUTER_CACHE_SUFFIX}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // If cached as null, preferences are disabled
        if (parsed === null) return null;
        return parsed;
      } catch {
        // Cache corrupted, fall through
      }
    }

    // Get settings
    const settings = await this.getOrCreateSettings(workspaceId);

    // If preferences disabled, return null
    if (!settings.modelPreferencesEnabled) {
      await this.redisService.set(cacheKey, JSON.stringify(null), CACHE_TTL);
      return null;
    }

    // Map to router format
    const routerPrefs: RouterPreferences = {
      preset: settings.modelPreset as RouterPreferences['preset'],
      taskOverrides: {},
      enabledProviders: settings.enabledProviders || [],
      providerPriority: settings.providerPriority || [],
    };

    // Map taskModelOverrides to router format
    if (settings.taskModelOverrides) {
      for (const [taskType, override] of Object.entries(settings.taskModelOverrides)) {
        routerPrefs.taskOverrides[taskType] = {
          preferredModel: override.model,
          fallbackModel: override.fallback,
        };
      }
    }

    // Cache
    await this.redisService.set(cacheKey, JSON.stringify(routerPrefs), CACHE_TTL);

    return routerPrefs;
  }

  /**
   * Get all available models enriched with hasApiKey flag
   */
  async getAvailableModels(workspaceId: string): Promise<AvailableModelInfo[]> {
    // Get all available models from registry
    const models = await this.modelRegistryService.findAll({ available: true });

    // Get workspace BYOK keys
    const byokKeys = await this.byokKeyRepository.find({
      where: { workspaceId, isActive: true },
    });
    const activeProviders = new Set(byokKeys.map((k) => k.provider.toLowerCase()));

    // Enrich with hasApiKey
    return models.map((model) => ({
      modelId: model.modelId,
      displayName: model.displayName,
      provider: model.provider,
      qualityTier: model.qualityTier,
      inputPricePer1M: model.inputPricePer1M,
      outputPricePer1M: model.outputPricePer1M,
      suitableFor: model.suitableFor,
      hasApiKey: activeProviders.has(model.provider.toLowerCase()),
    }));
  }

  /**
   * Get provider info with API key status and model counts
   */
  async getAvailableProviders(workspaceId: string): Promise<AvailableProviderInfo[]> {
    // Get all available models
    const models = await this.modelRegistryService.findAll({ available: true });

    // Get workspace BYOK keys
    const byokKeys = await this.byokKeyRepository.find({
      where: { workspaceId, isActive: true },
    });
    const activeProviders = new Set(byokKeys.map((k) => k.provider.toLowerCase()));

    // Count models per provider
    const modelCounts = new Map<string, number>();
    for (const model of models) {
      const provider = model.provider.toLowerCase();
      modelCounts.set(provider, (modelCounts.get(provider) || 0) + 1);
    }

    // Build provider list
    return (VALID_PROVIDERS as readonly string[]).map((providerId) => ({
      providerId,
      name: PROVIDER_DISPLAY_NAMES[providerId] || providerId,
      hasApiKey: activeProviders.has(providerId),
      modelCount: modelCounts.get(providerId) || 0,
    }));
  }

  /**
   * Estimate monthly cost based on historical usage patterns
   */
  async getEstimatedCost(workspaceId: string, preset?: string): Promise<EstimatedCostInfo> {
    // Get historical usage for last 30 days
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let totalHistoricalCost = 0;
    try {
      const summary = await this.usageService.getWorkspaceUsageSummary(
        workspaceId,
        thirtyDaysAgo,
        now,
      );
      totalHistoricalCost = summary.totalCost;
    } catch (error) {
      this.logger.warn(`No usage history for workspace ${workspaceId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // If no history, return zeros
    if (totalHistoricalCost === 0) {
      return {
        economyEstimate: 0,
        balancedEstimate: 0,
        qualityEstimate: 0,
        currentEstimate: 0,
      };
    }

    // Approximate cost ratios based on model pricing tiers
    // Economy models are roughly 5-10x cheaper than balanced
    // Quality models are roughly 2-3x more expensive than balanced
    const economyRatio = 0.15;
    const balancedRatio = 1.0;
    const qualityRatio = 3.0;

    // Determine current ratio from preset parameter (if provided) or workspace settings
    let currentRatio = balancedRatio; // default
    const effectivePreset = preset || (await this.getOrCreateSettings(workspaceId)).modelPreset;
    if (effectivePreset === 'economy') currentRatio = economyRatio;
    else if (effectivePreset === 'quality') currentRatio = qualityRatio;
    else if (effectivePreset === 'auto') currentRatio = balancedRatio;

    return {
      economyEstimate: Math.round(totalHistoricalCost * economyRatio * 100) / 100,
      balancedEstimate: Math.round(totalHistoricalCost * balancedRatio * 100) / 100,
      qualityEstimate: Math.round(totalHistoricalCost * qualityRatio * 100) / 100,
      currentEstimate: Math.round(totalHistoricalCost * currentRatio * 100) / 100,
    };
  }

  /**
   * Validate a model selection for a workspace
   */
  async validateModelSelection(
    modelId: string,
    workspaceId: string,
  ): Promise<{ valid: boolean; warnings: string[] }> {
    const warnings: string[] = [];

    // Check model exists
    const model = await this.modelRegistryService.findByModelId(modelId);
    if (!model) {
      return { valid: false, warnings: ['Model not found in registry'] };
    }

    // Check model is available (not deprecated)
    if (!model.available) {
      return { valid: false, warnings: ['Model is not available'] };
    }

    if (model.deprecationDate && new Date(model.deprecationDate) <= new Date()) {
      return { valid: false, warnings: ['Model is deprecated'] };
    }

    // Check BYOK key exists for provider (warning only)
    const byokKeys = await this.byokKeyRepository.find({
      where: { workspaceId, isActive: true },
    });
    const activeProviders = new Set(byokKeys.map((k) => k.provider.toLowerCase()));

    if (!activeProviders.has(model.provider.toLowerCase())) {
      warnings.push(
        `No active BYOK key found for provider '${model.provider}'. Add a key before using this model.`,
      );
    }

    return { valid: true, warnings };
  }

  // --- Private Helpers ---

  /**
   * Get or create workspace settings (ensures defaults exist)
   */
  private async getOrCreateSettings(workspaceId: string): Promise<WorkspaceSettings> {
    let settings = await this.workspaceSettingsRepository.findOne({
      where: { workspaceId },
    });

    if (!settings) {
      settings = this.workspaceSettingsRepository.create({
        workspaceId,
        modelPreset: 'balanced',
        taskModelOverrides: {},
        enabledProviders: [],
        providerPriority: [],
        modelPreferencesEnabled: false,
      });
      settings = await this.workspaceSettingsRepository.save(settings);
    }

    return settings;
  }

  /**
   * Invalidate Redis caches for a workspace
   */
  private async invalidateCaches(workspaceId: string): Promise<void> {
    const prefsCacheKey = `${PREFERENCES_CACHE_PREFIX}${workspaceId}${PREFERENCES_CACHE_SUFFIX}`;
    const routerCacheKey = `${PREFERENCES_CACHE_PREFIX}${workspaceId}${ROUTER_CACHE_SUFFIX}`;

    await this.redisService.del(prefsCacheKey, routerCacheKey);
  }
}
