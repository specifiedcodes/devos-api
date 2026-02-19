/**
 * Create Test Scenario DTO
 *
 * Story 18-3: Agent Sandbox Testing
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { AgentDefinitionCategory } from '../../../database/entities/agent-definition.entity';

export class CreateTestScenarioDto {
  @ApiProperty({
    description: 'Name of the test scenario',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    description: 'Description of what the scenario tests',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Category this scenario is designed for',
    enum: AgentDefinitionCategory,
  })
  @IsOptional()
  @IsEnum(AgentDefinitionCategory)
  category?: AgentDefinitionCategory;

  @ApiProperty({
    description: 'Sample input for the test scenario',
    type: 'object',
  })
  @IsObject()
  sampleInput!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Expected behavior or outputs',
    type: 'object',
  })
  @IsOptional()
  @IsObject()
  expectedBehavior?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Optional setup script to prepare sandbox',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  setupScript?: string;

  @ApiPropertyOptional({
    description: 'Optional validation script to check results',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  validationScript?: string;
}

export class TestScenarioDto {
  @ApiProperty({ description: 'Scenario ID', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Workspace ID', format: 'uuid' })
  workspaceId!: string;

  @ApiPropertyOptional({ description: 'Agent definition ID if specific', format: 'uuid' })
  agentDefinitionId?: string | null;

  @ApiProperty({ description: 'Scenario name' })
  name!: string;

  @ApiPropertyOptional({ description: 'Scenario description' })
  description?: string | null;

  @ApiPropertyOptional({ description: 'Category for the scenario', enum: AgentDefinitionCategory })
  category?: AgentDefinitionCategory | null;

  @ApiProperty({ description: 'Whether this is a built-in scenario' })
  isBuiltIn!: boolean;

  @ApiProperty({ description: 'Sample input' })
  sampleInput!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Expected behavior' })
  expectedBehavior?: Record<string, unknown> | null;

  @ApiPropertyOptional({ description: 'Setup script' })
  setupScript?: string | null;

  @ApiPropertyOptional({ description: 'Validation script' })
  validationScript?: string | null;

  @ApiProperty({ description: 'Creator user ID', format: 'uuid' })
  createdBy!: string;

  @ApiProperty({ description: 'When created', format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ description: 'When last updated', format: 'date-time' })
  updatedAt!: Date;
}
