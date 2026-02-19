/**
 * AgentVersionResponseDto
 *
 * Story 18-4: Agent Versioning
 *
 * Response DTOs for agent version endpoints.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AgentVersionResponseDto {
  @ApiProperty({ description: 'Unique identifier for the version', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'ID of the agent definition this version belongs to', format: 'uuid' })
  agentDefinitionId!: string;

  @ApiProperty({ description: 'Semver version string', example: '1.2.0' })
  version!: string;

  @ApiProperty({ description: 'Complete agent definition snapshot at this version' })
  definitionSnapshot!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Changelog describing changes in this version' })
  changelog?: string;

  @ApiProperty({ description: 'Whether this version is published to the marketplace' })
  isPublished!: boolean;

  @ApiPropertyOptional({ description: 'Timestamp when this version was published' })
  publishedAt?: Date;

  @ApiProperty({ description: 'ID of the user who created this version', format: 'uuid' })
  createdBy!: string;

  @ApiProperty({ description: 'Timestamp when this version was created' })
  createdAt!: Date;
}

export class PaginatedVersionListDto {
  @ApiProperty({ type: [AgentVersionResponseDto], description: 'List of agent versions' })
  items!: AgentVersionResponseDto[];

  @ApiProperty({ description: 'Total number of versions' })
  total!: number;

  @ApiProperty({ description: 'Current page number' })
  page!: number;

  @ApiProperty({ description: 'Number of items per page' })
  limit!: number;
}

export class VersionChangeDto {
  @ApiProperty({ description: 'JSON path to changed field', example: 'definition.model_preferences.preferred' })
  path!: string;

  @ApiProperty({
    description: 'Type of change',
    enum: ['added', 'modified', 'removed'],
    example: 'modified',
  })
  type!: 'added' | 'modified' | 'removed';

  @ApiPropertyOptional({ description: 'Old value (null if added)' })
  oldValue?: unknown;

  @ApiPropertyOptional({ description: 'New value (null if removed)' })
  newValue?: unknown;
}

export class VersionDiffSummaryDto {
  @ApiProperty({ description: 'Number of fields added' })
  added!: number;

  @ApiProperty({ description: 'Number of fields modified' })
  modified!: number;

  @ApiProperty({ description: 'Number of fields removed' })
  removed!: number;
}

export class VersionDiffResponseDto {
  @ApiProperty({ description: 'Source version', example: '1.0.0' })
  fromVersion!: string;

  @ApiProperty({ description: 'Target version', example: '1.2.0' })
  toVersion!: string;

  @ApiProperty({ type: [VersionChangeDto], description: 'Field-level changes' })
  changes!: VersionChangeDto[];

  @ApiProperty({ description: 'Summary of change types' })
  summary!: VersionDiffSummaryDto;
}
