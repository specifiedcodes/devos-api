import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsObject,
  IsArray,
  MaxLength,
  MinLength,
  Matches,
  ArrayMaxSize,
  IsIn,
} from 'class-validator';
import { AgentDefinitionCategory } from '../../../database/entities/agent-definition.entity';
import { AGENT_DEFINITION_CONSTANTS } from '../constants/agent-definition.constants';

export class CreateAgentDefinitionDto {
  @ApiProperty({ description: 'Machine-readable slug name (unique per workspace)', example: 'code-reviewer' })
  @IsString()
  @IsNotEmpty()
  @MinLength(AGENT_DEFINITION_CONSTANTS.MIN_NAME_LENGTH)
  @MaxLength(AGENT_DEFINITION_CONSTANTS.MAX_NAME_LENGTH)
  @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message: 'name must be a valid slug (lowercase alphanumeric with hyphens, no leading/trailing hyphens, min 2 chars)',
  })
  name!: string;

  @ApiProperty({ description: 'Human-friendly display name', example: 'Code Reviewer' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayName!: string;

  @ApiPropertyOptional({ description: 'Description of what the agent does (markdown supported)', example: 'Reviews code for best practices, security, and performance' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Semantic version', example: '1.0.0', default: '1.0.0' })
  @IsString()
  @IsOptional()
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'version must follow semver format (e.g., 1.0.0)' })
  version?: string;

  @ApiProperty({
    description: 'Agent definition spec (system prompt, model preferences, tools, triggers, inputs, outputs)',
    example: {
      role: 'You are an expert code reviewer',
      system_prompt: 'You are a senior software engineer specializing in code review.',
      model_preferences: { preferred: 'claude-sonnet-4-20250514', max_tokens: 4096, temperature: 0.3 },
    },
  })
  @IsObject()
  @IsNotEmpty()
  definition!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Icon identifier from predefined set', example: 'shield-check', default: 'bot' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  icon?: string;

  @ApiProperty({ description: 'Agent category', example: 'development', enum: AgentDefinitionCategory })
  @IsString()
  @IsNotEmpty()
  @IsIn(AGENT_DEFINITION_CONSTANTS.CATEGORIES)
  category!: string;

  @ApiPropertyOptional({ description: 'Tags for discovery/filtering', example: ['code-quality', 'security', 'review'] })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  @ArrayMaxSize(AGENT_DEFINITION_CONSTANTS.MAX_TAGS)
  tags?: string[];
}
