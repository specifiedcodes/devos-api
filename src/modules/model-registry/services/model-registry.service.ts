/**
 * ModelRegistryService
 *
 * Story 13-2: Model Registry
 *
 * NestJS injectable service for CRUD operations on model definitions.
 * Provides filtering, task-based lookup, and idempotent seeding.
 */
import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ModelDefinition,
  TaskType,
} from '../../../database/entities/model-definition.entity';
import { CreateModelDefinitionDto } from '../dto/create-model-definition.dto';
import { UpdateModelDefinitionDto } from '../dto/update-model-definition.dto';
import { SEED_MODELS } from './seed-models.data';

/**
 * Model pricing information compatible with provider.interfaces.ts ModelPricing
 */
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M?: number;
}

/**
 * Filter options for querying models
 */
export interface ModelRegistryFilters {
  provider?: string;
  qualityTier?: 'economy' | 'standard' | 'premium';
  taskType?: TaskType;
  available?: boolean;
  supportsTools?: boolean;
  supportsVision?: boolean;
  supportsEmbedding?: boolean;
}

@Injectable()
export class ModelRegistryService {
  private readonly logger = new Logger(ModelRegistryService.name);

  constructor(
    @InjectRepository(ModelDefinition)
    private readonly modelDefinitionRepository: Repository<ModelDefinition>,
  ) {}

  /**
   * List models with optional filtering
   */
  async findAll(filters?: ModelRegistryFilters): Promise<ModelDefinition[]> {
    const qb = this.modelDefinitionRepository.createQueryBuilder('model');

    if (filters) {
      if (filters.provider !== undefined) {
        qb.andWhere('model.provider = :provider', { provider: filters.provider });
      }
      if (filters.qualityTier !== undefined) {
        qb.andWhere('model.qualityTier = :qualityTier', { qualityTier: filters.qualityTier });
      }
      if (filters.available !== undefined) {
        qb.andWhere('model.available = :available', { available: filters.available });
      }
      if (filters.supportsTools !== undefined) {
        qb.andWhere('model.supportsTools = :supportsTools', { supportsTools: filters.supportsTools });
      }
      if (filters.supportsVision !== undefined) {
        qb.andWhere('model.supportsVision = :supportsVision', { supportsVision: filters.supportsVision });
      }
      if (filters.supportsEmbedding !== undefined) {
        qb.andWhere('model.supportsEmbedding = :supportsEmbedding', { supportsEmbedding: filters.supportsEmbedding });
      }
      if (filters.taskType !== undefined) {
        qb.andWhere('model.suitableFor @> :taskType', { taskType: JSON.stringify([filters.taskType]) });
      }
    }

    qb.orderBy('model.provider', 'ASC').addOrderBy('model.modelId', 'ASC');

    return qb.getMany();
  }

  /**
   * Get single model by model ID
   */
  async findByModelId(modelId: string): Promise<ModelDefinition | null> {
    return this.modelDefinitionRepository.findOne({ where: { modelId } });
  }

  /**
   * Get all models for a provider
   */
  async findByProvider(provider: string): Promise<ModelDefinition[]> {
    return this.modelDefinitionRepository.find({
      where: { provider },
      order: { modelId: 'ASC' },
    });
  }

  /**
   * Find models suitable for a task type, ordered by cost (cheapest first)
   * Only returns available models
   */
  async findSuitableForTask(taskType: TaskType): Promise<ModelDefinition[]> {
    return this.modelDefinitionRepository
      .createQueryBuilder('model')
      .where('model.available = :available', { available: true })
      .andWhere('model.suitableFor @> :taskType', { taskType: JSON.stringify([taskType]) })
      .orderBy('model.inputPricePer1M', 'ASC')
      .getMany();
  }

  /**
   * Create a new model definition
   */
  async create(dto: CreateModelDefinitionDto): Promise<ModelDefinition> {
    // Check for duplicate modelId
    const existing = await this.modelDefinitionRepository.findOne({
      where: { modelId: dto.modelId },
    });

    if (existing) {
      throw new ConflictException(`Model with modelId '${dto.modelId}' already exists`);
    }

    const model = this.modelDefinitionRepository.create({
      modelId: dto.modelId,
      provider: dto.provider,
      displayName: dto.displayName,
      contextWindow: dto.contextWindow,
      maxOutputTokens: dto.maxOutputTokens,
      supportsTools: dto.supportsTools ?? false,
      supportsVision: dto.supportsVision ?? false,
      supportsStreaming: dto.supportsStreaming ?? true,
      supportsEmbedding: dto.supportsEmbedding ?? false,
      inputPricePer1M: dto.inputPricePer1M,
      outputPricePer1M: dto.outputPricePer1M,
      cachedInputPricePer1M: dto.cachedInputPricePer1M ?? null,
      avgLatencyMs: dto.avgLatencyMs ?? 0,
      qualityTier: dto.qualityTier,
      suitableFor: dto.suitableFor ?? [],
      available: dto.available ?? true,
      deprecationDate: dto.deprecationDate ? new Date(dto.deprecationDate) : null,
    });

    return this.modelDefinitionRepository.save(model);
  }

  /**
   * Update model definition (partial update)
   */
  async update(modelId: string, dto: UpdateModelDefinitionDto): Promise<ModelDefinition> {
    const model = await this.modelDefinitionRepository.findOne({ where: { modelId } });

    if (!model) {
      throw new NotFoundException(`Model with modelId '${modelId}' not found`);
    }

    // Merge only provided fields
    if (dto.provider !== undefined) model.provider = dto.provider;
    if (dto.displayName !== undefined) model.displayName = dto.displayName;
    if (dto.contextWindow !== undefined) model.contextWindow = dto.contextWindow;
    if (dto.maxOutputTokens !== undefined) model.maxOutputTokens = dto.maxOutputTokens;
    if (dto.supportsTools !== undefined) model.supportsTools = dto.supportsTools;
    if (dto.supportsVision !== undefined) model.supportsVision = dto.supportsVision;
    if (dto.supportsStreaming !== undefined) model.supportsStreaming = dto.supportsStreaming;
    if (dto.supportsEmbedding !== undefined) model.supportsEmbedding = dto.supportsEmbedding;
    if (dto.inputPricePer1M !== undefined) model.inputPricePer1M = dto.inputPricePer1M;
    if (dto.outputPricePer1M !== undefined) model.outputPricePer1M = dto.outputPricePer1M;
    if (dto.cachedInputPricePer1M !== undefined) model.cachedInputPricePer1M = dto.cachedInputPricePer1M ?? null;
    if (dto.avgLatencyMs !== undefined) model.avgLatencyMs = dto.avgLatencyMs;
    if (dto.qualityTier !== undefined) model.qualityTier = dto.qualityTier;
    if (dto.suitableFor !== undefined) model.suitableFor = dto.suitableFor;
    if (dto.available !== undefined) model.available = dto.available;
    if (dto.deprecationDate !== undefined) {
      model.deprecationDate = dto.deprecationDate ? new Date(dto.deprecationDate) : null;
    }

    return this.modelDefinitionRepository.save(model);
  }

  /**
   * Mark model as deprecated
   */
  async deprecate(modelId: string, deprecationDate: Date): Promise<ModelDefinition> {
    const model = await this.modelDefinitionRepository.findOne({ where: { modelId } });

    if (!model) {
      throw new NotFoundException(`Model with modelId '${modelId}' not found`);
    }

    model.deprecationDate = deprecationDate;
    return this.modelDefinitionRepository.save(model);
  }

  /**
   * Toggle model availability
   */
  async setAvailability(modelId: string, available: boolean): Promise<ModelDefinition> {
    const model = await this.modelDefinitionRepository.findOne({ where: { modelId } });

    if (!model) {
      throw new NotFoundException(`Model with modelId '${modelId}' not found`);
    }

    model.available = available;
    return this.modelDefinitionRepository.save(model);
  }

  /**
   * Return pricing in ModelPricing format
   */
  async getModelPricing(modelId: string): Promise<ModelPricing> {
    const model = await this.modelDefinitionRepository.findOne({ where: { modelId } });

    if (!model) {
      throw new NotFoundException(`Model with modelId '${modelId}' not found`);
    }

    const pricing: ModelPricing = {
      inputPer1M: Number(model.inputPricePer1M),
      outputPer1M: Number(model.outputPricePer1M),
    };

    if (model.cachedInputPricePer1M !== null && model.cachedInputPricePer1M !== undefined) {
      pricing.cachedInputPer1M = Number(model.cachedInputPricePer1M);
    }

    return pricing;
  }

  /**
   * Seed database with default model definitions (idempotent)
   * Fetches all existing modelIds in a single query, then batch-inserts only new models.
   */
  async seedDefaults(): Promise<void> {
    // Single query to get all existing modelIds
    const existingModels = await this.modelDefinitionRepository.find({
      select: ['modelId'],
    });
    const existingModelIds = new Set(existingModels.map(m => m.modelId));

    // Filter to only new models
    const newSeedModels = SEED_MODELS.filter(s => !existingModelIds.has(s.modelId));

    if (newSeedModels.length > 0) {
      const entities = newSeedModels.map(seedModel =>
        this.modelDefinitionRepository.create({ ...seedModel }),
      );
      await this.modelDefinitionRepository.save(entities);
    }

    this.logger.log(`Model registry seeded: ${newSeedModels.length} new models (${SEED_MODELS.length} total in seed data)`);
  }
}
