/**
 * ModelRegistryFilters DTO
 *
 * Story 13-2: Model Registry
 *
 * Optional filter fields for querying model definitions.
 */
import { IsOptional, IsString, IsBoolean, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';
import { TaskType, QualityTier, VALID_TASK_TYPES, VALID_QUALITY_TIERS } from '../../../database/entities/model-definition.entity';

/**
 * Transforms query string boolean values ('true'/'false'/true/false) to proper booleans.
 * Returns undefined for values that are not recognizable booleans, which lets
 * the @IsOptional() + @IsBoolean() validators handle invalid input.
 */
const booleanTransform = ({ value }: { value: any }) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value; // Let @IsBoolean() validator reject invalid values
};

export class ModelRegistryFiltersDto {
  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  @IsIn(VALID_QUALITY_TIERS)
  qualityTier?: QualityTier;

  @IsOptional()
  @IsString()
  @IsIn(VALID_TASK_TYPES)
  taskType?: TaskType;

  @IsOptional()
  @Transform(booleanTransform)
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @Transform(booleanTransform)
  @IsBoolean()
  supportsTools?: boolean;

  @IsOptional()
  @Transform(booleanTransform)
  @IsBoolean()
  supportsVision?: boolean;

  @IsOptional()
  @Transform(booleanTransform)
  @IsBoolean()
  supportsEmbedding?: boolean;
}
