import {
  IsOptional,
  IsUUID,
  IsEnum,
  IsDateString,
  IsString,
  MaxLength,
  IsInt,
  Min,
  Max,
  IsArray,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PermissionAuditEventType } from '../../../database/entities/permission-audit-event.entity';

export class PermissionAuditQueryDto {
  @ApiPropertyOptional({ description: 'Filter by single event type', enum: PermissionAuditEventType })
  @IsOptional()
  @IsEnum(PermissionAuditEventType)
  eventType?: PermissionAuditEventType;

  @ApiPropertyOptional({ description: 'Filter by multiple event types (comma-separated)' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @IsEnum(PermissionAuditEventType, { each: true })
  eventTypes?: PermissionAuditEventType[];

  @ApiPropertyOptional({ description: 'Filter by actor (user who made the change)' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Filter by target user (user affected by the change)' })
  @IsOptional()
  @IsUUID()
  targetUserId?: string;

  @ApiPropertyOptional({ description: 'Filter by target role' })
  @IsOptional()
  @IsUUID()
  targetRoleId?: string;

  @ApiPropertyOptional({ description: 'Filter events from this date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter events until this date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Search within event data' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ description: 'Number of results per page', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Offset for pagination', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
