import {
  IsBoolean,
  IsOptional,
  IsNumber,
  IsString,
  IsUUID,
  IsObject,
  Min,
  Max,
  ValidateNested,
  IsIn,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  SoundFile,
  AgentNotificationSettings,
  NotificationTypeSettings,
  DNDSchedule,
} from '../../../database/entities/notification-preferences.entity';

/**
 * DTO for sound settings
 */
export class SoundSettingsDto {
  @ApiPropertyOptional({ description: 'Volume level (0-1)', minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  volume?: number;

  @ApiPropertyOptional({ description: 'Sound file', enum: ['default', 'subtle', 'chime', 'none'] })
  @IsOptional()
  @IsString()
  @IsIn(['default', 'subtle', 'chime', 'none'])
  soundFile?: SoundFile;
}

/**
 * DTO for DND schedule
 */
export class DNDScheduleDto {
  @ApiProperty({ description: 'Start time (HH:mm)', example: '22:00' })
  @IsString()
  startTime!: string;

  @ApiProperty({ description: 'End time (HH:mm)', example: '08:00' })
  @IsString()
  endTime!: string;

  @ApiProperty({ description: 'Timezone', example: 'America/New_York' })
  @IsString()
  timezone!: string;

  @ApiProperty({ description: 'Days of week (0=Sun, 6=Sat)', example: [0, 1, 2, 3, 4, 5, 6] })
  @IsArray()
  @IsNumber({}, { each: true })
  daysOfWeek!: number[];
}

/**
 * DTO for DND settings
 */
export class DNDSettingsDto {
  @ApiProperty({ description: 'Whether DND is enabled' })
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({ description: 'DND schedule' })
  @IsOptional()
  @ValidateNested()
  @Type(() => DNDScheduleDto)
  schedule?: DNDScheduleDto;
}

/**
 * DTO for notification type settings
 */
export class NotificationTypeSettingsDto {
  @ApiPropertyOptional({ description: 'Chat messages notifications' })
  @IsOptional()
  @IsBoolean()
  chatMessages?: boolean;

  @ApiPropertyOptional({ description: 'Status updates notifications' })
  @IsOptional()
  @IsBoolean()
  statusUpdates?: boolean;

  @ApiPropertyOptional({ description: 'Task completions notifications' })
  @IsOptional()
  @IsBoolean()
  taskCompletions?: boolean;

  @ApiPropertyOptional({ description: 'Error notifications' })
  @IsOptional()
  @IsBoolean()
  errors?: boolean;

  @ApiPropertyOptional({ description: 'Mention notifications' })
  @IsOptional()
  @IsBoolean()
  mentions?: boolean;
}

/**
 * DTO for updating notification preferences
 */
export class UpdateNotificationPreferencesDto {
  @ApiProperty({ description: 'Workspace ID' })
  @IsUUID()
  workspaceId!: string;

  @ApiPropertyOptional({ description: 'Master enabled toggle' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Push notifications enabled' })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Sound notifications enabled' })
  @IsOptional()
  @IsBoolean()
  soundEnabled?: boolean;

  @ApiPropertyOptional({ description: 'DND settings' })
  @IsOptional()
  @ValidateNested()
  @Type(() => DNDSettingsDto)
  dnd?: DNDSettingsDto;

  @ApiPropertyOptional({ description: 'Per-agent settings' })
  @IsOptional()
  @IsObject()
  agentSettings?: Record<string, AgentNotificationSettings>;

  @ApiPropertyOptional({ description: 'Notification type settings' })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationTypeSettingsDto)
  typeSettings?: NotificationTypeSettingsDto;

  @ApiPropertyOptional({ description: 'Sound settings' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SoundSettingsDto)
  soundSettings?: SoundSettingsDto;
}

/**
 * DTO for getting notification preferences
 */
export class GetNotificationPreferencesDto {
  @ApiProperty({ description: 'Workspace ID' })
  @IsUUID()
  workspaceId!: string;
}

/**
 * Response DTO for notification preferences
 */
export class NotificationPreferencesResponseDto {
  @ApiProperty({ description: 'Preference ID' })
  id!: string;

  @ApiProperty({ description: 'User ID' })
  userId!: string;

  @ApiProperty({ description: 'Workspace ID' })
  workspaceId!: string;

  @ApiProperty({ description: 'Master enabled toggle' })
  enabled!: boolean;

  @ApiProperty({ description: 'Push notifications enabled' })
  pushEnabled!: boolean;

  @ApiProperty({ description: 'Sound notifications enabled' })
  soundEnabled!: boolean;

  @ApiProperty({ description: 'DND settings' })
  dnd!: {
    enabled: boolean;
    schedule?: DNDSchedule;
  };

  @ApiProperty({ description: 'Per-agent settings' })
  agentSettings!: Record<string, AgentNotificationSettings>;

  @ApiProperty({ description: 'Notification type settings' })
  typeSettings!: NotificationTypeSettings;

  @ApiProperty({ description: 'Sound settings' })
  soundSettings!: {
    volume: number;
    soundFile: SoundFile;
  };

  @ApiProperty({ description: 'Created at timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Updated at timestamp' })
  updatedAt!: Date;
}
