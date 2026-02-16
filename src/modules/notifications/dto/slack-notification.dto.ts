/**
 * Slack Notification DTOs
 * Story 16.4: Slack Notification Integration
 *
 * DTOs for Slack integration configuration and status endpoints.
 */

import {
  IsOptional,
  IsString,
  IsObject,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSlackConfigDto {
  @ApiPropertyOptional({ description: 'Default Slack channel ID' })
  @IsOptional()
  @IsString()
  defaultChannelId?: string;

  @ApiPropertyOptional({ description: 'Default Slack channel name' })
  @IsOptional()
  @IsString()
  defaultChannelName?: string;

  @ApiPropertyOptional({
    description: 'Per-event-type channel routing configuration',
    example: { deployment_failed: { channelId: 'C123', channelName: '#alerts' } },
  })
  @IsOptional()
  @IsObject()
  eventChannelConfig?: Record<string, { channelId: string; channelName: string }>;

  @ApiPropertyOptional({
    description: 'Quiet hours configuration for Slack notifications',
    example: { enabled: true, startTime: '22:00', endTime: '08:00', timezone: 'UTC' },
  })
  @IsOptional()
  @IsObject()
  quietHoursConfig?: { enabled: boolean; startTime: string; endTime: string; timezone: string };

  @ApiPropertyOptional({
    description: 'Maximum Slack messages per hour per workspace (1-120)',
    minimum: 1,
    maximum: 120,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  rateLimitPerHour?: number;

  @ApiPropertyOptional({
    description: 'Per-urgency mention configuration',
    example: { critical: '@here', normal: null },
  })
  @IsOptional()
  @IsObject()
  mentionConfig?: Record<string, string | null>;
}

export class SlackIntegrationStatusDto {
  connected!: boolean;
  teamName?: string;
  teamId?: string;
  defaultChannelId?: string;
  defaultChannelName?: string;
  status?: string;
  eventChannelConfig?: Record<string, { channelId: string; channelName: string }>;
  quietHoursConfig?: { enabled: boolean; startTime: string; endTime: string; timezone: string } | null;
  rateLimitPerHour?: number;
  mentionConfig?: Record<string, string | null>;
  messageCount?: number;
  errorCount?: number;
  lastMessageAt?: string;
  connectedAt?: string;
  connectedByName?: string;
}
