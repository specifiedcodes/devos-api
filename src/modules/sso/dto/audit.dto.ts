import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional, IsString, IsInt, Min, Max, IsArray, IsBoolean,
  IsUrl, IsUUID, MaxLength, IsEnum, IsDateString, ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ==================== Query DTOs ====================

export class ListAuditEventsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by event type' })
  @IsString()
  @IsOptional()
  eventType?: string;

  @ApiPropertyOptional({ description: 'Filter by actor user ID' })
  @IsUUID()
  @IsOptional()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Filter by target user ID' })
  @IsUUID()
  @IsOptional()
  targetUserId?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 50 })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number;
}

export class ExportAuditEventsQueryDto {
  @ApiProperty({ description: 'Export format', enum: ['csv', 'json'] })
  @IsEnum(['csv', 'json'])
  format!: 'csv' | 'json';

  @ApiPropertyOptional({ description: 'Filter by event type' })
  @IsString()
  @IsOptional()
  eventType?: string;

  @ApiPropertyOptional({ description: 'Filter by actor user ID' })
  @IsUUID()
  @IsOptional()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Filter by target user ID' })
  @IsUUID()
  @IsOptional()
  targetUserId?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;
}

export class ComplianceReportQueryDto {
  @ApiPropertyOptional({ description: 'Report period start date (ISO 8601). Defaults to 30 days ago.' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Report period end date (ISO 8601). Defaults to now.' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;
}

// ==================== Alert Rule DTOs ====================

export class NotificationChannelDto {
  @ApiProperty({ description: 'Notification channel type', enum: ['email', 'slack', 'discord', 'webhook'] })
  @IsString()
  type!: string;

  @ApiProperty({ description: 'Notification target (email address, channel name, or webhook URL)' })
  @IsString()
  @MaxLength(500)
  target!: string;
}

export class CreateAlertRuleDto {
  @ApiProperty({ description: 'Alert rule name', example: 'Failed SSO Login Alert' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'Alert rule description' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ description: 'Event types that trigger this alert', example: ['sso_login_failure'] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  eventTypes!: string[];

  @ApiPropertyOptional({ description: 'Number of events to trigger alert', default: 1 })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  threshold?: number;

  @ApiPropertyOptional({ description: 'Time window in minutes', default: 5 })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(1440)
  @Type(() => Number)
  windowMinutes?: number;

  @ApiProperty({ description: 'Notification channels', type: [NotificationChannelDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationChannelDto)
  @ArrayMaxSize(10)
  notificationChannels!: NotificationChannelDto[];

  @ApiPropertyOptional({ description: 'Cooldown in minutes between triggers', default: 30 })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(1440)
  @Type(() => Number)
  cooldownMinutes?: number;
}

export class UpdateAlertRuleDto {
  @ApiPropertyOptional({ description: 'Alert rule name' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Alert rule description' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Event types that trigger this alert' })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  eventTypes?: string[];

  @ApiPropertyOptional({ description: 'Number of events to trigger alert' })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  threshold?: number;

  @ApiPropertyOptional({ description: 'Time window in minutes' })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(1440)
  @Type(() => Number)
  windowMinutes?: number;

  @ApiPropertyOptional({ description: 'Notification channels', type: [NotificationChannelDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => NotificationChannelDto)
  @ArrayMaxSize(10)
  notificationChannels?: NotificationChannelDto[];

  @ApiPropertyOptional({ description: 'Whether the alert rule is active' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Cooldown in minutes between triggers' })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(1440)
  @Type(() => Number)
  cooldownMinutes?: number;
}

// ==================== Webhook DTOs ====================

export class CreateWebhookDto {
  @ApiProperty({ description: 'Webhook name', example: 'Splunk SIEM' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'Webhook URL (HTTPS required)', example: 'https://siem.acme.com/api/events' })
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  url!: string;

  @ApiPropertyOptional({ description: 'Shared secret for HMAC signature verification' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  secret?: string;

  @ApiPropertyOptional({ description: 'Event types to deliver (empty = all events)' })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  eventTypes?: string[];

  @ApiPropertyOptional({ description: 'Custom HTTP headers to include' })
  @IsOptional()
  headers?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Number of retries on failure', default: 3 })
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  retryCount?: number;

  @ApiPropertyOptional({ description: 'Request timeout in milliseconds', default: 10000 })
  @IsInt()
  @IsOptional()
  @Min(1000)
  @Max(30000)
  @Type(() => Number)
  timeoutMs?: number;
}

export class UpdateWebhookDto {
  @ApiPropertyOptional({ description: 'Webhook name' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Webhook URL (HTTPS required)' })
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @IsOptional()
  url?: string;

  @ApiPropertyOptional({ description: 'Shared secret for HMAC signature verification' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  secret?: string;

  @ApiPropertyOptional({ description: 'Event types to deliver (empty = all events)' })
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  eventTypes?: string[];

  @ApiPropertyOptional({ description: 'Custom HTTP headers' })
  @IsOptional()
  headers?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Whether the webhook is active' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Number of retries on failure' })
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  retryCount?: number;

  @ApiPropertyOptional({ description: 'Request timeout in milliseconds' })
  @IsInt()
  @IsOptional()
  @Min(1000)
  @Max(30000)
  @Type(() => Number)
  timeoutMs?: number;
}

// ==================== Response DTOs ====================

export class AuditEventResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() eventType!: string;
  @ApiProperty() workspaceId!: string;
  @ApiPropertyOptional() actorId!: string | null;
  @ApiPropertyOptional() targetUserId!: string | null;
  @ApiPropertyOptional() ipAddress!: string | null;
  @ApiPropertyOptional() userAgent!: string | null;
  @ApiProperty() details!: Record<string, unknown>;
  @ApiProperty() createdAt!: string;
}

export class PaginatedAuditEventsResponseDto {
  @ApiProperty({ type: [AuditEventResponseDto] }) events!: AuditEventResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
}

export class AlertRuleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description!: string | null;
  @ApiProperty({ type: [String] }) eventTypes!: string[];
  @ApiProperty() threshold!: number;
  @ApiProperty() windowMinutes!: number;
  @ApiProperty() notificationChannels!: Array<{ type: string; target: string }>;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() cooldownMinutes!: number;
  @ApiPropertyOptional() lastTriggeredAt!: string | null;
  @ApiProperty() triggerCount!: number;
  @ApiProperty() createdAt!: string;
}

export class WebhookResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ type: [String] }) eventTypes!: string[];
  @ApiProperty() headers!: Record<string, string>;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() retryCount!: number;
  @ApiProperty() timeoutMs!: number;
  @ApiPropertyOptional() lastDeliveryAt!: string | null;
  @ApiPropertyOptional() lastDeliveryStatus!: string | null;
  @ApiProperty() consecutiveFailures!: number;
  @ApiProperty() createdAt!: string;
}

export class WebhookDeliveryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() webhookId!: string;
  @ApiProperty() eventId!: string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional() statusCode!: number | null;
  @ApiPropertyOptional() errorMessage!: string | null;
  @ApiProperty() attemptNumber!: number;
  @ApiPropertyOptional() deliveredAt!: string | null;
  @ApiProperty() createdAt!: string;
}

export class ComplianceReportResponseDto {
  @ApiProperty() workspaceId!: string;
  @ApiProperty() period!: { from: string; to: string };
  @ApiProperty() summary!: {
    totalEvents: number;
    totalLogins: number;
    successfulLogins: number;
    failedLogins: number;
    uniqueUsers: number;
    loginSuccessRate: number;
  };
  @ApiProperty() providerHealth!: Array<{
    providerId: string;
    providerType: string;
    providerName: string;
    totalLogins: number;
    successfulLogins: number;
    failedLogins: number;
    successRate: number;
    lastSuccessfulLogin: string | null;
    lastError: string | null;
  }>;
  @ApiProperty() provisioningReport!: {
    totalProvisioned: number;
    jitProvisioned: number;
    scimProvisioned: number;
    deactivated: number;
    updated: number;
  };
  @ApiProperty() enforcementReport!: {
    enforcementEnabled: boolean;
    enforcementChanges: number;
    blockedLogins: number;
    bypassedLogins: number;
  };
}
