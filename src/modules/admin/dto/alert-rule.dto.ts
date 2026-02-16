import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsBoolean,
  IsArray,
  IsObject,
  IsUUID,
  IsISO8601,
  Length,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

/**
 * Alert Rule DTOs
 * Story 14.8: Alert Rules & Notifications (AC6)
 */

export class CreateAlertRuleDto {
  @IsString()
  @Length(1, 255)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(['threshold', 'health_check', 'comparison'])
  ruleType!: 'threshold' | 'health_check' | 'comparison';

  @IsString()
  @Length(1, 500)
  condition!: string;

  @IsEnum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq'])
  operator!: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';

  @IsString()
  @Length(1, 255)
  threshold!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  @Type(() => Number)
  durationSeconds?: number;

  @IsEnum(['critical', 'warning', 'info'])
  severity!: 'critical' | 'warning' | 'info';

  @IsArray()
  @IsString({ each: true })
  channels!: string[];

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86400)
  @Type(() => Number)
  cooldownSeconds?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class UpdateAlertRuleDto extends PartialType(CreateAlertRuleDto) {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class AlertHistoryQueryDto {
  @IsOptional()
  @IsEnum(['critical', 'warning', 'info'])
  severity?: string;

  @IsOptional()
  @IsEnum(['fired', 'acknowledged', 'silenced', 'resolved', 'auto_resolved'])
  status?: string;

  @IsOptional()
  @IsUUID()
  ruleId?: string;

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
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;
}

export class SilenceAlertDto {
  @IsInt()
  @Min(1)
  @Max(1440)
  @Type(() => Number)
  durationMinutes!: number;
}

export class ResolveAlertDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
