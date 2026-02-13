import { IsString, IsNotEmpty, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  AiProvider,
  VALID_MODELS_BY_PROVIDER,
} from '../../../database/entities/project-preferences.entity';

/**
 * DTO for updating per-project AI provider and model configuration.
 *
 * Validation note: The aiModel must be valid for the chosen aiProvider.
 * Cross-field validation is performed in the service layer since
 * class-validator decorators don't easily support cross-field logic.
 */
export class UpdateAiConfigDto {
  @ApiProperty({
    description: 'AI provider identifier',
    example: 'anthropic',
    enum: AiProvider,
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(Object.values(AiProvider), {
    message: `aiProvider must be one of: ${Object.values(AiProvider).join(', ')}`,
  })
  aiProvider!: string;

  @ApiProperty({
    description: 'AI model identifier (must be valid for the chosen provider)',
    example: 'claude-sonnet-4-5-20250929',
  })
  @IsString()
  @IsNotEmpty()
  aiModel!: string;
}

/**
 * Response DTO for AI configuration
 */
export class AiConfigResponseDto {
  @ApiProperty({ description: 'AI provider', example: 'anthropic' })
  aiProvider!: string;

  @ApiProperty({
    description: 'AI model',
    example: 'claude-sonnet-4-5-20250929',
  })
  aiModel!: string;
}

/**
 * Model information for the available models endpoint
 */
export interface ModelInfo {
  id: string;
  name: string;
  tier: 'recommended' | 'premium' | 'standard' | 'legacy';
}

/**
 * Provider information for the available models endpoint
 */
export interface ProviderInfo {
  id: string;
  name: string;
  models: ModelInfo[];
}

/**
 * Response for the available models endpoint
 */
export interface AvailableModelsResponse {
  providers: ProviderInfo[];
}

/**
 * Static data for available AI providers and models.
 * Used by both the available-models endpoint and validation logic.
 */
export const AVAILABLE_PROVIDERS: ProviderInfo[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    models: [
      {
        id: 'claude-sonnet-4-5-20250929',
        name: 'Claude Sonnet 4.5',
        tier: 'recommended',
      },
      {
        id: 'claude-opus-4-5-20251101',
        name: 'Claude Opus 4.5',
        tier: 'premium',
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet (Legacy)',
        tier: 'legacy',
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus (Legacy)',
        tier: 'legacy',
      },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT)',
    models: [
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', tier: 'recommended' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', tier: 'standard' },
    ],
  },
];
