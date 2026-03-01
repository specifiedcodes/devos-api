import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsEnum, IsArray, IsObject, IsBoolean, IsInt, Min, Max, MinLength, IsEmail } from 'class-validator';
import { ReportFrequency } from '../../../database/entities/scheduled-report.entity';

export class CreateScheduledReportDto {
  @ApiProperty({ description: 'Report name', example: 'Weekly Sprint Summary' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ description: 'Report frequency', enum: ReportFrequency })
  @IsEnum(ReportFrequency)
  frequency!: ReportFrequency;

  @ApiPropertyOptional({ description: 'Day of week (0-6) for weekly reports', minimum: 0, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional({ description: 'Day of month (1-31) for monthly reports', minimum: 1, maximum: 31 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @ApiPropertyOptional({ description: 'Time in UTC (HH:MM format)', default: '09:00' })
  @IsOptional()
  @IsString()
  timeUtc?: string;

  @ApiProperty({ description: 'Analytics sections to include', type: [String], example: ['velocity', 'burndown', 'cost'] })
  @IsArray()
  @IsString({ each: true })
  sections!: string[];

  @ApiPropertyOptional({ description: 'Filters to apply', type: 'object' })
  @IsOptional()
  @IsObject()
  filters?: Record<string, any>;

  @ApiProperty({ description: 'Email recipients', type: [String], example: ['user@example.com'] })
  @IsArray()
  @IsEmail({}, { each: true })
  recipients!: string[];
}

export class UpdateScheduledReportDto {
  @ApiPropertyOptional({ description: 'Report name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ description: 'Report frequency', enum: ReportFrequency })
  @IsOptional()
  @IsEnum(ReportFrequency)
  frequency?: ReportFrequency;

  @ApiPropertyOptional({ description: 'Day of week (0-6) for weekly reports' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional({ description: 'Day of month (1-31) for monthly reports' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @ApiPropertyOptional({ description: 'Time in UTC (HH:MM format)' })
  @IsOptional()
  @IsString()
  timeUtc?: string;

  @ApiPropertyOptional({ description: 'Analytics sections to include', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sections?: string[];

  @ApiPropertyOptional({ description: 'Filters to apply', type: 'object' })
  @IsOptional()
  @IsObject()
  filters?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Email recipients', type: [String] })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  recipients?: string[];

  @ApiPropertyOptional({ description: 'Whether report is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ScheduledReportResponseDto {
  @ApiProperty({ description: 'Report ID' })
  id!: string;

  @ApiProperty({ description: 'Workspace ID' })
  workspaceId!: string;

  @ApiProperty({ description: 'Report name' })
  name!: string;

  @ApiProperty({ description: 'Report frequency', enum: ReportFrequency })
  frequency!: ReportFrequency;

  @ApiPropertyOptional({ description: 'Day of week (0-6)' })
  dayOfWeek?: number;

  @ApiPropertyOptional({ description: 'Day of month (1-31)' })
  dayOfMonth?: number;

  @ApiProperty({ description: 'Time in UTC (HH:MM)' })
  timeUtc!: string;

  @ApiProperty({ description: 'Analytics sections', type: [String] })
  sections!: string[];

  @ApiProperty({ description: 'Filters', type: 'object' })
  filters!: Record<string, any>;

  @ApiProperty({ description: 'Email recipients', type: [String] })
  recipients!: string[];

  @ApiProperty({ description: 'Active status' })
  isActive!: boolean;

  @ApiPropertyOptional({ description: 'Last sent timestamp' })
  lastSentAt?: Date;

  @ApiProperty({ description: 'Creator user ID' })
  createdBy!: string;

  @ApiProperty({ description: 'Created at' })
  createdAt!: Date;

  @ApiProperty({ description: 'Updated at' })
  updatedAt!: Date;
}
