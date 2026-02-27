/**
 * Webhook DTOs
 * Story 21-8: Webhook Management (AC5)
 *
 * DTO classes for webhook CRUD operations with proper validation.
 */

import {
  IsNotEmpty, IsOptional, IsString, IsBoolean, IsArray,
  IsUrl, IsInt, Min, Max, MaxLength, ArrayMaxSize, IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DeliveryStatus } from '../../../../database/entities/webhook-delivery-log.entity';

export class CreateWebhookDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsNotEmpty()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  events!: string[];

  @IsOptional()
  headers?: Record<string, string>;
}

export class UpdateWebhookDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  events?: string[];

  @IsOptional()
  headers?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class WebhookResponseDto {
  id!: string;
  name!: string;
  url!: string;
  events!: string[];
  isActive!: boolean;
  failureCount!: number;
  consecutiveFailures!: number;
  lastTriggeredAt!: string | null;
  lastDeliveryStatus!: string | null;
  createdBy!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class WebhookCreatedResponseDto extends WebhookResponseDto {
  /** The HMAC signing secret. Shown only once at creation time. */
  secret!: string;
}

export class DeliveryLogQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsIn(Object.values(DeliveryStatus), {
    message: `status must be one of: ${Object.values(DeliveryStatus).join(', ')}`,
  })
  status?: string;
}

export class TestWebhookDto {
  @IsOptional()
  @IsString()
  eventType?: string;
}

export class DeliveryLogResponseDto {
  id!: string;
  webhookId!: string;
  eventType!: string;
  status!: string;
  responseCode!: number | null;
  errorMessage!: string | null;
  attemptNumber!: number;
  maxAttempts!: number;
  durationMs!: number | null;
  nextRetryAt!: string | null;
  createdAt!: string;
}
