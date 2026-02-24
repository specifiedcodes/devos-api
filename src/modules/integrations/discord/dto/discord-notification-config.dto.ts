/**
 * Discord Notification Config DTOs
 * Story 21.3: Discord Webhook Integration (AC4)
 *
 * DTOs for notification config CRUD, webhook verification, and detailed status.
 */

import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsUUID,
  IsIn,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Allowed Discord event types for notification routing.
 */
export const DISCORD_EVENT_TYPES = [
  'story_completed',
  'epic_completed',
  'deployment_success',
  'deployment_failed',
  'agent_error',
  'agent_message',
  'context_degraded',
  'context_critical',
] as const;

export type DiscordEventType = (typeof DISCORD_EVENT_TYPES)[number];

export class UpsertDiscordNotificationConfigDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(DISCORD_EVENT_TYPES as unknown as string[])
  @ApiProperty({
    description: 'Event type for the notification config',
    enum: DISCORD_EVENT_TYPES,
  })
  eventType!: string;

  @IsOptional()
  @IsUUID()
  @ApiPropertyOptional({ description: 'Project ID for project-specific config' })
  projectId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/, {
    message: 'Invalid Discord webhook URL format',
  })
  @ApiPropertyOptional({ description: 'Override webhook URL for this event type' })
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Channel name for display' })
  channelName?: string;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Whether this config is enabled' })
  isEnabled?: boolean;
}

export class ToggleDiscordNotificationConfigDto {
  @IsBoolean()
  @ApiProperty({ description: 'Enable or disable the config' })
  isEnabled!: boolean;
}

export class VerifyDiscordWebhookDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/, {
    message: 'Invalid Discord webhook URL format',
  })
  @ApiProperty({
    description: 'Discord webhook URL to verify',
    example: 'https://discord.com/api/webhooks/123456/abcdef',
  })
  webhookUrl!: string;
}

export class DetailedDiscordStatusDto {
  connected!: boolean;
  name?: string;
  guildName?: string;
  guildId?: string;
  defaultWebhookId?: string;
  defaultChannelName?: string;
  status?: string;
  quietHoursConfig?: { enabled: boolean; startTime: string; endTime: string; timezone: string } | null;
  rateLimitPerMinute?: number;
  mentionConfig?: Record<string, string | null>;
  messageCount?: number;
  errorCount?: number;
  lastMessageAt?: string;
  lastError?: string;
  lastErrorAt?: string;
  connectedAt?: string;
  connectedBy?: string;
}
