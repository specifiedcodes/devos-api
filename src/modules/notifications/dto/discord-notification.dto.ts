/**
 * Discord Notification DTOs
 * Story 16.5: Discord Notification Integration (AC5)
 *
 * DTOs for Discord integration configuration and status endpoints.
 */

import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsObject,
  IsInt,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddDiscordWebhookDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/, {
    message: 'Invalid Discord webhook URL format',
  })
  @ApiProperty({
    description: 'Discord webhook URL',
    example: 'https://discord.com/api/webhooks/123456/abcdef',
  })
  webhookUrl!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Channel name for display' })
  channelName?: string;
}

export class UpdateDiscordConfigDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Display name for this integration' })
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/, {
    message: 'Invalid Discord webhook URL format',
  })
  @ApiPropertyOptional({ description: 'New default webhook URL' })
  defaultWebhookUrl?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Default channel name for display' })
  defaultChannelName?: string;

  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({
    description: 'Per-event-type webhook routing configuration',
    example: { deployment_failed: { webhookUrl: 'https://discord.com/api/webhooks/...', channelName: '#alerts' } },
  })
  eventWebhookConfig?: Record<string, { webhookUrl: string; channelName: string }>;

  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({
    description: 'Quiet hours configuration for Discord notifications',
    example: { enabled: true, startTime: '22:00', endTime: '08:00', timezone: 'UTC' },
  })
  quietHoursConfig?: { enabled: boolean; startTime: string; endTime: string; timezone: string };

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  @ApiPropertyOptional({
    description: 'Maximum Discord messages per minute per webhook (1-30, Discord limit)',
    minimum: 1,
    maximum: 30,
  })
  rateLimitPerMinute?: number;

  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({
    description: 'Per-urgency mention configuration',
    example: { critical: '@everyone', normal: null },
  })
  mentionConfig?: Record<string, string | null>;
}

export class DiscordIntegrationStatusDto {
  connected!: boolean;
  name?: string;
  guildName?: string;
  guildId?: string;
  defaultChannelName?: string;
  status?: string;
  eventWebhookConfig?: Record<string, { channelName: string }>;
  quietHoursConfig?: { enabled: boolean; startTime: string; endTime: string; timezone: string } | null;
  rateLimitPerMinute?: number;
  mentionConfig?: Record<string, string | null>;
  messageCount?: number;
  errorCount?: number;
  lastMessageAt?: string;
  connectedAt?: string;
  connectedByName?: string;
}
