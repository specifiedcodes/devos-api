/**
 * CreateModelDefinitionDto
 *
 * Story 13-2: Model Registry
 *
 * DTO for creating a new model definition with validation decorators.
 */
import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  IsOptional,
  IsIn,
  MaxLength,
  Min,
} from 'class-validator';
import { VALID_TASK_TYPES, VALID_QUALITY_TIERS, TaskType, QualityTier } from '../../../database/entities/model-definition.entity';

export class CreateModelDefinitionDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  modelId!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  provider!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  displayName!: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  contextWindow!: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  maxOutputTokens!: number;

  @IsOptional()
  @IsBoolean()
  supportsTools?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsVision?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsStreaming?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsEmbedding?: boolean;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  inputPricePer1M!: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  outputPricePer1M!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cachedInputPricePer1M?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  avgLatencyMs?: number;

  @IsNotEmpty()
  @IsString()
  @IsIn(VALID_QUALITY_TIERS)
  qualityTier!: QualityTier;

  @IsOptional()
  @IsArray()
  @IsIn(VALID_TASK_TYPES, { each: true })
  suitableFor?: TaskType[];

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsString()
  deprecationDate?: string | null;
}
