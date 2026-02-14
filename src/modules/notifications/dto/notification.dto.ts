/**
 * Notification DTOs
 * Story 10.5: Notification Triggers
 */

import { IsString, IsUUID, IsOptional, IsEnum, IsBoolean, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType, NotificationUrgency } from '../events/notification.events';

/**
 * Create notification trigger request DTO
 */
export class CreateNotificationTriggerDto {
  @ApiProperty({ description: 'Notification type' })
  @IsString()
  type!: NotificationType;

  @ApiProperty({ description: 'Notification payload data' })
  @IsOptional()
  payload!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Target workspace ID' })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @ApiPropertyOptional({ description: 'Target project ID' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Target user ID' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}

/**
 * Notification response DTO
 */
export class NotificationResponseDto {
  @ApiProperty({ description: 'Notification ID' })
  id!: string;

  @ApiProperty({ description: 'Notification type' })
  type!: string;

  @ApiProperty({ description: 'Notification title' })
  title!: string;

  @ApiProperty({ description: 'Notification body' })
  body!: string;

  @ApiPropertyOptional({ description: 'Deep link URL' })
  url?: string;

  @ApiProperty({ description: 'Whether notification has been read' })
  read!: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: Date;
}

/**
 * Notification timing config DTO
 */
export class NotificationTimingConfigDto {
  @ApiProperty({ description: 'Types that should be sent immediately' })
  immediate!: NotificationType[];

  @ApiProperty({ description: 'Types that can be batched' })
  batchable!: NotificationType[];

  @ApiProperty({ description: 'Batch interval in milliseconds' })
  @IsNumber()
  batchIntervalMs!: number;
}

/**
 * Batch notification summary DTO
 */
export class BatchNotificationSummaryDto {
  @ApiProperty({ description: 'Number of notifications in batch' })
  @IsNumber()
  count!: number;

  @ApiProperty({ description: 'Summary message' })
  @IsString()
  message!: string;

  @ApiPropertyOptional({ description: 'Individual notification details' })
  items?: Array<{
    type: string;
    title: string;
    timestamp: number;
  }>;
}
