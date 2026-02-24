/**
 * Linear Integration DTOs
 * Story 21.5: Linear Two-Way Sync (AC6)
 *
 * Data transfer objects for Linear integration API endpoints.
 */

import { IsString, IsNotEmpty, IsOptional, IsObject, IsIn, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteLinearSetupDto {
  @ApiProperty({ description: 'Integration ID from OAuth callback' })
  @IsUUID()
  integrationId!: string;

  @ApiProperty({ description: 'Linear team ID to sync with' })
  @IsString()
  @IsNotEmpty()
  teamId!: string;

  @ApiPropertyOptional({ description: 'Status mapping from DevOS to Linear' })
  @IsOptional()
  @IsObject()
  statusMapping?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Field mapping from DevOS to Linear' })
  @IsOptional()
  @IsObject()
  fieldMapping?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Sync direction', enum: ['devos_to_linear', 'linear_to_devos', 'bidirectional'] })
  @IsOptional()
  @IsIn(['devos_to_linear', 'linear_to_devos', 'bidirectional'])
  syncDirection?: 'devos_to_linear' | 'linear_to_devos' | 'bidirectional';
}

export class UpdateLinearStatusMappingDto {
  @ApiProperty({ description: 'Status mapping from DevOS to Linear' })
  @IsObject()
  @IsNotEmpty()
  statusMapping!: Record<string, string>;
}

export class UpdateLinearSyncDirectionDto {
  @ApiProperty({ description: 'Sync direction', enum: ['devos_to_linear', 'linear_to_devos', 'bidirectional'] })
  @IsIn(['devos_to_linear', 'linear_to_devos', 'bidirectional'])
  syncDirection!: 'devos_to_linear' | 'linear_to_devos' | 'bidirectional';
}

export class ResolveLinearConflictDto {
  @ApiProperty({ description: 'Resolution strategy', enum: ['keep_devos', 'keep_linear'] })
  @IsIn(['keep_devos', 'keep_linear'])
  resolution!: 'keep_devos' | 'keep_linear';
}

export class LinkStoryToIssueDto {
  @ApiProperty({ description: 'DevOS story ID' })
  @IsUUID()
  storyId!: string;

  @ApiProperty({ description: 'Linear issue ID' })
  @IsString()
  @IsNotEmpty()
  linearIssueId!: string;
}

export class LinearIntegrationStatusDto {
  connected!: boolean;
  teamName?: string;
  teamId?: string;
  syncDirection?: string;
  statusMapping?: Record<string, string>;
  isActive?: boolean;
  lastSyncAt?: string;
  lastError?: string;
  lastErrorAt?: string;
  errorCount?: number;
  syncCount?: number;
  syncItemStats?: {
    total: number;
    synced: number;
    pending: number;
    conflict: number;
    error: number;
  };
  connectedAt?: string;
  connectedBy?: string;
}

// Linear API Interfaces
export interface CreateLinearIssueInput {
  teamId: string;
  title: string;
  description?: string;
  stateId?: string;
  priority?: number; // 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low
  estimate?: number;
  labelIds?: string[];
}

export interface UpdateLinearIssueInput {
  title?: string;
  description?: string;
  stateId?: string;
  priority?: number;
  estimate?: number;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  url: string;
  state: { id: string; name: string; type: string };
  priority: number;
  estimate?: number;
  updatedAt: string;
  createdAt: string;
}

export interface LinearWebhookPayload {
  action: 'create' | 'update' | 'remove';
  type: 'Issue' | 'Comment' | 'IssueLabel';
  data: Record<string, unknown>;
  url?: string;
  createdAt: string;
  organizationId?: string;
}

export interface LinearSyncJob {
  type: 'devos_to_linear' | 'linear_to_devos' | 'full_sync';
  workspaceId: string;
  storyId?: string;
  integrationId?: string;
  linearIssueId?: string;
  updatedFields?: Partial<LinearIssue>;
}
