import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsArray,
  IsUUID,
  IsISO8601,
  IsUrl,
  Length,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Incident DTOs
 * Story 14.9: Incident Management (AC7)
 */

export class CreateIncidentDto {
  @IsString()
  @Length(1, 255)
  title!: string;

  @IsString()
  @Length(1, 5000)
  description!: string;

  @IsEnum(['critical', 'major', 'minor'])
  severity!: 'critical' | 'major' | 'minor';

  @IsArray()
  @IsString({ each: true })
  affectedServices!: string[];

  @IsOptional()
  @IsUUID()
  alertHistoryId?: string;
}

export class AddIncidentUpdateDto {
  @IsString()
  @Length(1, 5000)
  message!: string;

  @IsEnum(['investigating', 'identified', 'monitoring'])
  status!: 'investigating' | 'identified' | 'monitoring';
}

export class ResolveIncidentDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;

  @IsOptional()
  @IsUrl()
  postMortemUrl?: string;
}

export class UpdateIncidentDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  description?: string;

  @IsOptional()
  @IsEnum(['critical', 'major', 'minor'])
  severity?: 'critical' | 'major' | 'minor';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  affectedServices?: string[];

  @IsOptional()
  @IsUrl()
  postMortemUrl?: string;
}

export class IncidentQueryDto {
  @IsOptional()
  @IsEnum(['investigating', 'identified', 'monitoring', 'resolved'])
  status?: string;

  @IsOptional()
  @IsEnum(['critical', 'major', 'minor'])
  severity?: string;

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
  limit?: number = 20;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;
}
