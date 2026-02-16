/**
 * Push Notification DTOs
 * Story 10.4: Push Notifications Setup
 * Story 16.7: VAPID Key Web Push Setup (admin DTOs)
 *
 * Request and response DTOs for push notification endpoints.
 */

import { IsString, IsUUID, IsOptional, IsObject, IsBoolean, IsNumber, IsEnum, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Push subscription keys DTO
 */
export class PushSubscriptionKeysDto {
  @ApiProperty({ description: 'P-256 Diffie-Hellman public key' })
  @IsString()
  p256dh!: string;

  @ApiProperty({ description: 'Authentication secret' })
  @IsString()
  auth!: string;
}

/**
 * Create push subscription request DTO
 */
export class CreatePushSubscriptionDto {
  @ApiProperty({ description: 'Push service endpoint URL' })
  @IsString()
  endpoint!: string;

  @ApiProperty({ description: 'Encryption keys', type: PushSubscriptionKeysDto })
  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;

  @ApiPropertyOptional({ description: 'Subscription expiration timestamp (ms)' })
  @IsOptional()
  @IsNumber()
  expirationTime?: number | null;

  @ApiPropertyOptional({ description: 'Browser user agent' })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiPropertyOptional({ description: 'Device name for identification' })
  @IsOptional()
  @IsString()
  deviceName?: string;
}

/**
 * Push subscription response DTO
 */
export class PushSubscriptionResponseDto {
  @ApiProperty({ description: 'Subscription ID' })
  id!: string;

  @ApiProperty({ description: 'User ID' })
  userId!: string;

  @ApiProperty({ description: 'Workspace ID' })
  workspaceId!: string;

  @ApiProperty({ description: 'Push service endpoint' })
  endpoint!: string;

  @ApiPropertyOptional({ description: 'Device name' })
  deviceName?: string;

  @ApiProperty({ description: 'Created at timestamp' })
  createdAt!: Date;

  @ApiPropertyOptional({ description: 'Last used timestamp' })
  lastUsedAt?: Date;
}

/**
 * Push config response DTO (public endpoint)
 */
export class PushConfigResponseDto {
  @ApiProperty({ description: 'VAPID public key for client subscription' })
  vapidPublicKey!: string;

  @ApiProperty({ description: 'Whether push notifications are supported' })
  supported!: boolean;
}

/**
 * Notification action button DTO
 */
export class NotificationActionDto {
  @ApiProperty({ description: 'Action identifier' })
  @IsString()
  action!: string;

  @ApiProperty({ description: 'Button text' })
  @IsString()
  title!: string;

  @ApiPropertyOptional({ description: 'Action icon URL' })
  @IsOptional()
  @IsString()
  icon?: string;
}

/**
 * Notification urgency levels
 */
export enum NotificationUrgency {
  VERY_LOW = 'very-low',
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
}

/**
 * Push notification payload DTO
 */
export class PushNotificationPayloadDto {
  @ApiProperty({ description: 'Notification ID' })
  @IsString()
  id!: string;

  @ApiProperty({ description: 'Notification title' })
  @IsString()
  title!: string;

  @ApiProperty({ description: 'Notification body text' })
  @IsString()
  body!: string;

  @ApiPropertyOptional({ description: 'Icon URL' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ description: 'Badge icon URL' })
  @IsOptional()
  @IsString()
  badge?: string;

  @ApiProperty({ description: 'Deep link URL' })
  @IsString()
  url!: string;

  @ApiProperty({ description: 'Notification type' })
  @IsString()
  type!: string;

  @ApiPropertyOptional({ description: 'Grouping tag' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ description: 'Re-alert for same tag' })
  @IsOptional()
  @IsBoolean()
  renotify?: boolean;

  @ApiPropertyOptional({ description: 'Prevent auto-dismiss' })
  @IsOptional()
  @IsBoolean()
  requireInteraction?: boolean;

  @ApiPropertyOptional({ description: 'Action buttons', type: [NotificationActionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationActionDto)
  actions?: NotificationActionDto[];

  @ApiPropertyOptional({ description: 'Event timestamp (ms)' })
  @IsOptional()
  @IsNumber()
  timestamp?: number;

  @ApiPropertyOptional({ description: 'Notification urgency', enum: NotificationUrgency })
  @IsOptional()
  @IsEnum(NotificationUrgency)
  urgency?: NotificationUrgency;
}

/**
 * Send push notification request DTO
 */
export class SendPushNotificationDto {
  @ApiPropertyOptional({ description: 'Target user ID (send to specific user)' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Target workspace ID (send to all users in workspace)' })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;

  @ApiProperty({ description: 'Notification payload', type: PushNotificationPayloadDto })
  @ValidateNested()
  @Type(() => PushNotificationPayloadDto)
  payload!: PushNotificationPayloadDto;
}

/**
 * Push result DTO
 */
export class PushResultDto {
  @ApiProperty({ description: 'Subscription ID' })
  subscriptionId!: string;

  @ApiProperty({ description: 'Whether send was successful' })
  success!: boolean;

  @ApiPropertyOptional({ description: 'Error message if failed' })
  error?: string;
}

/**
 * Send push notification response DTO
 */
export class SendPushNotificationResponseDto {
  @ApiProperty({ description: 'Number of successful sends' })
  successful!: number;

  @ApiProperty({ description: 'Number of failed sends' })
  failed!: number;

  @ApiProperty({ description: 'Detailed results', type: [PushResultDto] })
  results!: PushResultDto[];
}

/**
 * VAPID key status response DTO
 * Story 16.7: VAPID Key Web Push Setup
 */
export class VapidKeyStatusResponseDto {
  @ApiProperty({ description: 'Whether VAPID keys are properly configured' })
  configured!: boolean;

  @ApiProperty({ description: 'Whether public key is present' })
  publicKeyPresent!: boolean;

  @ApiProperty({ description: 'Whether private key is present' })
  privateKeyPresent!: boolean;

  @ApiProperty({ description: 'Whether VAPID subject is configured' })
  subjectConfigured!: boolean;

  @ApiProperty({ description: 'First 8 characters of public key for identification' })
  publicKeyPrefix!: string;

  @ApiProperty({ description: 'VAPID subject (mailto: address)' })
  subject!: string;

  @ApiProperty({ description: 'Key format validation status', enum: ['valid', 'invalid', 'missing'] })
  keyFormat!: 'valid' | 'invalid' | 'missing';

  @ApiPropertyOptional({ description: 'ISO timestamp of last key rotation' })
  lastRotatedAt?: string;
}

/**
 * Push subscription statistics response DTO
 * Story 16.7: VAPID Key Web Push Setup
 */
export class PushSubscriptionStatsDto {
  @ApiProperty({ description: 'Total active subscriptions' })
  total!: number;

  @ApiProperty({ description: 'Count of stale subscriptions (past threshold)' })
  staleCount!: number;

  @ApiProperty({ description: 'Count of expired subscriptions' })
  expiredCount!: number;
}

/**
 * Push delivery statistics DTO
 * Story 16.7: VAPID Key Web Push Setup
 */
export class PushDeliveryStatsDto {
  @ApiProperty({ description: 'Total notifications sent successfully' })
  totalSent!: number;

  @ApiProperty({ description: 'Total notifications that failed' })
  totalFailed!: number;

  @ApiProperty({ description: 'Total expired subscriptions auto-removed' })
  totalExpiredRemoved!: number;
}

/**
 * Cleanup result DTO
 * Story 16.7: VAPID Key Web Push Setup
 */
export class CleanupResultDto {
  @ApiProperty({ description: 'Number of stale subscriptions removed' })
  staleRemoved!: number;

  @ApiProperty({ description: 'Number of expired subscriptions removed' })
  expiredRemoved!: number;

  @ApiProperty({ description: 'Total subscriptions removed' })
  totalRemoved!: number;

  @ApiProperty({ description: 'ISO timestamp of cleanup execution' })
  executedAt!: string;

  @ApiProperty({ description: 'Cleanup duration in milliseconds' })
  durationMs!: number;
}

/**
 * Combined push statistics response DTO
 * Story 16.7: VAPID Key Web Push Setup
 */
export class PushStatsResponseDto {
  @ApiProperty({ description: 'Subscription statistics', type: PushSubscriptionStatsDto })
  subscriptions!: PushSubscriptionStatsDto;

  @ApiProperty({ description: 'Delivery statistics', type: PushDeliveryStatsDto })
  delivery!: PushDeliveryStatsDto;

  @ApiPropertyOptional({ description: 'Last cleanup result', type: CleanupResultDto })
  lastCleanup?: CleanupResultDto;
}
