import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsIn,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { WebhookEventType } from './create-permission-webhook.dto';

const VALID_EVENT_TYPES = Object.values(WebhookEventType);

export class UpdatePermissionWebhookDto {
  @ApiPropertyOptional({ description: 'Webhook URL (HTTPS only)', example: 'https://example.com/webhook' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^https:\/\//, { message: 'Webhook URL must use HTTPS' })
  url?: string;

  @ApiPropertyOptional({
    description: 'Event types to subscribe to',
    example: ['permission.changed', 'role.updated'],
    enum: WebhookEventType,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsIn(VALID_EVENT_TYPES, { each: true })
  eventTypes?: string[];

  @ApiPropertyOptional({ description: 'Whether the webhook is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
