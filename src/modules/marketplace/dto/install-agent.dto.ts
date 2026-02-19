/**
 * Install Agent DTOs
 *
 * Story 18-5: Agent Marketplace Backend
 *
 * DTOs for installing agents to workspaces.
 */
import { IsUUID, IsNotEmpty, IsOptional, IsBoolean, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MarketplaceAgentSummaryDto } from './marketplace-response.dto';

export class InstallAgentDto {
  @ApiProperty({ description: 'Target workspace ID' })
  @IsUUID()
  @IsNotEmpty()
  workspaceId!: string;

  @ApiPropertyOptional({ description: 'Enable auto-update', default: false })
  @IsOptional()
  @IsBoolean()
  autoUpdate?: boolean;
}

export class UninstallAgentDto {
  @ApiProperty({ description: 'Workspace ID' })
  @IsUUID()
  @IsNotEmpty()
  workspaceId!: string;
}

export class UpdateInstalledDto {
  @ApiProperty({ description: 'Workspace ID' })
  @IsUUID()
  @IsNotEmpty()
  workspaceId!: string;
}

export class CheckUpdatesDto {
  @ApiProperty({ description: 'Workspace ID' })
  @IsUUID()
  @IsNotEmpty()
  workspaceId!: string;
}

export class InstalledAgentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  marketplaceAgentId!: string;

  @ApiProperty()
  workspaceId!: string;

  @ApiProperty()
  installedVersion!: string;

  @ApiProperty()
  autoUpdate!: boolean;

  @ApiPropertyOptional()
  localDefinitionId?: string;

  @ApiProperty()
  installedAt!: Date;

  @ApiProperty()
  agent!: MarketplaceAgentSummaryDto;
}

export class PaginatedInstalledListDto {
  @ApiProperty({ type: [InstalledAgentResponseDto] })
  items!: InstalledAgentResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}

export class AgentUpdateAvailableDto {
  @ApiProperty()
  marketplaceAgentId!: string;

  @ApiProperty()
  installedVersion!: string;

  @ApiProperty()
  latestVersion!: string;

  @ApiProperty()
  agentName!: string;
}

export class ListInstalledQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsString()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsString()
  limit?: number = 20;
}
