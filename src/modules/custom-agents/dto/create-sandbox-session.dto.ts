/**
 * Create Sandbox Session DTO
 *
 * Story 18-3: Agent Sandbox Testing
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsUUID,
  IsObject,
} from 'class-validator';
import { SandboxSampleProject } from '../../../database/entities/agent-sandbox-session.entity';

export class CreateSandboxSessionDto {
  @ApiPropertyOptional({
    description: 'Sample project type for sandbox testing',
    enum: SandboxSampleProject,
    default: SandboxSampleProject.NEXTJS,
  })
  @IsOptional()
  @IsEnum(SandboxSampleProject)
  sampleProject?: SandboxSampleProject;

  @ApiPropertyOptional({
    description: 'Optional test scenario ID to use',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  testScenarioId?: string;

  @ApiPropertyOptional({
    description: 'Session timeout in minutes',
    default: 10,
    minimum: 1,
    maximum: 60,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  timeoutMinutes?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of tool calls allowed',
    default: 50,
    minimum: 1,
    maximum: 200,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  maxToolCalls?: number;

  @ApiPropertyOptional({
    description: 'Maximum tokens for the session',
    default: 100000,
    minimum: 1000,
    maximum: 500000,
  })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(500000)
  maxTokens?: number;

  @ApiPropertyOptional({
    description: 'Custom test inputs for the sandbox session',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  testInputs?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Additional sandbox configuration options',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  sandboxConfig?: Record<string, unknown>;
}
