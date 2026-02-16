import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsISO8601,
  MaxLength,
  IsObject,
  IsBoolean,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Admin Audit Log DTOs
 * Story 14.10: Audit Log Viewer (AC5)
 */

export class AdminAuditLogQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  userEmail?: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  actionPrefix?: string;

  @IsOptional()
  @IsString()
  resourceType?: string;

  @IsOptional()
  @IsString()
  resourceId?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class AdminAuditLogStatsDto {
  @IsISO8601()
  startDate!: string;

  @IsISO8601()
  endDate!: string;
}

export class CreateSavedSearchDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsObject()
  filters!: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean = false;
}

export class AuditLogEntryDto {
  id!: string;
  timestamp!: Date;
  userId!: string;
  userEmail!: string | null;
  workspaceId!: string;
  action!: string;
  resourceType!: string;
  resourceId!: string;
  ipAddress!: string | null;
  userAgent!: string | null;
  metadata!: Record<string, any> | null;
}

export class AuditLogDetailDto extends AuditLogEntryDto {
  // Full detail includes all fields from AuditLogEntryDto
  // plus expanded metadata
}

export class AuditLogStatsResponse {
  totalEvents!: number;
  eventsByAction!: { action: string; count: number }[];
  eventsByResourceType!: { resourceType: string; count: number }[];
  eventsByUser!: { userId: string; userEmail: string | null; count: number }[];
  securityEvents!: number;
  adminEvents!: number;
}
