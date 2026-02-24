import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  IsIn,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum WebhookEventType {
  PERMISSION_CHANGED = 'permission.changed',
  ROLE_CREATED = 'role.created',
  ROLE_UPDATED = 'role.updated',
  ROLE_DELETED = 'role.deleted',
  MEMBER_ROLE_CHANGED = 'member.role_changed',
  IP_ALLOWLIST_CHANGED = 'ip_allowlist.changed',
  GEO_RESTRICTION_CHANGED = 'geo_restriction.changed',
}

const VALID_EVENT_TYPES = Object.values(WebhookEventType);

export class CreatePermissionWebhookDto {
  @ApiProperty({ description: 'Webhook URL (HTTPS only)', example: 'https://example.com/webhook' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Matches(/^https:\/\//, { message: 'Webhook URL must use HTTPS' })
  url!: string;

  @ApiProperty({
    description: 'Event types to subscribe to',
    example: ['permission.changed', 'role.updated'],
    enum: WebhookEventType,
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(VALID_EVENT_TYPES, { each: true })
  eventTypes!: string[];
}
