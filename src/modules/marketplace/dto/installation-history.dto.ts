/**
 * Installation History DTOs
 *
 * Story 18-8: Agent Installation Flow
 *
 * DTOs for installation history queries and responses.
 */
import {
  IsUUID,
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  Min,
  Max,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { InstallationStatus } from './installation-status.dto';

export class InstallationHistoryQueryDto {
  @ApiPropertyOptional({ description: 'Filter by status', enum: InstallationStatus })
  @IsOptional()
  @IsEnum(InstallationStatus)
  status?: InstallationStatus;

  @ApiPropertyOptional({ description: 'Filter by start date (ISO string)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Filter by end date (ISO string)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

class InstallationHistoryItemAgentDto {
  @ApiProperty({ description: 'Agent ID', format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiProperty({ description: 'Agent display name' })
  @IsString()
  displayName!: string;

  @ApiPropertyOptional({ description: 'Agent icon URL' })
  @IsOptional()
  @IsString()
  iconUrl?: string;
}

export class InstallationHistoryItemDto {
  @ApiProperty({ description: 'Installation ID', format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiProperty({ description: 'Workspace ID', format: 'uuid' })
  @IsUUID()
  workspaceId!: string;

  @ApiProperty({ description: 'Marketplace agent ID', format: 'uuid' })
  @IsUUID()
  marketplaceAgentId!: string;

  @ApiProperty({ description: 'Agent information' })
  @ValidateNested()
  @Type(() => InstallationHistoryItemAgentDto)
  agent!: InstallationHistoryItemAgentDto;

  @ApiProperty({ description: 'Target version' })
  @IsString()
  targetVersion!: string;

  @ApiProperty({ description: 'Installation status', enum: InstallationStatus })
  @IsEnum(InstallationStatus)
  status!: InstallationStatus;

  @ApiPropertyOptional({ description: 'User ID who initiated installation', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  initiatedBy?: string;

  @ApiPropertyOptional({ description: 'User name who initiated installation' })
  @IsOptional()
  @IsString()
  initiatedByName?: string;

  @ApiPropertyOptional({ description: 'Installed agent ID if completed', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  installedAgentId?: string;

  @ApiPropertyOptional({ description: 'Error message if failed' })
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @ApiProperty({ description: 'Duration in milliseconds', example: 5432 })
  @IsNumber()
  duration!: number;

  @ApiProperty({ description: 'When installation started' })
  @IsDateString()
  startedAt!: string;

  @ApiPropertyOptional({ description: 'When installation completed' })
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiProperty({ description: 'When record was created' })
  @IsDateString()
  createdAt!: string;
}

export class PaginatedInstallationLogDto {
  @ApiProperty({ description: 'List of installation history items', type: [InstallationHistoryItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InstallationHistoryItemDto)
  items!: InstallationHistoryItemDto[];

  @ApiProperty({ description: 'Total number of items' })
  @IsNumber()
  total!: number;

  @ApiProperty({ description: 'Current page number' })
  @IsNumber()
  page!: number;

  @ApiProperty({ description: 'Items per page' })
  @IsNumber()
  limit!: number;
}
