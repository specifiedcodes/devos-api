/**
 * Jira Integration DTOs
 * Story 21.6: Jira Two-Way Sync (AC6)
 *
 * Data transfer objects for Jira integration API endpoints.
 */

import { IsString, IsNotEmpty, IsOptional, IsObject, IsIn, IsUUID, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteJiraSetupDto {
  @ApiProperty({ description: 'Atlassian Cloud ID' })
  @IsString()
  @IsNotEmpty()
  cloudId!: string;

  @ApiProperty({ description: 'Jira site URL' })
  @IsString()
  @IsNotEmpty()
  siteUrl!: string;

  @ApiProperty({ description: 'Jira project key' })
  @IsString()
  @IsNotEmpty()
  projectKey!: string;

  @ApiPropertyOptional({ description: 'Jira project name' })
  @IsOptional()
  @IsString()
  projectName?: string;

  @ApiPropertyOptional({ description: 'Status mapping from DevOS to Jira' })
  @IsOptional()
  @IsObject()
  statusMapping?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Field mapping from DevOS to Jira' })
  @IsOptional()
  @IsObject()
  fieldMapping?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Jira issue type for new issues' })
  @IsOptional()
  @IsString()
  issueType?: string;

  @ApiPropertyOptional({ description: 'Sync direction', enum: ['devos_to_jira', 'jira_to_devos', 'bidirectional'] })
  @IsOptional()
  @IsIn(['devos_to_jira', 'jira_to_devos', 'bidirectional'])
  syncDirection?: 'devos_to_jira' | 'jira_to_devos' | 'bidirectional';
}

export class UpdateJiraStatusMappingDto {
  @ApiProperty({ description: 'Status mapping from DevOS to Jira' })
  @IsObject()
  @IsNotEmpty()
  statusMapping!: Record<string, string>;
}

export class UpdateJiraSyncDirectionDto {
  @ApiProperty({ description: 'Sync direction', enum: ['devos_to_jira', 'jira_to_devos', 'bidirectional'] })
  @IsIn(['devos_to_jira', 'jira_to_devos', 'bidirectional'])
  syncDirection!: 'devos_to_jira' | 'jira_to_devos' | 'bidirectional';
}

export class UpdateJiraIssueTypeDto {
  @ApiProperty({ description: 'Jira issue type' })
  @IsString()
  @IsNotEmpty()
  issueType!: string;
}

export class ResolveJiraConflictDto {
  @ApiProperty({ description: 'Resolution strategy', enum: ['keep_devos', 'keep_jira'] })
  @IsIn(['keep_devos', 'keep_jira'])
  resolution!: 'keep_devos' | 'keep_jira';
}

export class LinkStoryToJiraIssueDto {
  @ApiProperty({ description: 'DevOS story ID' })
  @IsUUID()
  storyId!: string;

  @ApiProperty({ description: 'Jira issue key (e.g., PROJ-123)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z][A-Z0-9_]+-\d+$/, { message: 'jiraIssueKey must be a valid Jira issue key (e.g., PROJ-123)' })
  jiraIssueKey!: string;
}

export class JiraIntegrationStatusDto {
  connected!: boolean;
  siteUrl?: string;
  siteName?: string;
  projectKey?: string;
  projectName?: string;
  issueType?: string;
  syncDirection?: string;
  statusMapping?: Record<string, string>;
  isActive?: boolean;
  lastSyncAt?: string;
  lastError?: string;
  lastErrorAt?: string;
  errorCount?: number;
  syncCount?: number;
  tokenExpiresAt?: string;
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

// Jira API Interfaces

export interface CreateJiraIssueInput {
  projectKey: string;
  issueType: string;
  summary: string;
  description?: string; // ADF JSON string
  priority?: { name: string };
  storyPoints?: number;
  labels?: string[];
}

export interface UpdateJiraIssueInput {
  summary?: string;
  description?: string; // ADF JSON string
  priority?: { name: string };
  storyPoints?: number;
  labels?: string[];
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: unknown; // ADF JSON
    status: { id: string; name: string; statusCategory: { key: string; name: string } };
    issuetype: { id: string; name: string; subtask: boolean };
    priority?: { id: string; name: string };
    [key: string]: unknown;
  };
  changelog?: {
    histories: Array<{
      created: string;
      items: Array<{ field: string; fromString: string; toString: string }>;
    }>;
  };
}

export interface JiraWebhookPayload {
  webhookEvent: string;
  timestamp: number;
  issue?: JiraIssue;
  changelog?: {
    items: Array<{
      field: string;
      fieldtype: string;
      from: string | null;
      fromString: string | null;
      to: string | null;
      toString: string | null;
    }>;
  };
  comment?: {
    id: string;
    body: unknown;
    author: { accountId: string; displayName: string };
    created: string;
    updated: string;
  };
  user?: {
    accountId: string;
    displayName: string;
  };
}

export interface JiraWebhookEvent {
  webhookEvent: string;
  changelog?: {
    items: Array<{
      field: string;
      fromString: string | null;
      toString: string | null;
    }>;
  };
  issue?: JiraIssue;
}

export interface JiraSyncJob {
  type: 'devos_to_jira' | 'jira_to_devos' | 'full_sync';
  workspaceId: string;
  storyId?: string;
  integrationId?: string;
  jiraIssueId?: string;
  webhookEvent?: JiraWebhookEvent;
}
