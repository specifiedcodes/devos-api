/**
 * Pre-Install Check DTOs
 *
 * Story 18-8: Agent Installation Flow
 *
 * DTOs for pre-installation verification endpoint.
 */
import {
  IsUUID,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  IsNumber,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class PreInstallCheckDto {
  @ApiProperty({ description: 'Target workspace ID', format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  workspaceId!: string;

  @ApiPropertyOptional({
    description: 'Target version (defaults to latest)',
    example: '1.2.0',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  version?: string;
}

class DependencyInfoDto {
  @ApiProperty({ description: 'List of required dependency names' })
  @IsArray()
  @IsString({ each: true })
  required!: string[];

  @ApiProperty({ description: 'List of optional dependency names' })
  @IsArray()
  @IsString({ each: true })
  optional!: string[];

  @ApiProperty({ description: 'List of missing dependency names' })
  @IsArray()
  @IsString({ each: true })
  missing!: string[];
}

class ConflictItemDto {
  @ApiProperty({
    description: 'Type of conflict',
    example: 'tool_permission_conflict',
    enum: ['tool_permission_conflict', 'version_conflict', 'resource_conflict', 'trigger_conflict'],
  })
  @IsString()
  type!: string;

  @ApiProperty({
    description: 'Severity level',
    example: 'high',
    enum: ['low', 'medium', 'high', 'critical'],
  })
  @IsString()
  severity!: string;

  @ApiProperty({ description: 'Human-readable conflict message' })
  @IsString()
  message!: string;

  @ApiPropertyOptional({ description: 'Name of the conflicting agent' })
  @IsOptional()
  @IsString()
  conflictingAgent?: string;

  @ApiPropertyOptional({ description: 'Suggested resolution' })
  @IsOptional()
  @IsString()
  resolution?: string;
}

class ConflictsDto {
  @ApiProperty({ description: 'Whether there are conflicts' })
  @IsBoolean()
  hasConflicts!: boolean;

  @ApiProperty({ description: 'List of conflict items', type: [ConflictItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConflictItemDto)
  items!: ConflictItemDto[];
}

class EstimatedCostDto {
  @ApiProperty({
    description: 'Estimated cost per run in cents',
    example: 5,
  })
  @IsNumber()
  perRun!: number;

  @ApiProperty({
    description: 'Human-readable cost description',
    example: 'Approximately $0.05 per agent invocation',
  })
  @IsString()
  description!: string;
}

export class PreInstallCheckResultDto {
  @ApiProperty({
    description: 'Whether the agent can be installed',
    example: true,
  })
  @IsBoolean()
  canInstall!: boolean;

  @ApiProperty({ description: 'Marketplace agent ID', format: 'uuid' })
  @IsUUID()
  agentId!: string;

  @ApiProperty({ description: 'Agent name (slug)' })
  @IsString()
  agentName!: string;

  @ApiProperty({ description: 'Target version to be installed' })
  @IsString()
  targetVersion!: string;

  @ApiProperty({ description: 'List of permissions the agent requires', type: [String] })
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];

  @ApiProperty({ description: 'List of tools the agent uses', type: [String] })
  @IsArray()
  @IsString({ each: true })
  tools!: string[];

  @ApiProperty({ description: 'Dependency information' })
  @ValidateNested()
  @Type(() => DependencyInfoDto)
  dependencies!: DependencyInfoDto;

  @ApiProperty({ description: 'Conflict information' })
  @ValidateNested()
  @Type(() => ConflictsDto)
  conflicts!: ConflictsDto;

  @ApiProperty({ description: 'List of warning messages', type: [String] })
  @IsArray()
  @IsString({ each: true })
  warnings!: string[];

  @ApiProperty({ description: 'Estimated cost information' })
  @ValidateNested()
  @Type(() => EstimatedCostDto)
  estimatedCost!: EstimatedCostDto;

  @ApiProperty({ description: 'Installation recommendations', type: [String] })
  @IsArray()
  @IsString({ each: true })
  recommendations!: string[];
}
