/**
 * Notification Preferences DTOs
 * Story 10.6: Configurable Notification Preferences
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsObject,
  IsString,
  ValidateNested,
  Matches,
  Min,
  Max,
  IsNumber,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * Custom validator for IANA timezone strings
 */
@ValidatorConstraint({ name: 'isValidTimezone', async: false })
export class IsValidTimezoneConstraint implements ValidatorConstraintInterface {
  validate(timezone: string): boolean {
    if (!timezone || typeof timezone !== 'string') return false;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.value} is not a valid IANA timezone. Use format like "America/New_York" or "Europe/London"`;
  }
}
import { Type } from 'class-transformer';
import {
  EventNotificationSettings,
  ChannelPreferences,
  QuietHoursConfig,
  NotificationTypeSettings,
  AgentNotificationSettings,
  DNDSchedule,
  SoundFile,
} from '../../../database/entities/notification-preferences.entity';

/**
 * Event notification settings DTO
 */
export class EventNotificationSettingsDto implements Partial<EventNotificationSettings> {
  @ApiPropertyOptional({ description: 'Epic completion notifications' })
  @IsOptional()
  @IsBoolean()
  epicCompletions?: boolean;

  @ApiPropertyOptional({ description: 'Story completion notifications' })
  @IsOptional()
  @IsBoolean()
  storyCompletions?: boolean;

  @ApiPropertyOptional({ description: 'Deployment success notifications' })
  @IsOptional()
  @IsBoolean()
  deploymentSuccess?: boolean;

  @ApiPropertyOptional({ description: 'Deployment failure notifications (critical - cannot be disabled)' })
  @IsOptional()
  @IsBoolean()
  deploymentFailure?: boolean;

  @ApiPropertyOptional({ description: 'Agent error notifications (critical - cannot be disabled)' })
  @IsOptional()
  @IsBoolean()
  agentErrors?: boolean;

  @ApiPropertyOptional({ description: 'Agent message notifications' })
  @IsOptional()
  @IsBoolean()
  agentMessages?: boolean;

  @ApiPropertyOptional({ description: 'Status update notifications' })
  @IsOptional()
  @IsBoolean()
  statusUpdates?: boolean;
}

/**
 * Channel preferences DTO
 */
export class ChannelPreferencesDto implements Partial<ChannelPreferences> {
  @ApiPropertyOptional({ description: 'Push notification channel' })
  @IsOptional()
  @IsBoolean()
  push?: boolean;

  @ApiPropertyOptional({ description: 'In-app notification channel (always enabled)' })
  @IsOptional()
  @IsBoolean()
  inApp?: boolean;

  @ApiPropertyOptional({ description: 'Email notification channel (future)' })
  @IsOptional()
  @IsBoolean()
  email?: boolean;
}

/**
 * Quiet hours configuration DTO
 */
export class QuietHoursConfigDto implements Partial<QuietHoursConfig> {
  @ApiPropertyOptional({ description: 'Enable quiet hours' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Start time in HH:MM format', example: '22:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'startTime must be in HH:MM format',
  })
  startTime?: string;

  @ApiPropertyOptional({ description: 'End time in HH:MM format', example: '08:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'endTime must be in HH:MM format',
  })
  endTime?: string;

  @ApiPropertyOptional({ description: 'Timezone (IANA format)', example: 'America/New_York' })
  @IsOptional()
  @IsString()
  @Validate(IsValidTimezoneConstraint)
  timezone?: string;

  @ApiPropertyOptional({ description: 'Allow critical notifications during quiet hours' })
  @IsOptional()
  @IsBoolean()
  exceptCritical?: boolean;
}

/**
 * Update notification preferences DTO
 */
export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ description: 'Enable notifications globally' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable push notifications' })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable sound notifications' })
  @IsOptional()
  @IsBoolean()
  soundEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Sound volume (0.0 - 1.0)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  soundVolume?: number;

  @ApiPropertyOptional({ description: 'Sound file to use' })
  @IsOptional()
  @IsString()
  soundFile?: SoundFile;

  @ApiPropertyOptional({ description: 'Enable DND mode' })
  @IsOptional()
  @IsBoolean()
  dndEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Event notification settings' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EventNotificationSettingsDto)
  eventSettings?: EventNotificationSettingsDto;

  @ApiPropertyOptional({ description: 'Channel preferences' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ChannelPreferencesDto)
  channelPreferences?: ChannelPreferencesDto;

  @ApiPropertyOptional({ description: 'Quiet hours configuration' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => QuietHoursConfigDto)
  quietHours?: QuietHoursConfigDto;

  @ApiPropertyOptional({ description: 'In-app notifications enabled (always true)' })
  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Email notifications enabled' })
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;
}

/**
 * Notification preferences response DTO
 */
export class NotificationPreferencesResponseDto {
  @ApiProperty({ description: 'Preferences ID' })
  id!: string;

  @ApiProperty({ description: 'User ID' })
  userId!: string;

  @ApiProperty({ description: 'Workspace ID' })
  workspaceId!: string;

  @ApiProperty({ description: 'Notifications enabled globally' })
  enabled!: boolean;

  @ApiProperty({ description: 'Push notifications enabled' })
  pushEnabled!: boolean;

  @ApiProperty({ description: 'Sound notifications enabled' })
  soundEnabled!: boolean;

  @ApiProperty({ description: 'Sound volume' })
  soundVolume!: number;

  @ApiProperty({ description: 'Sound file' })
  soundFile!: SoundFile;

  @ApiProperty({ description: 'DND enabled' })
  dndEnabled!: boolean;

  @ApiPropertyOptional({ description: 'DND schedule' })
  dndSchedule?: DNDSchedule;

  @ApiProperty({ description: 'Agent-specific settings' })
  agentSettings!: Record<string, AgentNotificationSettings>;

  @ApiProperty({ description: 'Legacy type settings' })
  typeSettings!: NotificationTypeSettings;

  @ApiProperty({ description: 'Event notification settings' })
  eventSettings!: EventNotificationSettings;

  @ApiProperty({ description: 'Channel preferences' })
  channelPreferences!: ChannelPreferences;

  @ApiPropertyOptional({ description: 'Per-type channel overrides' })
  perTypeChannelOverrides?: Record<string, Partial<ChannelPreferences>>;

  @ApiProperty({ description: 'In-app notifications enabled' })
  inAppEnabled!: boolean;

  @ApiProperty({ description: 'Email notifications enabled' })
  emailEnabled!: boolean;

  @ApiProperty({ description: 'Quiet hours configuration' })
  quietHours!: QuietHoursConfig;

  @ApiProperty({ description: 'Created timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Updated timestamp' })
  updatedAt!: Date;
}

/**
 * Quiet hours status response DTO
 */
export class QuietHoursStatusDto {
  @ApiProperty({ description: 'Whether currently in quiet hours' })
  inQuietHours!: boolean;

  @ApiPropertyOptional({ description: 'When quiet hours end (ISO string)' })
  endsAt?: string;

  @ApiPropertyOptional({ description: 'User timezone' })
  timezone?: string;
}
