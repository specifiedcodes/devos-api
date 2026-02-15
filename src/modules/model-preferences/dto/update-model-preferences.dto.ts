/**
 * UpdateModelPreferencesDto
 *
 * Story 13-9: User Model Preferences
 *
 * DTO for updating workspace model preferences.
 * All fields are optional to support partial updates.
 */
import {
  IsOptional,
  IsBoolean,
  IsString,
  IsNotEmpty,
  IsIn,
  IsObject,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ValidateModelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  modelId!: string;
}

export class TaskModelOverrideDto {
  @IsString()
  @MaxLength(100)
  model!: string;

  @IsString()
  @MaxLength(100)
  fallback!: string;
}

export class UpdateModelPreferencesDto {
  @IsOptional()
  @IsBoolean()
  modelPreferencesEnabled?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['auto', 'economy', 'quality', 'balanced'])
  preset?: string;

  // Note: Nested validation of Record<string, T> is not supported by class-validator.
  // Model/fallback validation is handled by ModelPreferencesService.updatePreferences()
  // which checks model IDs against the model registry.
  @IsOptional()
  @IsObject()
  taskOverrides?: Record<string, TaskModelOverrideDto>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledProviders?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  providerPriority?: string[];
}
