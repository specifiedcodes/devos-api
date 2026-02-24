/**
 * Model Registry - Barrel Export
 *
 * Story 13-2: Model Registry
 */
export { ModelRegistryModule } from './model-registry.module';
export { ModelRegistryService } from './services/model-registry.service';
export type { ModelPricing, ModelRegistryFilters } from './services/model-registry.service';
export { ModelDefinition, VALID_TASK_TYPES, VALID_QUALITY_TIERS } from '../../database/entities/model-definition.entity';
export type { TaskType, QualityTier } from '../../database/entities/model-definition.entity';
export { CreateModelDefinitionDto } from './dto/create-model-definition.dto';
export { UpdateModelDefinitionDto } from './dto/update-model-definition.dto';
export { ModelRegistryFiltersDto } from './dto/model-registry-filters.dto';
