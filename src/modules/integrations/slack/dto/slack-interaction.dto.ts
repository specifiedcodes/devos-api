/**
 * Slack Interaction DTOs
 * Story 21.2: Slack Interactive Components (AC8)
 *
 * DTOs for notification config management and interaction payloads.
 */

import { IsNotEmpty, IsOptional, IsString, IsUUID, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertNotificationConfigDto {
  @ApiProperty({ description: 'Slack integration ID' })
  @IsNotEmpty()
  @IsUUID()
  slackIntegrationId!: string;

  @ApiPropertyOptional({ description: 'Project ID (null = all projects)' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiProperty({ description: 'Notification event type' })
  @IsNotEmpty()
  @IsString()
  eventType!: string;

  @ApiProperty({ description: 'Slack channel ID' })
  @IsNotEmpty()
  @IsString()
  channelId!: string;

  @ApiPropertyOptional({ description: 'Slack channel name' })
  @IsOptional()
  @IsString()
  channelName?: string;

  @ApiPropertyOptional({ default: true, description: 'Whether this config is enabled' })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
